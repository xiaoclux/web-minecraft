import type { DebugInfo } from '../engine/events/GameState';

/** F3 调试信息。 */
export function DebugOverlay({ info }: { info: DebugInfo }) {
  return (
    <div className="debug-overlay">
      <div>Web Minecraft (1.8.9-like) · {info.fps} fps</div>
      <div>
        XYZ: {info.x.toFixed(2)} / {info.y.toFixed(2)} / {info.z.toFixed(2)}
      </div>
      <div>
        Chunk: {info.chunkX}, {info.chunkZ} · Facing: {info.facing}
      </div>
      <div>Biome: {info.biome}</div>
      <div>Light: {info.light}</div>
      <div>
        Entities: {info.entities} · Tick: {info.tick}
      </div>
    </div>
  );
}
