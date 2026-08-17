import {
  BlockId,
  RenderType,
  blockVariant,
  getBlock,
  type BlockDef,
  type BlockFaceTextures,
} from '../blocks/BlockRegistry';
import {
  FACINGS,
  FACING_MASK,
  computeConnections,
  isFullCube,
  needsConnections,
  shapeBoxes,
  type BlockBox,
} from '../blocks/blockShapes';
import { CHUNK_SIZE, MAX_LIGHT, SECTION_HEIGHT, SECTION_SHIFT, WORLD_SIZE_Y } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { sectionIndex } from './Chunk';
import { waterHeight } from '../blocks/waterShape';
import type { World } from './World';

/** 一个 chunk 的三层网格数据。 */
export interface ChunkMeshData {
  opaque: MeshBuffers;
  cutout: MeshBuffers;
  translucent: MeshBuffers;
}

/** 顶点缓冲。 */
export interface MeshBuffers {
  positions: Float32Array;
  uvs: Float32Array;
  /** 每顶点 (sky, block, shade)。 */
  lights: Float32Array;
  indices: Uint32Array;
}

interface FaceSpec {
  normal: readonly [number, number, number];
  corners: readonly (readonly [number, number, number])[];
  textureKey: keyof BlockFaceTextures;
  shade: number;
  /** 面内纹理坐标的取法：u 取局部坐标的 uAxis 轴（uFlip 表示取 1-值），v 同理。 */
  uAxis: number;
  uFlip: boolean;
  vAxis: number;
  vFlip: boolean;
}

/** 局部坐标轴序号。 */
const AXIS_X = 0;
const AXIS_Y = 1;
const AXIS_Z = 2;

const FACE_SHADE_TOP = 1;
const FACE_SHADE_BOTTOM = 0.5;
const FACE_SHADE_X = 0.6;
const FACE_SHADE_Z = 0.8;
const AO_FACTORS = [0.45, 0.65, 0.82, 1];
const UV_CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const FACES: FaceSpec[] = [
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    textureKey: 'east',
    shade: FACE_SHADE_X,
    uAxis: AXIS_Z,
    uFlip: true,
    vAxis: AXIS_Y,
    vFlip: false,
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    textureKey: 'west',
    shade: FACE_SHADE_X,
    uAxis: AXIS_Z,
    uFlip: false,
    vAxis: AXIS_Y,
    vFlip: false,
  },
  {
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
    textureKey: 'top',
    shade: FACE_SHADE_TOP,
    uAxis: AXIS_X,
    uFlip: false,
    vAxis: AXIS_Z,
    vFlip: true,
  },
  {
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    textureKey: 'bottom',
    shade: FACE_SHADE_BOTTOM,
    uAxis: AXIS_X,
    uFlip: false,
    vAxis: AXIS_Z,
    vFlip: false,
  },
  {
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    textureKey: 'south',
    shade: FACE_SHADE_Z,
    uAxis: AXIS_X,
    uFlip: false,
    vAxis: AXIS_Y,
    vFlip: false,
  },
  {
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
    textureKey: 'north',
    shade: FACE_SHADE_Z,
    uAxis: AXIS_X,
    uFlip: true,
    vAxis: AXIS_Y,
    vFlip: false,
  },
];

const CROSS_QUADS: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [0, 0, 0],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
    [1, 1, 0],
  ],
];

/** 缓冲初始容量（顶点数），不够时翻倍。 */
const INITIAL_VERTEX_CAPACITY = 4096;

/**
 * 增长式缓冲构建器：直接往可增长的 TypedArray 里写顶点，
 * 每个 chunk 重建复用同一组缓冲，只在 build() 时按实际长度拷贝一份出去。
 */
class BufferBuilder {
  private positions = new Float32Array(INITIAL_VERTEX_CAPACITY * 3);
  private uvs = new Float32Array(INITIAL_VERTEX_CAPACITY * 2);
  private lights = new Float32Array(INITIAL_VERTEX_CAPACITY * 3);
  private indices = new Uint32Array(INITIAL_VERTEX_CAPACITY * 6);
  private vertexCount = 0;
  private indexCount = 0;

  reset(): void {
    this.vertexCount = 0;
    this.indexCount = 0;
  }

  /** 写入一个顶点：位置、纹理坐标、(sky, block, shade)。 */
  vertex(x: number, y: number, z: number, u: number, v: number, sky: number, block: number, shade: number): void {
    const n = this.vertexCount;
    if ((n + 1) * 3 > this.positions.length) {
      this.grow();
    }
    const p = n * 3;
    this.positions[p] = x;
    this.positions[p + 1] = y;
    this.positions[p + 2] = z;
    this.uvs[n * 2] = u;
    this.uvs[n * 2 + 1] = v;
    this.lights[p] = sky;
    this.lights[p + 1] = block;
    this.lights[p + 2] = shade;
    this.vertexCount = n + 1;
  }

  /** 为刚写入的 4 个顶点补上两个三角形的索引；flip 表示沿另一条对角线切分（AO 用）。 */
  quadIndices(flip: boolean): void {
    const b = this.vertexCount - 4;
    const i = this.indexCount;
    const idx = this.indices;
    if (flip) {
      idx[i] = b + 1;
      idx[i + 1] = b + 2;
      idx[i + 2] = b + 3;
      idx[i + 3] = b + 1;
      idx[i + 4] = b + 3;
      idx[i + 5] = b;
    } else {
      idx[i] = b;
      idx[i + 1] = b + 1;
      idx[i + 2] = b + 2;
      idx[i + 3] = b;
      idx[i + 4] = b + 2;
      idx[i + 5] = b + 3;
    }
    this.indexCount = i + 6;
  }

  private grow(): void {
    const capacity = (this.positions.length / 3) * 2;
    const positions = new Float32Array(capacity * 3);
    positions.set(this.positions);
    this.positions = positions;
    const uvs = new Float32Array(capacity * 2);
    uvs.set(this.uvs);
    this.uvs = uvs;
    const lights = new Float32Array(capacity * 3);
    lights.set(this.lights);
    this.lights = lights;
    // 每 4 个顶点 6 个索引，索引容量按顶点容量的 1.5 倍走
    const indices = new Uint32Array(capacity * 6);
    indices.set(this.indices);
    this.indices = indices;
  }

  build(): MeshBuffers {
    return {
      positions: this.positions.slice(0, this.vertexCount * 3),
      uvs: this.uvs.slice(0, this.vertexCount * 2),
      lights: this.lights.slice(0, this.vertexCount * 3),
      indices: this.indices.slice(0, this.indexCount),
    };
  }
}

/** 快照在 x/z 方向各向外扩 1 格、y 方向上下各扩 1 格。 */
const PAD = 1;
const SNAP_SIZE_XZ = CHUNK_SIZE + PAD * 2;
const SNAP_SIZE_Y = WORLD_SIZE_Y + PAD * 2;
const SNAP_VOLUME = SNAP_SIZE_XZ * SNAP_SIZE_XZ * SNAP_SIZE_Y;
/** 水面四角对应的邻格偏移表（索引 = cornerX*2 + cornerZ）。 */
const WATER_CORNER_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/**
 * chunk 及其一圈邻居的局部快照：方块 / 附加数据 / 光照 / 遮光 / 列是否加载，
 * 全部是连续类型化数组，网格生成期间的所有邻居查询都在这里完成，不再回到 World。
 */
class ChunkSnapshot {
  readonly blocks = new Uint8Array(SNAP_VOLUME);
  readonly meta = new Uint8Array(SNAP_VOLUME);
  readonly sky = new Uint8Array(SNAP_VOLUME);
  readonly blockLight = new Uint8Array(SNAP_VOLUME);
  readonly opaque = new Uint8Array(SNAP_VOLUME);
  readonly columnLoaded = new Uint8Array(SNAP_SIZE_XZ * SNAP_SIZE_XZ);
  /** 本次快照覆盖的方块 y 范围（中心 chunk 有方块的段，闭区间）；lowY > highY 表示整块是空的。 */
  lowY = 0;
  highY = -1;
  private originX = 0;
  private originZ = 0;

  /**
   * 从世界复制 (cx,cz) 周围的数据；返回是否成功（中心 chunk 不存在或整块为空则失败）。
   * 只复制中心 chunk 已分配段所在的 y 区间（上下各多 1 格供面剔除与 AO 采样），空段整体跳过。
   */
  capture(world: World, cx: number, cz: number): boolean {
    const center = world.getChunk(cx, cz);
    if (!center) {
      return false;
    }
    this.lowY = center.filledMinY;
    this.highY = center.filledMaxY - 1;
    if (this.lowY > this.highY) {
      return false;
    }
    this.originX = cx * CHUNK_SIZE - PAD;
    this.originZ = cz * CHUNK_SIZE - PAD;
    // 快照的 y 区间（含上下各 1 格的边界），可越出世界上下边界
    const padLoY = this.lowY - 1;
    const padHiY = this.highY + 1;
    const slabFrom = padLoY + PAD;
    const slabTo = padHiY + PAD;
    const from = slabFrom * SNAP_SIZE_XZ * SNAP_SIZE_XZ;
    const to = (slabTo + 1) * SNAP_SIZE_XZ * SNAP_SIZE_XZ;
    // 默认值：空气、无方块光、满天光（未加载列与未分配段都按满天光处理）
    this.blocks.fill(BlockId.AIR, from, to);
    this.meta.fill(0, from, to);
    this.opaque.fill(0, from, to);
    this.blockLight.fill(0, from, to);
    this.sky.fill(MAX_LIGHT, from, to);
    if (padLoY < 0) {
      // 世界底面之下无光
      this.sky.fill(0, from, from + SNAP_SIZE_XZ * SNAP_SIZE_XZ);
    }
    const copyLoY = Math.max(0, padLoY);
    const copyHiY = Math.min(WORLD_SIZE_Y - 1, padHiY);
    for (let sz = 0; sz < SNAP_SIZE_XZ; sz++) {
      for (let sx = 0; sx < SNAP_SIZE_XZ; sx++) {
        const wx = this.originX + sx;
        const wz = this.originZ + sz;
        const chunk = world.getChunkAt(wx, wz);
        this.columnLoaded[sz * SNAP_SIZE_XZ + sx] = chunk ? 1 : 0;
        if (!chunk) {
          continue;
        }
        const lx = wx - chunk.originX;
        const lz = wz - chunk.originZ;
        for (let sy = copyLoY >> SECTION_SHIFT; sy <= copyHiY >> SECTION_SHIFT; sy++) {
          const section = chunk.sections[sy];
          if (!section) {
            continue;
          }
          const yFrom = Math.max(copyLoY, sy * SECTION_HEIGHT);
          const yTo = Math.min(copyHiY, sy * SECTION_HEIGHT + SECTION_HEIGHT - 1);
          for (let y = yFrom; y <= yTo; y++) {
            const src = sectionIndex(lx, y, lz);
            const dst = this.index(sx, y + PAD, sz);
            const id = section.blocks[src];
            this.blocks[dst] = id;
            this.meta[dst] = section.meta[src];
            this.sky[dst] = section.skyLight[src];
            this.blockLight[dst] = section.blockLight[src];
            this.opaque[dst] = OPAQUE_BY_ID[id];
          }
        }
      }
    }
    return true;
  }

  /** 世界坐标 → 快照索引（调用方保证在快照范围内）。 */
  index(sx: number, sy: number, sz: number): number {
    return (sy * SNAP_SIZE_XZ + sz) * SNAP_SIZE_XZ + sx;
  }

  /** 世界坐标 → 快照索引。 */
  at(x: number, y: number, z: number): number {
    return this.index(x - this.originX, y + PAD, z - this.originZ);
  }

  isColumnLoaded(x: number, z: number): boolean {
    return this.columnLoaded[(z - this.originZ) * SNAP_SIZE_XZ + (x - this.originX)] === 1;
  }
}

/** 按方块 id 预计算的遮挡表：完整立方体且不透光才会挡住邻面并产生 AO。 */
const OPAQUE_BY_ID = new Uint8Array(256);
for (let id = 0; id < OPAQUE_BY_ID.length; id++) {
  const def = getBlock(id);
  OPAQUE_BY_ID[id] = def.opaque && isFullCube(def) ? 1 : 0;
}

/**
 * 取该面实际使用的贴图 key：带朝向的方块把水平四面按 meta 旋转——
 * 正面（朝向方向）用 north、背面用 south、右侧用 east、左侧用 west。
 */
function textureKeyFor(def: BlockDef, face: FaceSpec, meta: number): keyof BlockFaceTextures {
  const [nx, , nz] = face.normal;
  if (!def.hasFacing || face.normal[1] !== 0) {
    return face.textureKey;
  }
  const [fx, fz] = FACINGS[meta & FACING_MASK];
  if (nx === fx && nz === fz) {
    return 'north';
  }
  if (nx === -fx && nz === -fz) {
    return 'south';
  }
  // 右手边：把朝向绕 y 轴转 90°
  return nx === -fz && nz === fx ? 'east' : 'west';
}

/** 取该方块在给定 meta 下的六面贴图（变种、床头/床尾、作物生长阶段都按 meta 换图）。 */
function texturesFor(def: BlockDef, meta: number): BlockFaceTextures {
  if (def.texturesForMeta) {
    return def.texturesForMeta(meta);
  }
  return blockVariant(def, meta).textures;
}

/** 子盒的某个面是否正好贴在格子边界上（贴边的面才参与邻居剔除）。 */
function isFaceOnBoundary(face: FaceSpec, b: BlockBox): boolean {
  const [nx, ny, nz] = face.normal;
  if (nx !== 0) {
    return nx > 0 ? b.x1 === 1 : b.x0 === 0;
  }
  if (ny !== 0) {
    return ny > 0 ? b.y1 === 1 : b.y0 === 0;
  }
  return nz > 0 ? b.z1 === 1 : b.z0 === 0;
}

/** 把一个 chunk 转成顶点数据（面剔除 + 平滑光照 + AO）。 */
export class ChunkMesher {
  private readonly snap = new ChunkSnapshot();
  private readonly opaqueBuilder = new BufferBuilder();
  private readonly cutoutBuilder = new BufferBuilder();
  private readonly translucentBuilder = new BufferBuilder();
  /** 一个面 4 个顶点的 (sky, block, shade)，逐面复用。 */
  private readonly faceLights = new Float32Array(12);
  /** 液面四角高度（索引 cornerX*2 + cornerZ）。 */
  private readonly liquidHeights = new Float32Array(4);
  /** 液体 3×3 邻域高度采样（-1 表示不是液体）。 */
  private readonly liquidAround = new Float32Array(9);

  constructor(
    private readonly world: World,
    private readonly atlas: TextureAtlas,
  ) {}

  /** 生成 chunk 网格。 */
  mesh(cx: number, cz: number): ChunkMeshData {
    const opaque = this.opaqueBuilder;
    const cutout = this.cutoutBuilder;
    const translucent = this.translucentBuilder;
    opaque.reset();
    cutout.reset();
    translucent.reset();
    if (!this.snap.capture(this.world, cx, cz)) {
      return { opaque: opaque.build(), cutout: cutout.build(), translucent: translucent.build() };
    }
    const snap = this.snap;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    for (let y = snap.lowY; y <= snap.highY; y++) {
      for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
        for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
          const id = snap.blocks[snap.at(x, y, z)];
          if (id === BlockId.AIR) {
            continue;
          }
          const def = getBlock(id);
          if (def.render === RenderType.CROSS) {
            this.cross(cutout, def, x, y, z);
            continue;
          }
          if (!isFullCube(def)) {
            this.boxes(def.render === RenderType.CUTOUT ? cutout : opaque, def, x, y, z);
            continue;
          }
          if (def.isLiquid) {
            // 液体按水位做斜面；水是半透明层、岩浆是不透明层
            this.liquid(def.render === RenderType.TRANSLUCENT ? translucent : opaque, def, x, y, z);
            continue;
          }
          switch (def.render) {
            case RenderType.OPAQUE:
              this.cube(opaque, def, x, y, z);
              break;
            case RenderType.CUTOUT:
              this.cube(cutout, def, x, y, z);
              break;
            case RenderType.TRANSLUCENT:
              this.cube(translucent, def, x, y, z);
              break;
            default:
              break;
          }
        }
      }
    }
    return { opaque: opaque.build(), cutout: cutout.build(), translucent: translucent.build() };
  }

  private shouldDrawFace(def: BlockDef, nx: number, ny: number, nz: number): boolean {
    if (ny < 0) {
      return false;
    }
    if (ny >= WORLD_SIZE_Y) {
      return true;
    }
    const snap = this.snap;
    if (!snap.isColumnLoaded(nx, nz)) {
      // 邻 chunk 未加载：不画，等它加载时本 chunk 会被标脏补画
      return false;
    }
    const idx = snap.at(nx, ny, nz);
    const neighborId = snap.blocks[idx];
    const mergesWithSelf = (def.render !== RenderType.OPAQUE || def.isLiquid) && def.id !== BlockId.LEAVES;
    if (neighborId === def.id && mergesWithSelf) {
      return false;
    }
    return snap.opaque[idx] === 0;
  }

  private cube(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const meta = def.hasFacing || def.texturesForMeta || def.variants ? this.snap.meta[this.snap.at(x, y, z)] : 0;
    const textures = texturesFor(def, meta);
    for (const face of FACES) {
      const nx = x + face.normal[0];
      const ny = y + face.normal[1];
      const nz = z + face.normal[2];
      if (!this.shouldDrawFace(def, nx, ny, nz)) {
        continue;
      }
      const region = this.atlas.region(textures[textureKeyFor(def, face, meta)]);
      const lights = this.faceLights;
      for (let i = 0; i < 4; i++) {
        this.vertexLight(x, y, z, face, face.corners[i], lights, i * 3);
      }
      const flip = lights[2] + lights[8] < lights[5] + lights[11];
      for (let i = 0; i < 4; i++) {
        const c = face.corners[i];
        const uv = UV_CORNERS[i];
        builder.vertex(
          x + c[0],
          y + c[1],
          z + c[2],
          uv[0] === 0 ? region.u0 : region.u1,
          uv[1] === 0 ? region.v0 : region.v1,
          lights[i * 3],
          lights[i * 3 + 1],
          lights[i * 3 + 2],
        );
      }
      builder.quadIndices(flip);
    }
  }

  /**
   * 由子盒构成的方块（半砖 / 楼梯等）：逐盒逐面生成。
   * 贴在格子边界上的面按邻居剔除并使用平滑光照，格子内部的面始终绘制并取本格光照。
   */
  private boxes(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const snap = this.snap;
    const meta = snap.meta[snap.at(x, y, z)];
    const ownIdx = snap.at(x, y, z);
    const textures = texturesFor(def, meta);
    const connections = needsConnections(def)
      ? computeConnections(def, (dx, dz) => getBlock(snap.blocks[snap.at(x + dx, y, z + dz)]))
      : 0;
    for (const b of shapeBoxes(def, meta, connections)) {
      for (const face of FACES) {
        const [nx, ny, nz] = face.normal;
        const onBoundary = isFaceOnBoundary(face, b);
        if (onBoundary && !this.shouldDrawFace(def, x + nx, y + ny, z + nz)) {
          continue;
        }
        const region = this.atlas.region(textures[textureKeyFor(def, face, meta)]);
        const lights = this.faceLights;
        let flip = false;
        if (onBoundary) {
          for (let i = 0; i < 4; i++) {
            this.vertexLight(x, y, z, face, face.corners[i], lights, i * 3);
          }
          flip = lights[2] + lights[8] < lights[5] + lights[11];
        } else {
          // 格子内部的面：取本格与法线方向邻格中较亮者（半砖顶面因此与地面一样亮）
          const nIdx = snap.at(x + nx, y + ny, z + nz);
          const sky = Math.max(snap.sky[ownIdx], snap.opaque[nIdx] === 1 ? 0 : snap.sky[nIdx]) / MAX_LIGHT;
          const blockLight =
            Math.max(snap.blockLight[ownIdx], snap.opaque[nIdx] === 1 ? 0 : snap.blockLight[nIdx]) / MAX_LIGHT;
          for (let i = 0; i < 4; i++) {
            lights[i * 3] = sky;
            lights[i * 3 + 1] = blockLight;
            lights[i * 3 + 2] = face.shade;
          }
        }
        for (let i = 0; i < 4; i++) {
          const c = face.corners[i];
          const lx = c[0] === 0 ? b.x0 : b.x1;
          const ly = c[1] === 0 ? b.y0 : b.y1;
          const lz = c[2] === 0 ? b.z0 : b.z1;
          const uLocal = face.uAxis === AXIS_X ? lx : face.uAxis === AXIS_Y ? ly : lz;
          const vLocal = face.vAxis === AXIS_X ? lx : face.vAxis === AXIS_Y ? ly : lz;
          const u = face.uFlip ? 1 - uLocal : uLocal;
          const v = face.vFlip ? 1 - vLocal : vLocal;
          builder.vertex(
            x + lx,
            y + ly,
            z + lz,
            region.u0 + (region.u1 - region.u0) * u,
            region.v0 + (region.v1 - region.v0) * v,
            lights[i * 3],
            lights[i * 3 + 1],
            lights[i * 3 + 2],
          );
        }
        builder.quadIndices(flip);
      }
    }
  }

  private liquid(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const snap = this.snap;
    let heightsReady = false;
    const heights = this.liquidHeights;
    for (const face of FACES) {
      const nx = x + face.normal[0];
      const ny = y + face.normal[1];
      const nz = z + face.normal[2];
      if (!this.shouldDrawFace(def, nx, ny, nz)) {
        continue;
      }
      if (!heightsReady) {
        // 四角高度只在真有面要画时才算（被水包围的水块六面全剔除，直接跳过）
        this.liquidCornerHeights(def.id, x, y, z);
        heightsReady = true;
      }
      const region = this.atlas.region(def.textures[face.textureKey]);
      const idx = snap.at(nx, ny, nz);
      const sky = snap.sky[idx] / MAX_LIGHT;
      const block = snap.blockLight[idx] / MAX_LIGHT;
      for (let i = 0; i < 4; i++) {
        const c = face.corners[i];
        const uv = UV_CORNERS[i];
        const top = heights[c[0] * 2 + c[2]];
        builder.vertex(
          x + c[0],
          y + (c[1] === 1 ? top : 0),
          z + c[2],
          uv[0] === 0 ? region.u0 : region.u1,
          uv[1] === 0 ? region.v0 : region.v1,
          sky,
          block,
          face.shade,
        );
      }
      builder.quadIndices(false);
    }
  }

  /** 该位置若是同种液体，返回其表面高度；否则返回 -1。 */
  private liquidHeightAt(liquidId: number, x: number, y: number, z: number): number {
    const snap = this.snap;
    const idx = snap.at(x, y, z);
    if (snap.blocks[idx] !== liquidId) {
      return -1;
    }
    const aboveIsSame = y + 1 < WORLD_SIZE_Y && snap.blocks[snap.at(x, y + 1, z)] === liquidId;
    return waterHeight(snap.meta[idx], aboveIsSame);
  }

  /**
   * 液面四角高度写入 this.liquidHeights（索引 cx*2+cz）：取该角周围 4 格同种液体高度的平均，
   * 形成 1.8 式斜面；任一相邻格上方仍是同种液体则该角为满高。
   */
  private liquidCornerHeights(liquidId: number, x: number, y: number, z: number): void {
    const result = this.liquidHeights;
    const own = this.liquidHeightAt(liquidId, x, y, z);
    if (own >= 1) {
      result.fill(1);
      return;
    }
    // 3×3 邻域高度采样一次（-1 表示不是水），索引 (dz+1)*3 + (dx+1)
    const around = this.liquidAround;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        around[(dz + 1) * 3 + (dx + 1)] =
          dx === 0 && dz === 0 ? own : this.liquidHeightAt(liquidId, x + dx, y, z + dz);
      }
    }
    for (let i = 0; i < WATER_CORNER_OFFSETS.length; i++) {
      const [dx, dz] = WATER_CORNER_OFFSETS[i];
      let sum = own;
      let count = 1;
      let full = own >= 1;
      const h1 = around[4 + dx];
      const h2 = around[4 + dz * 3];
      const h3 = around[4 + dz * 3 + dx];
      if (h1 >= 0) {
        sum += h1;
        count++;
        full ||= h1 >= 1;
      }
      if (h2 >= 0) {
        sum += h2;
        count++;
        full ||= h2 >= 1;
      }
      if (h3 >= 0) {
        sum += h3;
        count++;
        full ||= h3 >= 1;
      }
      result[i] = full ? 1 : sum / count;
    }
  }

  private cross(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const snap = this.snap;
    const idx = snap.at(x, y, z);
    const region = this.atlas.region(texturesFor(def, snap.meta[idx]).north);
    const sky = snap.sky[idx] / MAX_LIGHT;
    const block = Math.max(snap.blockLight[idx], def.light) / MAX_LIGHT;
    for (const quad of CROSS_QUADS) {
      for (let i = 0; i < 4; i++) {
        const c = quad[i];
        const uv = UV_CORNERS[i];
        builder.vertex(
          x + c[0],
          y + c[1],
          z + c[2],
          uv[0] === 0 ? region.u0 : region.u1,
          uv[1] === 0 ? region.v0 : region.v1,
          sky,
          block,
          FACE_SHADE_TOP,
        );
      }
      builder.quadIndices(false);
    }
  }

  /**
   * 计算面上一个顶点的 (sky, block, shade) 并写入 out[offset..offset+2]：
   * 光照取相邻 4 格平均，shade = 面朝向 × AO。
   */
  private vertexLight(
    x: number,
    y: number,
    z: number,
    face: FaceSpec,
    corner: readonly [number, number, number],
    out: Float32Array,
    offset: number,
  ): void {
    const snap = this.snap;
    const [nx, ny, nz] = face.normal;
    // 面法线方向的相邻格
    const bx = x + nx;
    const by = y + ny;
    const bz = z + nz;
    // 与法线垂直的两个轴的偏移方向
    let ax = 0;
    let ay = 0;
    let cxo = 0;
    let cyo = 0;
    let czo = 0;
    if (nx !== 0) {
      ay = corner[1] === 1 ? 1 : -1;
      czo = corner[2] === 1 ? 1 : -1;
    } else if (ny !== 0) {
      ax = corner[0] === 1 ? 1 : -1;
      czo = corner[2] === 1 ? 1 : -1;
    } else {
      ax = corner[0] === 1 ? 1 : -1;
      cyo = corner[1] === 1 ? 1 : -1;
    }
    const iFront = snap.at(bx, by, bz);
    const iSide1 = snap.at(bx + ax, by + ay, bz);
    const iSide2 = snap.at(bx + cxo, by + cyo, bz + czo);
    const iCorner = snap.at(bx + ax + cxo, by + ay + cyo, bz + czo);
    const frontOpaque = snap.opaque[iFront] === 1;
    const side1 = snap.opaque[iSide1] === 1;
    const side2 = snap.opaque[iSide2] === 1;
    const cornerOpaque = snap.opaque[iCorner] === 1;
    const aoLevel = side1 && side2 ? 0 : 3 - (Number(side1) + Number(side2) + Number(cornerOpaque));

    let skySum = 0;
    let blockSum = 0;
    let count = 0;
    if (!frontOpaque) {
      skySum += snap.sky[iFront];
      blockSum += snap.blockLight[iFront];
      count++;
    }
    if (!side1) {
      skySum += snap.sky[iSide1];
      blockSum += snap.blockLight[iSide1];
      count++;
    }
    if (!side2) {
      skySum += snap.sky[iSide2];
      blockSum += snap.blockLight[iSide2];
      count++;
    }
    // 两侧都被挡住时角格看不见，不参与平均
    if (!(side1 && side2) && !cornerOpaque) {
      skySum += snap.sky[iCorner];
      blockSum += snap.blockLight[iCorner];
      count++;
    }
    out[offset] = count > 0 ? skySum / count / MAX_LIGHT : 0;
    out[offset + 1] = count > 0 ? blockSum / count / MAX_LIGHT : 0;
    out[offset + 2] = face.shade * AO_FACTORS[aoLevel];
  }
}
