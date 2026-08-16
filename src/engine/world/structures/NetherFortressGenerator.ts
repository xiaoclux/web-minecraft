/**
 * 下界要塞：由下界砖搭的一段桥 + 一座塔楼，塔里有烈焰人刷怪笼，桥边有下界疣园。
 * 与其他结构一样只由 (seed, 格子坐标) 决定，chunk 可以随时丢弃再生。
 */

import { BlockId } from '../../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../../constants/world';
import { MobType } from '../../entities/MobDefs';
import { createRng, hashCoords, hashString } from '../../textures/PixelCanvas';
import { chunkKey, type Chunk } from '../Chunk';
import { boundsIntersectXZ, chunkBounds, placeBlocksInChunk, StructureBuilder, type Bounds } from './StructureBuilder';

/** 要塞格子大小（chunk）：每个格子最多一座。 */
export const FORTRESS_CELL_CHUNKS = 24;
const FORTRESS_CELL_BLOCKS = FORTRESS_CELL_CHUNKS * CHUNK_SIZE;
/** 每个格子里出现要塞的概率。 */
const FORTRESS_CHANCE = 0.7;
/** 中心离格子边缘的最小距离。 */
const FORTRESS_MARGIN = 32;
/** 桥的长度（沿 X）与半宽。 */
const BRIDGE_LENGTH = 40;
const BRIDGE_HALF_WIDTH = 2;
/** 塔楼尺寸。 */
const TOWER_HALF = 5;
const TOWER_HEIGHT = 12;
/** 要塞建在这个高度（下界岩浆海之上）。 */
const FORTRESS_Y = 48;
/** 下界疣园的大小。 */
const WART_FARM_HALF = 2;
const SALT_FORTRESS = 8123;

/** 一座下界要塞。 */
export interface NetherFortress {
  centerX: number;
  centerZ: number;
  y: number;
  bounds: Bounds;
}

/** 下界要塞生成器。 */
export class NetherFortressGenerator {
  private readonly baseSeed: number;
  private readonly cache = new Map<number, NetherFortress | null>();

  constructor(seed: string) {
    this.baseSeed = hashString(`${seed}:fortress`);
  }

  /** 某个格子里的要塞（没有则 null）。 */
  getFortress(cellX: number, cellZ: number): NetherFortress | null {
    const key = chunkKey(cellX, cellZ);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const fortress = this.rollFortress(cellX, cellZ);
    this.cache.set(key, fortress);
    return fortress;
  }

  private rollFortress(cellX: number, cellZ: number): NetherFortress | null {
    const rng = createRng(hashCoords(this.baseSeed, cellX, cellZ, SALT_FORTRESS));
    if (rng() >= FORTRESS_CHANCE) {
      return null;
    }
    const span = FORTRESS_CELL_BLOCKS - FORTRESS_MARGIN * 2;
    const centerX = cellX * FORTRESS_CELL_BLOCKS + FORTRESS_MARGIN + Math.floor(rng() * span);
    const centerZ = cellZ * FORTRESS_CELL_BLOCKS + FORTRESS_MARGIN + Math.floor(rng() * span);
    return {
      centerX,
      centerZ,
      y: FORTRESS_Y,
      bounds: {
        minX: centerX - BRIDGE_LENGTH / 2 - 2,
        maxX: centerX + BRIDGE_LENGTH / 2 + 2,
        minZ: centerZ - TOWER_HALF - 2,
        maxZ: centerZ + TOWER_HALF + 2,
        minY: FORTRESS_Y - 4,
        maxY: FORTRESS_Y + TOWER_HEIGHT + 2,
      },
    };
  }

  /** 把可能影响该 chunk 的要塞写进去。 */
  placeInChunk(chunk: Chunk): void {
    const cellX = Math.floor((chunk.cx * CHUNK_SIZE) / FORTRESS_CELL_BLOCKS);
    const cellZ = Math.floor((chunk.cz * CHUNK_SIZE) / FORTRESS_CELL_BLOCKS);
    const bounds = chunkBounds(chunk);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const fortress = this.getFortress(cellX + dx, cellZ + dz);
        if (fortress && boundsIntersectXZ(bounds, fortress.bounds)) {
          this.build(chunk, fortress);
        }
      }
    }
  }

  private build(chunk: Chunk, fortress: NetherFortress): void {
    const b = new StructureBuilder();
    const { centerX: cx, centerZ: cz, y } = fortress;
    const half = BRIDGE_LENGTH / 2;
    // 桥面 + 两侧栏杆
    b.fill(cx - half, y, cz - BRIDGE_HALF_WIDTH, cx + half, y, cz + BRIDGE_HALF_WIDTH, BlockId.NETHER_BRICKS);
    b.fill(cx - half, y + 1, cz - BRIDGE_HALF_WIDTH, cx + half, y + 1, cz - BRIDGE_HALF_WIDTH, BlockId.NETHER_BRICKS);
    b.fill(cx - half, y + 1, cz + BRIDGE_HALF_WIDTH, cx + half, y + 1, cz + BRIDGE_HALF_WIDTH, BlockId.NETHER_BRICKS);
    // 桥下每隔一段来一根支柱
    for (let x = cx - half; x <= cx + half; x += 8) {
      b.fill(x, y - 4, cz, x, y - 1, cz, BlockId.NETHER_BRICKS);
    }
    // 塔楼：外墙 + 掏空
    b.fill(
      cx - TOWER_HALF,
      y,
      cz - TOWER_HALF,
      cx + TOWER_HALF,
      y + TOWER_HEIGHT,
      cz + TOWER_HALF,
      BlockId.NETHER_BRICKS,
    );
    b.fill(
      cx - TOWER_HALF + 1,
      y + 1,
      cz - TOWER_HALF + 1,
      cx + TOWER_HALF - 1,
      y + TOWER_HEIGHT - 1,
      cz + TOWER_HALF - 1,
      BlockId.AIR,
    );
    // 塔顶开口
    b.fill(
      cx - TOWER_HALF + 1,
      y + TOWER_HEIGHT,
      cz - TOWER_HALF + 1,
      cx + TOWER_HALF - 1,
      y + TOWER_HEIGHT,
      cz + TOWER_HALF - 1,
      BlockId.AIR,
    );
    // 下界疣园：灵魂沙上种一片疣
    const farmX = cx + half - WART_FARM_HALF - 2;
    b.fill(
      farmX - WART_FARM_HALF,
      y,
      cz - WART_FARM_HALF,
      farmX + WART_FARM_HALF,
      y,
      cz + WART_FARM_HALF,
      BlockId.SOUL_SAND,
    );
    b.fill(
      farmX - WART_FARM_HALF,
      y + 1,
      cz - WART_FARM_HALF,
      farmX + WART_FARM_HALF,
      y + 1,
      cz + WART_FARM_HALF,
      BlockId.NETHER_WART,
    );
    placeBlocksInChunk(chunk, b.list());
    // 塔中央的烈焰人刷怪笼
    const spawnerY = y + 1;
    chunk.setWorld(cx, spawnerY, cz, BlockId.MOB_SPAWNER);
    if (chunk.containsColumn(cx, cz)) {
      chunk.pendingBlockEntities.push({ x: cx, y: spawnerY, z: cz, spawns: MobType.BLAZE });
    }
  }
}
