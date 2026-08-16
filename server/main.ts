/**
 * 局域网专用服务端：跑一份与浏览器完全相同的世界代码，通过 WebSocket 服务客户端。
 *
 * 用法：`npm run server -- [--port 8080] [--seed 我的世界] [--type normal|flat]`
 * 启动后会打印局域网地址，同一个 Wi-Fi 下的浏览器填进"多人游戏"即可加入。
 */

import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_RENDER_DISTANCE, WorldType } from '../src/engine/constants/world';
import { createChunkGenerator } from '../src/engine/world/ChunkGenerator';
import { ChunkManager } from '../src/engine/world/ChunkManager';
import { LightEngine } from '../src/engine/world/LightEngine';
import { World } from '../src/engine/world/World';
import { ServerCore, TIME_SYNC_INTERVAL_MS, type Connection } from '../src/net/ServerCore';

/** 默认端口。 */
const DEFAULT_PORT = 8080;
/** 服务端每秒推进多少 tick（与客户端一致）。 */
const TICKS_PER_SECOND = 20;
/** 开服时先生成出生点周围多少 chunk。 */
const SPAWN_PRELOAD = 2;

/** 解析命令行参数。 */
function parseArgs(argv: string[]): { port: number; seed: string; worldType: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i].startsWith('--')) {
      args.set(argv[i].slice(2), argv[i + 1]);
    }
  }
  const port = Number.parseInt(args.get('port') ?? '', 10);
  return {
    port: Number.isFinite(port) ? port : DEFAULT_PORT,
    seed: args.get('seed') ?? `server-${Date.now()}`,
    worldType: args.get('type') === 'flat' ? WorldType.FLAT : WorldType.NORMAL,
  };
}

/** 找出本机的局域网地址，方便直接念给别人听。 */
function localAddresses(): string[] {
  const out: string[] = [];
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        out.push(info.address);
      }
    }
  }
  return out;
}

const options = parseArgs(process.argv.slice(2));
const world = new World(true);
const generator = createChunkGenerator({
  seed: options.seed,
  worldType: options.worldType,
  generateStructures: true,
});
const light = new LightEngine(world);
const chunkManager = new ChunkManager(world, generator, light);
const spawn = generator.findSpawn();
chunkManager.ensureLoaded(spawn.x, spawn.z, SPAWN_PRELOAD);

let timeTick = 0;
const server = new ServerCore({
  world,
  chunkManager,
  seed: options.seed,
  worldType: options.worldType,
  currentTime: () => timeTick,
  spawnPoint: () => spawn,
});

const wss = new WebSocketServer({ port: options.port });
wss.on('connection', (socket: WebSocket) => {
  const connection: Connection = {
    send: (bytes) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(bytes);
      }
    },
    close: () => socket.close(),
  };
  const playerId = server.addConnection(connection);
  socket.binaryType = 'arraybuffer';
  socket.on('message', (data: ArrayBuffer | Buffer) => {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data);
    server.handleMessage(playerId, bytes);
  });
  socket.on('close', () => server.removeConnection(playerId));
  socket.on('error', () => server.removeConnection(playerId));
});

// 世界时间照常推进；chunk 由客户端按需索取，服务端不必自己 update
setInterval(() => {
  timeTick++;
}, 1000 / TICKS_PER_SECOND);
setInterval(() => server.syncTime(), TIME_SYNC_INTERVAL_MS);

const addresses = localAddresses();
process.stdout.write(
  [
    `世界已就绪：种子 ${options.seed}（${options.worldType}），出生点 ${Math.round(spawn.x)} ${Math.round(spawn.y)} ${Math.round(spawn.z)}`,
    `渲染距离建议不超过 ${DEFAULT_RENDER_DISTANCE}`,
    '在浏览器的「多人游戏」里填入以下地址之一：',
    ...addresses.map((address) => `  ws://${address}:${options.port}`),
    `  ws://localhost:${options.port}（本机测试）`,
    '',
  ].join('\n'),
);
