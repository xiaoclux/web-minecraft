import * as THREE from 'three';
import { DEFAULT_RENDER_DISTANCE } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import type { World } from '../world/World';
import { BlockOutline } from './BlockOutline';
import { ChunkRenderer } from './ChunkRenderer';
import { EntityRenderer } from './EntityRenderer';
import { HandRenderer } from './HandRenderer';
import { ParticleSystem } from './ParticleSystem';
import { SignRenderer } from './SignRenderer';
import type { BlockEntityStore } from '../world/BlockEntityStore';
import { Sky } from './Sky';

const CAMERA_FOV = 70;
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 400;
/** 像素比上限：Retina 屏按 1 渲染即可（贴图本就是像素风），否则 4 倍片元开销。 */
const MAX_PIXEL_RATIO = 1;
const AMBIENT_MIN = 0.35;
/** 下雨时天光压暗的比例、雾色混入的灰色与比例。 */
const RAIN_DARKEN = 0.35;
const RAIN_FOG_COLOR = new THREE.Color(0x5a6472);
const UNDERWATER_FOG_COLOR = new THREE.Color(0x1a3a8a);
const RAIN_FOG_MIX = 0.7;
const SUN_INTENSITY = 1.2;

/** three.js 场景装配。 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly chunks: ChunkRenderer;
  readonly entities: EntityRenderer;
  readonly sky = new Sky();
  readonly outline: BlockOutline;
  readonly hand: HandRenderer;
  readonly particles: ParticleSystem;
  readonly signs: SignRenderer;
  private readonly ambient: THREE.AmbientLight;
  private readonly sun: THREE.DirectionalLight;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement, world: World, atlas: TextureAtlas, blockEntities: BlockEntityStore) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.autoClear = true;
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
    this.chunks = new ChunkRenderer(world, atlas, DEFAULT_RENDER_DISTANCE);
    this.chunks.setRenderDistance(DEFAULT_RENDER_DISTANCE);
    this.entities = new EntityRenderer(world);
    this.ambient = new THREE.AmbientLight(0xffffff, AMBIENT_MIN);
    this.sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    this.sun.position.set(0.4, 1, 0.6);
    this.hand = new HandRenderer(atlas);
    this.outline = new BlockOutline(atlas);
    this.particles = new ParticleSystem(atlas);
    this.signs = new SignRenderer(world, blockEntities);
    this.particles.setSolidTest((x, y, z) => world.isSolidAt(x, y, z));
    this.scene.add(
      this.chunks.group,
      this.entities.group,
      this.signs.group,
      this.sky.group,
      this.outline.group,
      this.particles.mesh,
      this.ambient,
      this.sun,
    );
    this.camera.add(this.hand.group);
    this.scene.add(this.camera);
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
  }

  private currentRenderDistance = DEFAULT_RENDER_DISTANCE;

  /** 设置渲染距离。 */
  setRenderDistance(distance: number): void {
    this.currentRenderDistance = distance;
    this.chunks.setRenderDistance(distance);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 换维度：区块与实体渲染都切到新世界。 */
  setWorld(world: World, blockEntities: BlockEntityStore): void {
    this.chunks.setWorld(world);
    this.entities.setWorld(world);
    this.signs.setWorld(world, blockEntities);
  }

  /** 渲染一帧。 */
  render(timeTick: number, isUnderwater: boolean, rainLevel = 0, minLight = 0, skyColor: THREE.Color | null = null): void {
    this.sky.update(timeTick, this.camera.position, skyColor);
    // 下雨时天光整体压暗，云雾也更灰
    const skyLevel = this.sky.skyLevel * (1 - RAIN_DARKEN * rainLevel);
    this.chunks.sharedUniforms.uSkyLevel.value = skyLevel;
    this.chunks.sharedUniforms.uMinLight.value = minLight;
    // 直接在 uniform 的 Color 上算，每帧零分配
    const fogColor: THREE.Color = this.chunks.sharedUniforms.uFogColor.value;
    if (isUnderwater) {
      fogColor.copy(UNDERWATER_FOG_COLOR);
    } else {
      fogColor.copy(this.sky.color).lerp(RAIN_FOG_COLOR, rainLevel * RAIN_FOG_MIX);
    }
    if (isUnderwater) {
      this.chunks.sharedUniforms.uFogNear.value = 2;
      this.chunks.sharedUniforms.uFogFar.value = 24;
    } else {
      this.chunks.setRenderDistance(this.currentRenderDistance);
    }
    this.scene.background = fogColor;
    this.ambient.intensity = AMBIENT_MIN + 0.4 * skyLevel;
    this.sun.intensity = SUN_INTENSITY * skyLevel;
    this.renderer.render(this.scene, this.camera);
  }

  /** 释放。 */
  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.chunks.dispose();
    this.entities.dispose();
    this.particles.dispose();
    this.signs.dispose();
    this.renderer.dispose();
  }
}
