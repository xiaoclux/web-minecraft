import { BlockId, RenderType, getBlock, type BlockDef, type BlockFaceTextures } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT, WORLD_SIZE_Y } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { localIndex } from './Chunk';
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
}

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

/** 增长式缓冲构建器。 */
class BufferBuilder {
  positions: number[] = [];
  uvs: number[] = [];
  lights: number[] = [];
  indices: number[] = [];
  private vertexCount = 0;

  quad(
    corners: readonly (readonly [number, number, number])[],
    uvRegion: { u0: number; v0: number; u1: number; v1: number },
    lightPerVertex: readonly (readonly [number, number, number])[],
    flip: boolean,
  ): void {
    for (let i = 0; i < 4; i++) {
      const c = corners[i];
      this.positions.push(c[0], c[1], c[2]);
      const uv = UV_CORNERS[i];
      this.uvs.push(uv[0] === 0 ? uvRegion.u0 : uvRegion.u1, uv[1] === 0 ? uvRegion.v0 : uvRegion.v1);
      const l = lightPerVertex[i];
      this.lights.push(l[0], l[1], l[2]);
    }
    const b = this.vertexCount;
    if (flip) {
      this.indices.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    } else {
      this.indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    this.vertexCount += 4;
  }

  build(): MeshBuffers {
    return {
      positions: new Float32Array(this.positions),
      uvs: new Float32Array(this.uvs),
      lights: new Float32Array(this.lights),
      indices: new Uint32Array(this.indices),
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
  private originX = 0;
  private originZ = 0;

  /** 从世界复制 (cx,cz) 周围的数据；返回是否成功（中心 chunk 不存在则失败）。 */
  capture(world: World, cx: number, cz: number): boolean {
    if (!world.getChunk(cx, cz)) {
      return false;
    }
    this.originX = cx * CHUNK_SIZE - PAD;
    this.originZ = cz * CHUNK_SIZE - PAD;
    // 世界外（y<0 / y≥64）的默认值：下方无光、上方满天光；方块都是空气
    this.blocks.fill(BlockId.AIR);
    this.meta.fill(0);
    this.opaque.fill(0);
    this.blockLight.fill(0);
    for (let sz = 0; sz < SNAP_SIZE_XZ; sz++) {
      for (let sx = 0; sx < SNAP_SIZE_XZ; sx++) {
        const wx = this.originX + sx;
        const wz = this.originZ + sz;
        const chunk = world.getChunkAt(wx, wz);
        const col = sz * SNAP_SIZE_XZ + sx;
        this.columnLoaded[col] = chunk ? 1 : 0;
        this.sky[this.index(sx, 0, sz)] = 0;
        this.sky[this.index(sx, SNAP_SIZE_Y - 1, sz)] = MAX_LIGHT;
        if (!chunk) {
          for (let y = 0; y < WORLD_SIZE_Y; y++) {
            this.sky[this.index(sx, y + PAD, sz)] = MAX_LIGHT;
          }
          continue;
        }
        const lx = wx - chunk.originX;
        const lz = wz - chunk.originZ;
        for (let y = 0; y < WORLD_SIZE_Y; y++) {
          const src = localIndex(lx, y, lz);
          const dst = this.index(sx, y + PAD, sz);
          const id = chunk.blocks[src];
          this.blocks[dst] = id;
          this.meta[dst] = chunk.meta[src];
          this.sky[dst] = chunk.skyLight[src];
          this.blockLight[dst] = chunk.blockLight[src];
          this.opaque[dst] = OPAQUE_BY_ID[id];
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

/** 按方块 id 预计算的遮光表。 */
const OPAQUE_BY_ID = new Uint8Array(256);
for (let id = 0; id < OPAQUE_BY_ID.length; id++) {
  OPAQUE_BY_ID[id] = getBlock(id).opaque ? 1 : 0;
}

/** 把一个 chunk 转成顶点数据（面剔除 + 平滑光照 + AO）。 */
export class ChunkMesher {
  private readonly snap = new ChunkSnapshot();

  constructor(
    private readonly world: World,
    private readonly atlas: TextureAtlas,
  ) {}

  /** 生成 chunk 网格。 */
  mesh(cx: number, cz: number): ChunkMeshData {
    const opaque = new BufferBuilder();
    const cutout = new BufferBuilder();
    const translucent = new BufferBuilder();
    if (!this.snap.capture(this.world, cx, cz)) {
      return { opaque: opaque.build(), cutout: cutout.build(), translucent: translucent.build() };
    }
    const snap = this.snap;
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    for (let y = 0; y < WORLD_SIZE_Y; y++) {
      for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
        for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
          const id = snap.blocks[snap.at(x, y, z)];
          if (id === BlockId.AIR) {
            continue;
          }
          const def = getBlock(id);
          switch (def.render) {
            case RenderType.OPAQUE:
              this.cube(opaque, def, x, y, z);
              break;
            case RenderType.CUTOUT:
              this.cube(cutout, def, x, y, z);
              break;
            case RenderType.TRANSLUCENT:
              this.water(translucent, def, x, y, z);
              break;
            case RenderType.CROSS:
              this.cross(cutout, def, x, y, z);
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
    if (neighborId === def.id && (def.render === RenderType.CUTOUT || def.isLiquid) && def.id !== BlockId.LEAVES) {
      return false;
    }
    return snap.opaque[idx] === 0;
  }

  private cube(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    for (const face of FACES) {
      const nx = x + face.normal[0];
      const ny = y + face.normal[1];
      const nz = z + face.normal[2];
      if (!this.shouldDrawFace(def, nx, ny, nz)) {
        continue;
      }
      const region = this.atlas.region(def.textures[face.textureKey]);
      const corners = face.corners.map(([cx, cy, cz]) => [x + cx, y + cy, z + cz] as const);
      const lights = face.corners.map((c) => this.vertexLight(x, y, z, face, c));
      const flip = lights[0][2] + lights[2][2] < lights[1][2] + lights[3][2];
      builder.quad(corners, region, lights, flip);
    }
  }

  private water(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const snap = this.snap;
    const heights = this.waterCornerHeights(x, y, z);
    for (const face of FACES) {
      const nx = x + face.normal[0];
      const ny = y + face.normal[1];
      const nz = z + face.normal[2];
      if (!this.shouldDrawFace(def, nx, ny, nz)) {
        continue;
      }
      const region = this.atlas.region(def.textures[face.textureKey]);
      const corners = face.corners.map(([cx, cy, cz]) => {
        const top = heights[cx * 2 + cz];
        return [x + cx, y + (cy === 1 ? top : 0), z + cz] as const;
      });
      const idx = snap.at(nx, ny, nz);
      const sky = snap.sky[idx] / MAX_LIGHT;
      const block = snap.blockLight[idx] / MAX_LIGHT;
      const light = [sky, block, face.shade] as const;
      builder.quad(corners, region, [light, light, light, light], false);
    }
  }

  /** 该位置若是水，返回其表面高度；否则返回 -1。 */
  private waterHeightAt(x: number, y: number, z: number): number {
    const snap = this.snap;
    const idx = snap.at(x, y, z);
    if (snap.blocks[idx] !== BlockId.WATER) {
      return -1;
    }
    const aboveIsWater = y + 1 < WORLD_SIZE_Y && snap.blocks[snap.at(x, y + 1, z)] === BlockId.WATER;
    return waterHeight(snap.meta[idx], aboveIsWater);
  }

  /**
   * 水面四角高度（索引 cx*2+cz）：取该角周围 4 个水块高度的平均，形成 1.8 式斜面；
   * 任一相邻水块上方仍是水则该角为满高。
   */
  private waterCornerHeights(x: number, y: number, z: number): [number, number, number, number] {
    const own = this.waterHeightAt(x, y, z);
    if (own >= 1) {
      return [1, 1, 1, 1];
    }
    // 3×3 邻域高度采样一次（-1 表示不是水）
    const around: number[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        around.push(dx === 0 && dz === 0 ? own : this.waterHeightAt(x + dx, y, z + dz));
      }
    }
    const sampleAt = (dx: number, dz: number): number => around[(dz + 1) * 3 + (dx + 1)];
    const result: [number, number, number, number] = [own, own, own, own];
    for (let i = 0; i < WATER_CORNER_OFFSETS.length; i++) {
      const [dx, dz] = WATER_CORNER_OFFSETS[i];
      let sum = 0;
      let count = 0;
      let full = false;
      for (const h of [own, sampleAt(dx, 0), sampleAt(0, dz), sampleAt(dx, dz)]) {
        if (h < 0) {
          continue;
        }
        if (h >= 1) {
          full = true;
        }
        sum += h;
        count++;
      }
      result[i] = full ? 1 : count === 0 ? own : sum / count;
    }
    return result;
  }

  private cross(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const snap = this.snap;
    const region = this.atlas.region(def.textures.north);
    const idx = snap.at(x, y, z);
    const sky = snap.sky[idx] / MAX_LIGHT;
    const block = Math.max(snap.blockLight[idx], def.light) / MAX_LIGHT;
    const light = [sky, block, 1] as const;
    for (const quad of CROSS_QUADS) {
      const corners = quad.map(([cx, cy, cz]) => [x + cx, y + cy, z + cz] as const);
      builder.quad(corners, region, [light, light, light, light], false);
    }
  }

  /**
   * 计算面上一个顶点的 (sky, block, shade)：光照取相邻 4 格平均，shade = 面朝向 × AO。
   */
  private vertexLight(
    x: number,
    y: number,
    z: number,
    face: FaceSpec,
    corner: readonly [number, number, number],
  ): [number, number, number] {
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
    const side1 = snap.opaque[iSide1] === 1;
    const side2 = snap.opaque[iSide2] === 1;
    const cornerOpaque = snap.opaque[iCorner] === 1;
    const aoLevel = side1 && side2 ? 0 : 3 - (Number(side1) + Number(side2) + Number(cornerOpaque));

    let skySum = 0;
    let blockSum = 0;
    let count = 0;
    const sample = (idx: number, opaque: boolean): void => {
      if (opaque) {
        return;
      }
      skySum += snap.sky[idx];
      blockSum += snap.blockLight[idx];
      count++;
    };
    sample(iFront, snap.opaque[iFront] === 1);
    sample(iSide1, side1);
    sample(iSide2, side2);
    if (!(side1 && side2)) {
      sample(iCorner, cornerOpaque);
    }
    const sky = count > 0 ? skySum / count / MAX_LIGHT : 0;
    const block = count > 0 ? blockSum / count / MAX_LIGHT : 0;
    return [sky, block, face.shade * AO_FACTORS[aoLevel]];
  }
}
