import * as THREE from 'three';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { TEXTURE_SIZE } from '../textures/PixelCanvas';

/** 同时存在的粒子数上限（超出时最旧的被复用）。 */
const MAX_PARTICLES = 2048;
/** 粒子取样的贴图边长（像素）：像 1.8.9 一样从方块贴图里抠一小块。 */
const PARTICLE_TEXEL = 2;
/** 重力加速度（格/秒²）与空气阻力（每秒保留比例）。 */
const PARTICLE_GRAVITY = -16;
const PARTICLE_DRAG = 0.86;
/** 触地后的反弹保留比例。 */
const PARTICLE_BOUNCE = 0.35;
const DEFAULT_SIZE = 0.1;

/** 顶点着色器：uvSpan 是每个粒子在图集上占的 uv 边长，随图集尺寸编译进去。 */
const vertexShader = (uvSpan: number): string => /* glsl */ `
const float uUvSpan = ${uvSpan.toFixed(8)};
attribute vec2 aUvOffset;
attribute float aSize;
attribute float aBrightness;
varying vec2 vUv;
varying float vBrightness;
void main() {
  vUv = aUvOffset + uv * uUvSpan;
  vBrightness = aBrightness;
  // 广告牌：把实例原点变换到相机空间后，直接在屏幕平面上展开四边形
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vBrightness;
void main() {
  vec4 texel = texture2D(uAtlas, vUv);
  if (texel.a < 0.5) {
    discard;
  }
  gl_FragColor = vec4(texel.rgb * vBrightness, 1.0);
}
`;

/** 一个粒子的运行时状态。 */
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 剩余寿命（秒）。 */
  life: number;
  size: number;
  brightness: number;
  active: boolean;
}

/** 生成粒子时的可选参数。 */
export interface ParticleOptions {
  /** 初速度的随机范围（格/秒）。 */
  speed?: number;
  /** 寿命范围（秒）。 */
  minLife?: number;
  maxLife?: number;
  size?: number;
  brightness?: number;
}

/**
 * 方块碎屑等小粒子：一批朝向相机的实例化四边形，从方块图集里取 2×2 像素作为贴图。
 * 模拟在 CPU 上做（重力 + 阻力 + 简单落地），每帧写入实例矩阵。
 */
export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly uvOffsets: THREE.InstancedBufferAttribute;
  private readonly sizes: THREE.InstancedBufferAttribute;
  private readonly brightness: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private next = 0;
  /** 当前活跃粒子数（为 0 时 update 直接返回）。 */
  private activeCount = 0;
  /** 自上次上传后有没有新生成的粒子（uv / 大小 / 亮度只在生成时变）。 */
  private attributesDirty = false;
  /** 有粒子受重力时用来判断落地的回调（由 Game 注入世界查询）。 */
  private isSolidAt: (x: number, y: number, z: number) => boolean = () => false;

  constructor(private readonly atlas: TextureAtlas) {
    const geometry = new THREE.InstancedBufferGeometry();
    const plane = new THREE.PlaneGeometry(1, 1);
    geometry.index = plane.index;
    geometry.attributes.position = plane.attributes.position;
    geometry.attributes.uv = plane.attributes.uv;
    plane.dispose();
    this.uvOffsets = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 2), 2);
    this.sizes = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    this.brightness = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    geometry.setAttribute('aUvOffset', this.uvOffsets);
    geometry.setAttribute('aSize', this.sizes);
    geometry.setAttribute('aBrightness', this.brightness);
    const uvSpan = PARTICLE_TEXEL / (atlas.tilesPerRow * TEXTURE_SIZE);
    const material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas.texture } },
      vertexShader: vertexShader(uvSpan),
      fragmentShader: FRAGMENT_SHADER,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX_PARTICLES;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, size: 0, brightness: 1, active: false });
      this.mesh.setMatrixAt(i, this.hidden);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 注入世界碰撞查询（粒子落地用）。 */
  setSolidTest(test: (x: number, y: number, z: number) => boolean): void {
    this.isSolidAt = test;
  }

  /**
   * 在一个方块的位置炸出一批碎屑。
   * @param textureKey 取样的方块贴图 key
   */
  spawnBlockBreak(x: number, y: number, z: number, textureKey: string, count: number, brightness: number): void {
    for (let i = 0; i < count; i++) {
      this.spawn(x + Math.random(), y + Math.random(), z + Math.random(), textureKey, {
        speed: 2.5,
        minLife: 0.4,
        maxLife: 0.9,
        brightness,
      });
    }
  }

  /** 生成单个粒子。 */
  spawn(x: number, y: number, z: number, textureKey: string, options: ParticleOptions = {}): void {
    const index = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    const p = this.particles[index];
    const speed = options.speed ?? 2;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = (Math.random() - 0.5) * speed;
    p.vy = Math.random() * speed * 0.8;
    p.vz = (Math.random() - 0.5) * speed;
    const minLife = options.minLife ?? 0.4;
    p.life = minLife + Math.random() * ((options.maxLife ?? 0.9) - minLife);
    p.size = options.size ?? DEFAULT_SIZE;
    p.brightness = options.brightness ?? 1;
    if (!p.active) {
      p.active = true;
      this.activeCount++;
    }
    this.attributesDirty = true;
    const region = this.atlas.region(textureKey);
    const span = (region.u1 - region.u0) * (1 - PARTICLE_TEXEL / TEXTURE_SIZE);
    this.uvOffsets.setXY(index, region.u0 + Math.random() * span, region.v0 + Math.random() * span);
    this.sizes.setX(index, p.size);
    this.brightness.setX(index, p.brightness);
  }

  /** 推进模拟并写入实例数据；没有活跃粒子时直接返回，不空扫 2048 个槽。 */
  update(dt: number): void {
    if (this.activeCount === 0) {
      return;
    }
    const drag = Math.pow(PARTICLE_DRAG, dt);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.activeCount--;
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      p.vy += PARTICLE_GRAVITY * dt;
      p.vx *= drag;
      p.vz *= drag;
      const ny = p.y + p.vy * dt;
      if (p.vy < 0 && this.isSolidAt(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) {
        p.vy = -p.vy * PARTICLE_BOUNCE;
        p.vx *= PARTICLE_BOUNCE;
        p.vz *= PARTICLE_BOUNCE;
      } else {
        p.y = ny;
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      this.matrix.makeTranslation(p.x, p.y, p.z);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    // 矩阵每帧都变；uv / 大小 / 亮度只在生成时写，没新粒子就不重传
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.attributesDirty) {
      this.attributesDirty = false;
      this.uvOffsets.needsUpdate = true;
      this.sizes.needsUpdate = true;
      this.brightness.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
