import { BlockId } from '../../blocks/BlockRegistry';
import { CHUNK_SIZE, WORLD_SIZE_Y } from '../../constants/world';
import { createRng, hashCoords, hashString } from '../../textures/PixelCanvas';
import { MobType } from '../../entities/MobDefs';
import { chunkKey, toChunkCoord, type Chunk, type PendingMob } from '../Chunk';
import {
  StructureBuilder,
  boundsIntersectXZ,
  chunkBounds,
  placeBlocksInChunk,
  type Bounds,
  type StructureBlock,
} from './StructureBuilder';

/** 村庄格子大小（chunk）：每个格子最多一座村庄。 */
export const VILLAGE_CELL_CHUNKS = 8;
const VILLAGE_CELL_BLOCKS = VILLAGE_CELL_CHUNKS * CHUNK_SIZE;
/** 每个格子出现村庄的概率。 */
const VILLAGE_CHANCE = 0.4;
/** 村庄中心离格子边缘的最小距离。 */
const VILLAGE_MARGIN = 28;
/** 房屋离水井中心的距离范围与数量。 */
const HOUSE_MIN_DISTANCE = 9;
const HOUSE_MAX_DISTANCE = 20;
const HOUSE_MIN_COUNT = 4;
const HOUSE_MAX_COUNT = 7;
const HOUSE_PLACE_ATTEMPTS = 24;
/** 房屋之间的最小间隙。 */
const HOUSE_GAP = 2;
/** 房屋地基高度与水井高度相差过大则不建。 */
const MAX_HEIGHT_DIFF = 6;
/** 村庄整体可能占用的半径（用于判断哪些格子可能影响某个 chunk）。 */
const VILLAGE_REACH = HOUSE_MAX_DISTANCE + 8;
const WALL_HEIGHT = 3;
const FOUNDATION_MAX_DEPTH = 8;
const CLEARANCE_ABOVE_ROOF = 2;
const SALT_VILLAGE = 101;

/** 村庄材质。 */
export const VillageStyle = {
  PLAINS: 'plains',
  DESERT: 'desert',
} as const;
export type VillageStyle = (typeof VillageStyle)[keyof typeof VillageStyle];

interface Palette {
  wall: number;
  corner: number;
  floor: number;
  roof: number;
  path: number;
  window: number;
}

const PALETTES: Record<VillageStyle, Palette> = {
  plains: {
    wall: BlockId.PLANKS,
    corner: BlockId.LOG,
    floor: BlockId.COBBLESTONE,
    roof: BlockId.COBBLESTONE,
    path: BlockId.GRAVEL,
    window: BlockId.GLASS,
  },
  desert: {
    wall: BlockId.SANDSTONE,
    corner: BlockId.SANDSTONE,
    floor: BlockId.SANDSTONE,
    roof: BlockId.SANDSTONE,
    path: BlockId.SANDSTONE,
    window: BlockId.GLASS,
  },
};

/** 一座建筑（水井 / 房屋 / 小路）。 */
export interface VillagePiece {
  kind: 'well' | 'house' | 'path';
  bounds: Bounds;
  blocks: StructureBlock[];
}


/** 一座村庄。 */
export interface Village {
  cellX: number;
  cellZ: number;
  centerX: number;
  centerZ: number;
  /** 水井处的地面高度（最高实心方块 y）。 */
  groundY: number;
  style: VillageStyle;
  pieces: VillagePiece[];
  /** 全部建筑的 XZ 包围盒并集。 */
  bounds: Bounds;
  /** 住在这里的村民（chunk 加载时生成）。 */
  villagers: PendingMob[];
}

/** 地面高度查询（最高实心方块 y）。 */
export type GroundHeightFn = (x: number, z: number) => number;
/** 判断某位置属于哪种村庄风格；null 表示此处不生成村庄。 */
export type VillageStyleFn = (x: number, z: number) => VillageStyle | null;

/**
 * 村庄生成器：以 8×8 chunk 为格子，按 seed 决定每格是否有村庄及其布局；
 * 布局只依赖种子与噪声高度，因此任何 chunk 都能独立复现并只写入自己范围内的方块。
 */
export class VillageGenerator {
  private readonly base: number;
  private readonly cache = new Map<number, Village | null>();

  constructor(
    seed: string,
    private readonly groundHeight: GroundHeightFn,
    private readonly styleAt: VillageStyleFn,
  ) {
    this.base = hashString(`${seed}:village`);
  }

  /** 与该 chunk 相交的全部村庄。 */
  villagesNear(cx: number, cz: number): Village[] {
    const minCellX = Math.floor((cx * CHUNK_SIZE - VILLAGE_REACH) / VILLAGE_CELL_BLOCKS);
    const maxCellX = Math.floor((cx * CHUNK_SIZE + CHUNK_SIZE - 1 + VILLAGE_REACH) / VILLAGE_CELL_BLOCKS);
    const minCellZ = Math.floor((cz * CHUNK_SIZE - VILLAGE_REACH) / VILLAGE_CELL_BLOCKS);
    const maxCellZ = Math.floor((cz * CHUNK_SIZE + CHUNK_SIZE - 1 + VILLAGE_REACH) / VILLAGE_CELL_BLOCKS);
    const out: Village[] = [];
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        const village = this.getVillage(cellX, cellZ);
        if (village) {
          out.push(village);
        }
      }
    }
    return out;
  }

  /** 把村庄落在该 chunk 内的方块写入。 */
  placeInChunk(chunk: Chunk): void {
    const bounds = chunkBounds(chunk);
    for (const village of this.villagesNear(chunk.cx, chunk.cz)) {
      if (!boundsIntersectXZ(village.bounds, bounds)) {
        continue;
      }
      for (const piece of village.pieces) {
        if (boundsIntersectXZ(piece.bounds, bounds)) {
          placeBlocksInChunk(chunk, piece.blocks);
        }
      }
      for (const villager of village.villagers) {
        if (chunk.containsColumn(villager.x, villager.z)) {
          chunk.pendingMobs.push(villager);
        }
      }
    }
  }

  /** 该列是否被村庄建筑占用（用于避免在建筑上长树 / 草）。 */
  isReserved(x: number, z: number): boolean {
    for (const village of this.villagesNear(toChunkCoord(x), toChunkCoord(z))) {
      if (x < village.bounds.minX || x > village.bounds.maxX || z < village.bounds.minZ || z > village.bounds.maxZ) {
        continue;
      }
      for (const piece of village.pieces) {
        const b = piece.bounds;
        if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
          return true;
        }
      }
    }
    return false;
  }

  /** 获取（并缓存）某格子的村庄。 */
  getVillage(cellX: number, cellZ: number): Village | null {
    const key = chunkKey(cellX, cellZ);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const village = this.buildVillage(cellX, cellZ);
    this.cache.set(key, village);
    return village;
  }

  private buildVillage(cellX: number, cellZ: number): Village | null {
    const rng = createRng(hashCoords(this.base, cellX, cellZ, SALT_VILLAGE));
    if (rng() >= VILLAGE_CHANCE) {
      return null;
    }
    const span = VILLAGE_CELL_BLOCKS - VILLAGE_MARGIN * 2;
    const centerX = cellX * VILLAGE_CELL_BLOCKS + VILLAGE_MARGIN + Math.floor(rng() * span);
    const centerZ = cellZ * VILLAGE_CELL_BLOCKS + VILLAGE_MARGIN + Math.floor(rng() * span);
    const style = this.styleAt(centerX, centerZ);
    if (!style) {
      return null;
    }
    const groundY = this.groundHeight(centerX, centerZ);
    const palette = PALETTES[style];
    const pieces: VillagePiece[] = [];
    const villagers: PendingMob[] = [];
    pieces.push(this.buildWell(centerX, centerZ, groundY, palette));
    const houseCount = HOUSE_MIN_COUNT + Math.floor(rng() * (HOUSE_MAX_COUNT - HOUSE_MIN_COUNT + 1));
    const houseBounds: Bounds[] = [pieces[0].bounds];
    for (let attempt = 0; attempt < HOUSE_PLACE_ATTEMPTS && houseBounds.length - 1 < houseCount; attempt++) {
      const angle = rng() * Math.PI * 2;
      const distance = HOUSE_MIN_DISTANCE + rng() * (HOUSE_MAX_DISTANCE - HOUSE_MIN_DISTANCE);
      const large = rng() < 0.35;
      const hx = centerX + Math.round(Math.cos(angle) * distance);
      const hz = centerZ + Math.round(Math.sin(angle) * distance);
      const hy = this.groundHeight(hx, hz);
      if (Math.abs(hy - groundY) > MAX_HEIGHT_DIFF) {
        continue;
      }
      const facing = this.facingTowards(hx, hz, centerX, centerZ);
      const { piece: house, doorFront } = this.buildHouse(hx, hz, hy, large, facing, palette);
      const padded: Bounds = {
        ...house.bounds,
        minX: house.bounds.minX - HOUSE_GAP,
        maxX: house.bounds.maxX + HOUSE_GAP,
        minZ: house.bounds.minZ - HOUSE_GAP,
        maxZ: house.bounds.maxZ + HOUSE_GAP,
      };
      if (houseBounds.some((b) => boundsIntersectXZ(b, padded))) {
        continue;
      }
      houseBounds.push(house.bounds);
      pieces.push(house);
      pieces.push(this.buildPath(centerX, centerZ, doorFront.x, doorFront.z, facing, palette));
      // 每间房门口住一个村民
      villagers.push({ x: doorFront.x, y: hy + 1, z: doorFront.z, type: MobType.VILLAGER });
    }
    const bounds = pieces.reduce<Bounds>(
      (acc, p) => ({
        minX: Math.min(acc.minX, p.bounds.minX),
        minY: Math.min(acc.minY, p.bounds.minY),
        minZ: Math.min(acc.minZ, p.bounds.minZ),
        maxX: Math.max(acc.maxX, p.bounds.maxX),
        maxY: Math.max(acc.maxY, p.bounds.maxY),
        maxZ: Math.max(acc.maxZ, p.bounds.maxZ),
      }),
      { ...pieces[0].bounds },
    );
    return { cellX, cellZ, centerX, centerZ, groundY, style, pieces, bounds, villagers };
  }

  /** 房屋朝向：门开在朝向村庄中心的那一面（0=+z,1=-z,2=+x,3=-x）。 */
  private facingTowards(x: number, z: number, targetX: number, targetZ: number): number {
    const dx = targetX - x;
    const dz = targetZ - z;
    if (Math.abs(dx) > Math.abs(dz)) {
      return dx > 0 ? 2 : 3;
    }
    return dz > 0 ? 0 : 1;
  }

  /** 水井：5×5 圆石井圈，内部 3×3 水源，四角立柱与顶盖。 */
  private buildWell(x: number, z: number, groundY: number, palette: Palette): VillagePiece {
    const b = new StructureBuilder();
    const rim = palette.floor;
    // 井身：地面下 3 格到地面上 1 格
    b.fill(x - 2, groundY - 3, z - 2, x + 2, groundY + 1, z + 2, rim);
    b.fill(x - 1, groundY - 2, z - 1, x + 1, groundY, z + 1, BlockId.WATER);
    // 井口上方留空 + 四角柱 + 顶盖
    b.fill(x - 1, groundY + 1, z - 1, x + 1, groundY + 3, z + 1, BlockId.AIR);
    for (const [dx, dz] of [
      [-2, -2],
      [2, -2],
      [-2, 2],
      [2, 2],
    ]) {
      b.fill(x + dx, groundY + 2, z + dz, x + dx, groundY + 3, z + dz, palette.corner);
    }
    b.fill(x - 2, groundY + 4, z - 2, x + 2, groundY + 4, z + 2, rim);
    b.set(x, groundY + 5, z, BlockId.TORCH);
    // 井圈外一圈铺路并把周围地面找平
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === 3) {
          this.levelColumn(b, x + dx, z + dz, groundY, palette.path, groundY + 3);
        }
      }
    }
    return { kind: 'well', bounds: b.getBounds()!, blocks: b.list() };
  }

  /**
   * 房屋：地基 + 木板墙（原木角柱）+ 玻璃窗 + 阶梯式屋顶 + 门洞 + 室内外火把。
   * @param facing 门所在的面
   */
  private buildHouse(
    cx: number,
    cz: number,
    groundY: number,
    large: boolean,
    facing: number,
    palette: Palette,
  ): { piece: VillagePiece; doorFront: { x: number; z: number } } {
    const halfX = large && facing >= 2 ? 2 : large ? 3 : 2;
    const halfZ = large && facing < 2 ? 2 : large ? 3 : 2;
    const x0 = cx - halfX;
    const x1 = cx + halfX;
    const z0 = cz - halfZ;
    const z1 = cz + halfZ;
    const floorY = groundY;
    const b = new StructureBuilder();
    // 地基与找平：脚下补到地形，屋顶上方清空
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        this.levelColumn(b, x, z, floorY, palette.floor, floorY + WALL_HEIGHT + 3 + CLEARANCE_ABOVE_ROOF);
      }
    }
    // 墙
    b.fill(x0, floorY + 1, z0, x1, floorY + WALL_HEIGHT, z1, palette.wall);
    b.fill(x0 + 1, floorY + 1, z0 + 1, x1 - 1, floorY + WALL_HEIGHT, z1 - 1, BlockId.AIR);
    for (const [x, z] of [
      [x0, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ]) {
      b.fill(x, floorY + 1, z, x, floorY + WALL_HEIGHT, z, palette.corner);
    }
    // 窗户：每面墙中段的第 2 层
    const windowY = floorY + 2;
    for (let x = x0 + 2; x <= x1 - 2; x += 2) {
      b.set(x, windowY, z0, palette.window);
      b.set(x, windowY, z1, palette.window);
    }
    for (let z = z0 + 2; z <= z1 - 2; z += 2) {
      b.set(x0, windowY, z, palette.window);
      b.set(x1, windowY, z, palette.window);
    }
    // 屋顶：两层阶梯
    const roofY = floorY + WALL_HEIGHT + 1;
    b.fill(x0 - 1, roofY, z0 - 1, x1 + 1, roofY, z1 + 1, palette.roof);
    b.fill(x0, roofY + 1, z0, x1, roofY + 1, z1, palette.roof);
    if (large) {
      b.fill(x0 + 1, roofY + 2, z0 + 1, x1 - 1, roofY + 2, z1 - 1, palette.roof);
    }
    // 门洞（1×2）与门口火把、室内火把
    const door = this.doorPosition(cx, cz, x0, x1, z0, z1, facing);
    b.fill(door.x, floorY + 1, door.z, door.x, floorY + 2, door.z, BlockId.AIR);
    // 门前两格台阶（与地面齐平），门旁一支火把，室内后墙一支火把
    const perpX = door.outZ;
    const perpZ = door.outX;
    for (let i = 1; i <= 2; i++) {
      this.levelColumn(b, door.x + door.outX * i, door.z + door.outZ * i, floorY, palette.path, floorY + 3);
    }
    b.set(door.x + door.outX + perpX, floorY + 1, door.z + door.outZ + perpZ, BlockId.TORCH);
    b.set(door.x - door.outX * 2, floorY + 1, door.z - door.outZ * 2, BlockId.TORCH);
    // 室内摆一张工作台
    b.set(cx - door.outZ, floorY + 1, cz - door.outX, BlockId.CRAFTING_TABLE);
    return {
      piece: { kind: 'house', bounds: b.getBounds()!, blocks: b.list() },
      doorFront: { x: door.x + door.outX * 2, z: door.z + door.outZ * 2 },
    };
  }

  private doorPosition(
    cx: number,
    cz: number,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    facing: number,
  ): { x: number; z: number; outX: number; outZ: number } {
    switch (facing) {
      case 0:
        return { x: cx, z: z1, outX: 0, outZ: 1 };
      case 1:
        return { x: cx, z: z0, outX: 0, outZ: -1 };
      case 2:
        return { x: x1, z: cz, outX: 1, outZ: 0 };
      default:
        return { x: x0, z: cz, outX: -1, outZ: 0 };
    }
  }

  /** 从水井到房门口的 L 形小路，铺在各列的地面上：先走与门垂直的轴，最后一段正对门。 */
  private buildPath(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    facing: number,
    palette: Palette,
  ): VillagePiece {
    const b = new StructureBuilder();
    const doorOnXSide = facing >= 2;
    const viaX = doorOnXSide ? fromX : toX;
    const viaZ = doorOnXSide ? toZ : fromZ;
    this.pathLine(b, fromX, fromZ, viaX, viaZ, palette.path);
    this.pathLine(b, viaX, viaZ, toX, toZ, palette.path);
    const bounds = b.getBounds() ?? { minX: fromX, maxX: fromX, minZ: fromZ, maxZ: fromZ, minY: 0, maxY: 0 };
    return { kind: 'path', bounds, blocks: b.list() };
  }

  /** 沿单一轴向铺路（两点必须同 x 或同 z）。 */
  private pathLine(b: StructureBuilder, x0: number, z0: number, x1: number, z1: number, id: number): void {
    const stepX = Math.sign(x1 - x0);
    const stepZ = Math.sign(z1 - z0);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= steps; i++) {
      this.pathColumn(b, x0 + stepX * i, z0 + stepZ * i, id);
    }
  }

  /** 把一列的地表换成路面（不改变高度）。 */
  private pathColumn(b: StructureBuilder, x: number, z: number, id: number): void {
    const y = this.groundHeight(x, z);
    b.set(x, y, z, id);
    b.set(x, y + 1, z, BlockId.AIR);
  }

  /** 把一列找平到 floorY：低于地基的补 filler，地基以上到 clearTop 清空。 */
  private levelColumn(
    b: StructureBuilder,
    x: number,
    z: number,
    floorY: number,
    filler: number,
    clearTop: number,
  ): void {
    const ground = this.groundHeight(x, z);
    const from = Math.max(floorY - FOUNDATION_MAX_DEPTH, Math.min(ground, floorY));
    b.fill(x, from, z, x, floorY, z, filler);
    b.fill(x, floorY + 1, z, x, Math.min(WORLD_SIZE_Y - 1, clearTop), z, BlockId.AIR);
  }
}
