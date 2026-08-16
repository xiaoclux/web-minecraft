import { BlockId } from '../../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../../constants/world';
import { createRng, hashCoords, hashString } from '../../textures/PixelCanvas';
import type { Chunk } from '../Chunk';
import { LootTable } from './LootTables';
import { placeBlocksInChunk, StructureBuilder } from './StructureBuilder';

/** 每个 chunk 尝试生成地牢的次数与概率。 */
const DUNGEON_ATTEMPTS = 8;
const DUNGEON_CHANCE = 0.006;
/** 地牢的 y 范围。 */
const DUNGEON_MIN_Y = 8;
const DUNGEON_MAX_Y = 56;
/** 房间半径范围（不含墙）。 */
const ROOM_MIN_RADIUS = 2;
const ROOM_MAX_RADIUS = 3;
const ROOM_HEIGHT = 3;
/** 墙面苔石的比例。 */
const MOSSY_CHANCE = 0.35;
/** 每个地牢的箱子数量与刷怪笼生物。 */
const CHEST_ATTEMPTS = 2;
const SPAWNER_MOBS = ['zombie', 'skeleton', 'spider'] as const;
const SALT_DUNGEON = 211;

/** 一座地牢：位置、大小与刷怪笼生物。 */
interface Dungeon {
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  mob: string;
  seed: number;
}

/**
 * 地牢：地下的小石室，中间一个刷怪笼、角落里一两个战利品箱。
 * 与其他结构一样，只由 (seed, chunk 坐标) 决定，chunk 可以随时丢弃再生。
 */
export class DungeonGenerator {
  private readonly baseSeed: number;

  /**
   * @param isDeepUnderground 判断某点是否埋得够深（由地形生成器提供，只看噪声高度，
   *   与 chunk 数据无关，保证跨 chunk 的地牢形状一致）
   */
  constructor(
    seed: string,
    private readonly isDeepUnderground: (x: number, y: number, z: number) => boolean,
  ) {
    this.baseSeed = hashString(seed);
  }

  /** 该 chunk 里生成的地牢（不含邻居 chunk 的）。 */
  private dungeonsIn(cx: number, cz: number): Dungeon[] {
    const rng = createRng(hashCoords(this.baseSeed, cx, cz, SALT_DUNGEON));
    const out: Dungeon[] = [];
    for (let i = 0; i < DUNGEON_ATTEMPTS; i++) {
      const roll = rng();
      const x = cx * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
      const z = cz * CHUNK_SIZE + Math.floor(rng() * CHUNK_SIZE);
      const y = DUNGEON_MIN_Y + Math.floor(rng() * (DUNGEON_MAX_Y - DUNGEON_MIN_Y));
      const radiusX = ROOM_MIN_RADIUS + Math.floor(rng() * (ROOM_MAX_RADIUS - ROOM_MIN_RADIUS + 1));
      const radiusZ = ROOM_MIN_RADIUS + Math.floor(rng() * (ROOM_MAX_RADIUS - ROOM_MIN_RADIUS + 1));
      const mob = SPAWNER_MOBS[Math.floor(rng() * SPAWNER_MOBS.length)];
      const seed = Math.floor(rng() * 0xffffffff);
      if (roll < DUNGEON_CHANCE && this.isDeepUnderground(x, y + ROOM_HEIGHT + 1, z)) {
        out.push({ x, y, z, radiusX, radiusZ, mob, seed });
      }
    }
    return out;
  }

  /**
   * 把可能影响该 chunk 的地牢写进去。
   * 地牢最大半径 3 + 墙，不会跨出相邻 chunk，所以只看 3×3 邻域。
   */
  placeInChunk(chunk: Chunk): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const dungeon of this.dungeonsIn(chunk.cx + dx, chunk.cz + dz)) {
          this.build(chunk, dungeon);
        }
      }
    }
  }

  private build(chunk: Chunk, dungeon: Dungeon): void {
    const rng = createRng(dungeon.seed);
    const b = new StructureBuilder();
    const { x, y, z, radiusX, radiusZ } = dungeon;
    // 外壳（圆石 / 苔石）
    for (let dy = -1; dy <= ROOM_HEIGHT; dy++) {
      for (let dz = -radiusZ - 1; dz <= radiusZ + 1; dz++) {
        for (let dx = -radiusX - 1; dx <= radiusX + 1; dx++) {
          const isShell =
            dy === -1 || dy === ROOM_HEIGHT || Math.abs(dx) === radiusX + 1 || Math.abs(dz) === radiusZ + 1;
          const id = isShell ? (rng() < MOSSY_CHANCE ? BlockId.MOSSY_COBBLESTONE : BlockId.COBBLESTONE) : BlockId.AIR;
          b.set(x + dx, y + dy, z + dz, id);
        }
      }
    }
    b.set(x, y, z, BlockId.MOB_SPAWNER);
    placeBlocksInChunk(chunk, b.list());
    if (chunk.containsColumn(x, z)) {
      chunk.pendingBlockEntities.push({ x, y, z, spawns: dungeon.mob });
    }
    // 箱子贴着墙角放
    for (let i = 0; i < CHEST_ATTEMPTS; i++) {
      const cx = x + (rng() < 0.5 ? -radiusX : radiusX);
      const cz = z + (rng() < 0.5 ? -radiusZ : radiusZ);
      if (chunk.getWorld(cx, y, cz) !== BlockId.AIR) {
        continue;
      }
      chunk.setWorld(cx, y, cz, BlockId.CHEST);
      if (chunk.containsColumn(cx, cz)) {
        chunk.pendingBlockEntities.push({ x: cx, y, z: cz, loot: LootTable.DUNGEON });
      }
    }
  }
}
