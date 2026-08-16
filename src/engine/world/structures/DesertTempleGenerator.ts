import { BlockId } from '../../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../../constants/world';
import { createRng, hashCoords, hashString } from '../../textures/PixelCanvas';
import type { Chunk } from '../Chunk';
import { LootTable } from './LootTables';
import { boundsIntersectXZ, chunkBounds, placeBlocksInChunk, StructureBuilder } from './StructureBuilder';

/** 神殿格子大小（chunk）：每个格子最多一座。 */
export const TEMPLE_CELL_CHUNKS = 16;
const TEMPLE_CELL_BLOCKS = TEMPLE_CELL_CHUNKS * CHUNK_SIZE;
/** 每个格子出现神殿的概率。 */
const TEMPLE_CHANCE = 0.55;
/** 神殿中心离格子边缘的最小距离。 */
const TEMPLE_MARGIN = 24;
/** 金字塔底边半径与层数。 */
const BASE_RADIUS = 9;
const STEPS = 5;
/** 地下宝库的深度与半径。 */
const VAULT_DEPTH = 9;
const VAULT_RADIUS = 2;
const SALT_TEMPLE = 313;

/** 一座沙漠神殿。 */
export interface DesertTemple {
  centerX: number;
  centerZ: number;
  /** 地面高度（金字塔底面 y）。 */
  groundY: number;
}

/**
 * 沙漠神殿：砂岩金字塔 + 地下宝库（四个战利品箱围着一堆 TNT）。
 * 1.8.9 里踩压力板会引爆 TNT，压力板还没做，所以这里 TNT 只是"埋在下面"。
 */
export class DesertTempleGenerator {
  private readonly baseSeed: number;

  constructor(
    seed: string,
    private readonly groundHeightAt: (x: number, z: number) => number,
    private readonly isDesert: (x: number, z: number) => boolean,
  ) {
    this.baseSeed = hashString(seed);
  }

  /** 某个格子里的神殿（没有则返回 null）。 */
  getTemple(cellX: number, cellZ: number): DesertTemple | null {
    const rng = createRng(hashCoords(this.baseSeed, cellX, cellZ, SALT_TEMPLE));
    if (rng() >= TEMPLE_CHANCE) {
      return null;
    }
    const span = TEMPLE_CELL_BLOCKS - TEMPLE_MARGIN * 2;
    const centerX = cellX * TEMPLE_CELL_BLOCKS + TEMPLE_MARGIN + Math.floor(rng() * span);
    const centerZ = cellZ * TEMPLE_CELL_BLOCKS + TEMPLE_MARGIN + Math.floor(rng() * span);
    // 中心与四角都得在沙漠里，免得半座神殿插进草地
    for (const [dx, dz] of [
      [0, 0],
      [-BASE_RADIUS, -BASE_RADIUS],
      [BASE_RADIUS, -BASE_RADIUS],
      [-BASE_RADIUS, BASE_RADIUS],
      [BASE_RADIUS, BASE_RADIUS],
    ]) {
      if (!this.isDesert(centerX + dx, centerZ + dz)) {
        return null;
      }
    }
    return { centerX, centerZ, groundY: this.groundHeightAt(centerX, centerZ) };
  }

  /** 把可能影响该 chunk 的神殿写进去。 */
  placeInChunk(chunk: Chunk): void {
    const cell = Math.floor((chunk.cx * CHUNK_SIZE) / TEMPLE_CELL_BLOCKS);
    const cellZ = Math.floor((chunk.cz * CHUNK_SIZE) / TEMPLE_CELL_BLOCKS);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const temple = this.getTemple(cell + dx, cellZ + dz);
        if (temple && boundsIntersectXZ(chunkBounds(chunk), this.boundsOf(temple))) {
          this.build(chunk, temple);
        }
      }
    }
  }

  /** 神殿占用的 XZ 范围（供植被避让与 chunk 裁剪）。 */
  boundsOf(temple: DesertTemple): {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
    minY: number;
    maxY: number;
  } {
    return {
      minX: temple.centerX - BASE_RADIUS,
      maxX: temple.centerX + BASE_RADIUS,
      minZ: temple.centerZ - BASE_RADIUS,
      maxZ: temple.centerZ + BASE_RADIUS,
      minY: temple.groundY - VAULT_DEPTH,
      maxY: temple.groundY + STEPS + 2,
    };
  }

  /** 该列是否被神殿占用（植被避让用）。 */
  isReserved(x: number, z: number): boolean {
    const cell = Math.floor(x / TEMPLE_CELL_BLOCKS);
    const cellZ = Math.floor(z / TEMPLE_CELL_BLOCKS);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const temple = this.getTemple(cell + dx, cellZ + dz);
        if (!temple) {
          continue;
        }
        const b = this.boundsOf(temple);
        if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
          return true;
        }
      }
    }
    return false;
  }

  private build(chunk: Chunk, temple: DesertTemple): void {
    const b = new StructureBuilder();
    const { centerX: cx, centerZ: cz, groundY } = temple;
    // 阶梯金字塔：每往上一层缩一圈
    for (let step = 0; step < STEPS; step++) {
      const r = BASE_RADIUS - step * 2;
      const y = groundY + step;
      b.fill(cx - r, y, cz - r, cx + r, y, cz + r, BlockId.SANDSTONE);
      if (step > 0) {
        // 中间掏空成一间屋子
        b.fill(cx - r + 1, y, cz - r + 1, cx + r - 1, y, cz + r - 1, BlockId.AIR);
      }
    }
    b.fill(cx - 1, groundY + STEPS, cz - 1, cx + 1, groundY + STEPS, cz + 1, BlockId.SANDSTONE);
    // 地基填到地下，免得悬空
    b.fill(
      cx - BASE_RADIUS,
      groundY - 4,
      cz - BASE_RADIUS,
      cx + BASE_RADIUS,
      groundY - 1,
      cz + BASE_RADIUS,
      BlockId.SANDSTONE,
    );
    // 地下宝库
    const vaultY = groundY - VAULT_DEPTH;
    b.fill(
      cx - VAULT_RADIUS - 1,
      vaultY - 1,
      cz - VAULT_RADIUS - 1,
      cx + VAULT_RADIUS + 1,
      vaultY + 3,
      cz + VAULT_RADIUS + 1,
      BlockId.SANDSTONE,
    );
    b.fill(cx - VAULT_RADIUS, vaultY, cz - VAULT_RADIUS, cx + VAULT_RADIUS, vaultY + 2, cz + VAULT_RADIUS, BlockId.AIR);
    // 正中埋 TNT
    b.set(cx, vaultY, cz, BlockId.TNT);
    placeBlocksInChunk(chunk, b.list());
    // 四角各一个战利品箱
    for (const [dx, dz] of [
      [-VAULT_RADIUS, 0],
      [VAULT_RADIUS, 0],
      [0, -VAULT_RADIUS],
      [0, VAULT_RADIUS],
    ]) {
      const x = cx + dx;
      const z = cz + dz;
      chunk.setWorld(x, vaultY + 1, z, BlockId.CHEST);
      if (chunk.containsColumn(x, z)) {
        chunk.pendingBlockEntities.push({ x, y: vaultY + 1, z, loot: LootTable.DESERT_TEMPLE });
      }
    }
  }
}
