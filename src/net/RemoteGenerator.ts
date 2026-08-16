/**
 * 联机客户端用的"生成器"：本地不生成地形，而是先给一个空 chunk 占位并向服务端要数据，
 * 数据回来后由 Game 用真数据替换掉占位的那个。
 *
 * 这样 ChunkManager 的流式加载 / 卸载逻辑完全不用改，单机与联机共用同一套。
 */

import type { Chunk } from '../engine/world/Chunk';
import type { ChunkGenerator, SpawnPoint } from '../engine/world/ChunkGenerator';

/** 向服务端要 chunk 的回调。 */
export type ChunkRequester = (cx: number, cz: number) => void;

/** 联机客户端的地形来源。 */
export class RemoteGenerator implements ChunkGenerator {
  constructor(
    readonly seed: string,
    private readonly request: ChunkRequester,
    private readonly spawn: SpawnPoint,
  ) {}

  /** 先留空，同时向服务端索取真数据。 */
  generateChunk(chunk: Chunk): void {
    this.request(chunk.cx, chunk.cz);
  }

  findSpawn(): SpawnPoint {
    return this.spawn;
  }

  biomeAt(): string {
    return 'multiplayer';
  }
}
