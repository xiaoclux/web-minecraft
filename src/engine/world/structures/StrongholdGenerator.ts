/**
 * 要塞：埋在地下的一间石砖房，正中是末地传送门框架（12 块围成方形），旁边一间小图书馆。
 * 1.8.9 里要塞是一大片房间迷宫，这里先做"传送门房 + 图书馆"这个玩法必需的核心部分。
 * 每个世界按种子固定若干座，末影之眼靠它们定位。
 */

import { BlockId } from '../../blocks/BlockRegistry';
import { createRng, hashString } from '../../textures/PixelCanvas';
import type { Chunk } from '../Chunk';
import { LootTable } from './LootTables';
import { boundsIntersectXZ, chunkBounds, placeBlocksInChunk, StructureBuilder, type Bounds } from './StructureBuilder';

/** 每个世界的要塞数量（1.8.9 是 3 个）。 */
export const STRONGHOLD_COUNT = 3;
/** 要塞离出生点的距离范围。 */
const MIN_DISTANCE = 320;
const MAX_DISTANCE = 900;
/** 传送门房的内部半径与高度。 */
const ROOM_HALF = 6;
const ROOM_HEIGHT = 6;
/** 传送门框架的半径（3×3 的洞，四边各 3 块框架）。 */
const PORTAL_HALF = 2;
/** 要塞埋的深度范围。 */
const MIN_Y = 12;
const MAX_Y = 40;
/** 苔石砖的比例。 */
const MOSSY_CHANCE = 0.2;
const SALT_STRONGHOLD = 60013;

/** 一座要塞。 */
export interface Stronghold {
  centerX: number;
  centerZ: number;
  y: number;
  bounds: Bounds;
}

/** 要塞生成器：位置只由种子决定，便于末影之眼指路。 */
export class StrongholdGenerator {
  private readonly strongholds: Stronghold[];

  constructor(seed: string) {
    this.strongholds = this.rollStrongholds(seed);
  }

  /** 全部要塞（末影之眼用来找最近的一座）。 */
  get all(): readonly Stronghold[] {
    return this.strongholds;
  }

  private rollStrongholds(seed: string): Stronghold[] {
    const rng = createRng(hashString(`${seed}:stronghold`) ^ SALT_STRONGHOLD);
    const out: Stronghold[] = [];
    for (let i = 0; i < STRONGHOLD_COUNT; i++) {
      // 均匀分布在三个方向上，避免全挤在一边
      const angle = ((i + rng()) / STRONGHOLD_COUNT) * Math.PI * 2;
      const distance = MIN_DISTANCE + rng() * (MAX_DISTANCE - MIN_DISTANCE);
      const centerX = Math.round(Math.cos(angle) * distance);
      const centerZ = Math.round(Math.sin(angle) * distance);
      const y = MIN_Y + Math.floor(rng() * (MAX_Y - MIN_Y));
      out.push({
        centerX,
        centerZ,
        y,
        bounds: {
          minX: centerX - ROOM_HALF - 1,
          maxX: centerX + ROOM_HALF + 1,
          minZ: centerZ - ROOM_HALF - 1,
          maxZ: centerZ + ROOM_HALF + 1,
          minY: y - 1,
          maxY: y + ROOM_HEIGHT + 1,
        },
      });
    }
    return out;
  }

  /** 离某点最近的要塞（末影之眼指向它）。 */
  nearest(x: number, z: number): Stronghold | null {
    let best: Stronghold | null = null;
    let bestDistanceSq = Infinity;
    for (const stronghold of this.strongholds) {
      const dx = stronghold.centerX - x;
      const dz = stronghold.centerZ - z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = stronghold;
      }
    }
    return best;
  }

  /** 把可能影响该 chunk 的要塞写进去。 */
  placeInChunk(chunk: Chunk): void {
    const bounds = chunkBounds(chunk);
    for (const stronghold of this.strongholds) {
      if (boundsIntersectXZ(bounds, stronghold.bounds)) {
        this.build(chunk, stronghold);
      }
    }
  }

  private build(chunk: Chunk, stronghold: Stronghold): void {
    const rng = createRng(hashString(`${stronghold.centerX}:${stronghold.centerZ}`));
    const b = new StructureBuilder();
    const { centerX: cx, centerZ: cz, y } = stronghold;
    // 房间外壳：石砖 / 苔石砖，内部掏空
    for (let dy = -1; dy <= ROOM_HEIGHT; dy++) {
      for (let dz = -ROOM_HALF - 1; dz <= ROOM_HALF + 1; dz++) {
        for (let dx = -ROOM_HALF - 1; dx <= ROOM_HALF + 1; dx++) {
          const isShell =
            dy === -1 || dy === ROOM_HEIGHT || Math.abs(dx) === ROOM_HALF + 1 || Math.abs(dz) === ROOM_HALF + 1;
          // 石砖偶尔换成苔石，做出年久失修的感觉
          const id = isShell ? (rng() < MOSSY_CHANCE ? BlockId.MOSSY_COBBLESTONE : BlockId.STONE_BRICKS) : BlockId.AIR;
          b.set(cx + dx, y + dy, cz + dz, id);
        }
      }
    }
    // 中央的末地传送门框架：一个 3×3 的坑，四边围 12 块框架
    for (let dz = -PORTAL_HALF; dz <= PORTAL_HALF; dz++) {
      for (let dx = -PORTAL_HALF; dx <= PORTAL_HALF; dx++) {
        const onEdge = Math.abs(dx) === PORTAL_HALF || Math.abs(dz) === PORTAL_HALF;
        const isCorner = Math.abs(dx) === PORTAL_HALF && Math.abs(dz) === PORTAL_HALF;
        if (isCorner) {
          b.set(cx + dx, y, cz + dz, BlockId.STONE_BRICKS);
          continue;
        }
        if (onEdge) {
          // 框架朝向房间中心
          const facing = dx === -PORTAL_HALF ? 3 : dx === PORTAL_HALF ? 1 : dz === -PORTAL_HALF ? 0 : 2;
          b.set(cx + dx, y, cz + dz, BlockId.END_PORTAL_FRAME, facing);
          continue;
        }
        b.set(cx + dx, y, cz + dz, BlockId.AIR);
      }
    }
    // 图书馆一角：书架 + 一个战利品箱
    const libX = cx - ROOM_HALF + 1;
    const libZ = cz - ROOM_HALF + 1;
    b.fill(libX, y, libZ, libX + 2, y + 1, libZ, BlockId.BOOKSHELF);
    placeBlocksInChunk(chunk, b.list());
    const chestX = libX + 3;
    chunk.setWorld(chestX, y, libZ, BlockId.CHEST);
    if (chunk.containsColumn(chestX, libZ)) {
      chunk.pendingBlockEntities.push({ x: chestX, y, z: libZ, loot: LootTable.MINESHAFT });
    }
  }
}
