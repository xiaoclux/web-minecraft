import { BlockId, RenderType, getBlock, type BlockDef, type BlockFaceTextures } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { localIndex } from './Chunk';
import { waterHeight } from './FluidSimulator';
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
const WATER_SURFACE_HEIGHT = 0.875;
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

/** 把一个 chunk 转成顶点数据（面剔除 + 平滑光照 + AO）。 */
export class ChunkMesher {
  constructor(
    private readonly world: World,
    private readonly atlas: TextureAtlas,
  ) {}

  /** 生成 chunk 网格。 */
  mesh(cx: number, cz: number): ChunkMeshData {
    const opaque = new BufferBuilder();
    const cutout = new BufferBuilder();
    const translucent = new BufferBuilder();
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const world = this.world;
    const chunk = world.getChunk(cx, cz);
    if (!chunk) {
      return { opaque: opaque.build(), cutout: cutout.build(), translucent: translucent.build() };
    }
    for (let y = 0; y < world.sizeY; y++) {
      for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
        for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
          const id = chunk.blocks[localIndex(x - x0, y, z - z0)];
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
    const world = this.world;
    if (ny < 0) {
      return false;
    }
    if (ny >= world.sizeY) {
      return true;
    }
    if (!world.hasChunkAt(nx, nz)) {
      // 邻 chunk 未加载：不画，等它加载时本 chunk 会被标脏补画
      return false;
    }
    const neighborId = world.getBlock(nx, ny, nz);
    if (neighborId === def.id && (def.render === RenderType.CUTOUT || def.isLiquid) && def.id !== BlockId.LEAVES) {
      return false;
    }
    return !getBlock(neighborId).opaque;
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
    const world = this.world;
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
      const sky = world.getSkyLight(nx, ny, nz) / MAX_LIGHT;
      const block = world.getBlockLight(nx, ny, nz) / MAX_LIGHT;
      const light = [sky, block, face.shade] as const;
      builder.quad(corners, region, [light, light, light, light], false);
    }
  }

  /**
   * 水面四角高度（索引 cx*2+cz）：取该角周围 4 个水块高度的平均，形成 1.8 式斜面；
   * 任一相邻水块上方仍是水则该角为满高。
   */
  private waterCornerHeights(x: number, y: number, z: number): [number, number, number, number] {
    const world = this.world;
    const heightAt = (bx: number, bz: number): number | null => {
      if (world.getBlock(bx, y, bz) !== BlockId.WATER) {
        return null;
      }
      return waterHeight(world.getMeta(bx, y, bz), world.getBlock(bx, y + 1, bz) === BlockId.WATER);
    };
    const own = heightAt(x, z) ?? WATER_SURFACE_HEIGHT;
    const corner = (dx: number, dz: number): number => {
      let sum = 0;
      let count = 0;
      let full = false;
      for (const [ox, oz] of [
        [0, 0],
        [dx, 0],
        [0, dz],
        [dx, dz],
      ]) {
        const h = heightAt(x + ox, z + oz);
        if (h === null) {
          continue;
        }
        if (h >= 1) {
          full = true;
        }
        sum += h;
        count++;
      }
      if (full) {
        return 1;
      }
      return count === 0 ? own : sum / count;
    };
    return [corner(-1, -1), corner(-1, 1), corner(1, -1), corner(1, 1)];
  }

  private cross(builder: BufferBuilder, def: BlockDef, x: number, y: number, z: number): void {
    const world = this.world;
    const region = this.atlas.region(def.textures.north);
    const sky = world.getSkyLight(x, y, z) / MAX_LIGHT;
    const block = Math.max(world.getBlockLight(x, y, z), def.light) / MAX_LIGHT;
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
    const world = this.world;
    const [nx, ny, nz] = face.normal;
    // 面法线方向的相邻格
    const bx = x + nx;
    const by = y + ny;
    const bz = z + nz;
    // 与法线垂直的两个轴的偏移方向
    let ax = 0;
    let ay = 0;
    let az = 0;
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
    const s1x = bx + ax;
    const s1y = by + ay;
    const s1z = bz + az;
    const s2x = bx + cxo;
    const s2y = by + cyo;
    const s2z = bz + czo;
    const ccx = bx + ax + cxo;
    const ccy = by + ay + cyo;
    const ccz = bz + az + czo;
    const side1 = world.isOpaqueAt(s1x, s1y, s1z);
    const side2 = world.isOpaqueAt(s2x, s2y, s2z);
    const cornerOpaque = world.isOpaqueAt(ccx, ccy, ccz);
    const aoLevel = side1 && side2 ? 0 : 3 - (Number(side1) + Number(side2) + Number(cornerOpaque));

    let skySum = 0;
    let blockSum = 0;
    let count = 0;
    const sample = (sx: number, sy: number, sz: number, opaque: boolean): void => {
      if (opaque) {
        return;
      }
      skySum += world.getSkyLight(sx, sy, sz);
      blockSum += world.getBlockLight(sx, sy, sz);
      count++;
    };
    sample(bx, by, bz, world.isOpaqueAt(bx, by, bz));
    sample(s1x, s1y, s1z, side1);
    sample(s2x, s2y, s2z, side2);
    if (!(side1 && side2)) {
      sample(ccx, ccy, ccz, cornerOpaque);
    }
    const sky = count > 0 ? skySum / count / MAX_LIGHT : 0;
    const block = count > 0 ? blockSum / count / MAX_LIGHT : 0;
    return [sky, block, face.shade * AO_FACTORS[aoLevel]];
  }
}
