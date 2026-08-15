import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Game, SlotRef } from '../engine/Game';
import { GameMode, HOTBAR_SIZE, INVENTORY_SIZE } from '../engine/constants/game';
import { MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT } from '../engine/constants/keys';
import { TOUCH_LONG_PRESS_MS } from '../engine/constants/ui';
import { Screen, type GameUiState } from '../engine/events/GameState';
import { SMELT_TICKS } from '../engine/items/Furnace';
import { ITEM_DEFS, ItemKind } from '../engine/items/ItemRegistry';
import type { ItemStack } from '../engine/items/ItemStack';
import { ItemIcon } from './ItemIcon';

interface InventoryScreenProps {
  game: Game;
  state: GameUiState;
}

const CREATIVE_TABS = [
  { key: 'blocks', label: '方块', filter: (kind: string) => kind === ItemKind.BLOCK },
  { key: 'tools', label: '工具', filter: (kind: string) => kind === ItemKind.TOOL },
  { key: 'food', label: '食物', filter: (kind: string) => kind === ItemKind.FOOD },
  { key: 'materials', label: '材料', filter: (kind: string) => kind === ItemKind.MATERIAL },
] as const;

function Slot({
  game,
  refer,
  stack,
  className,
}: {
  game: Game;
  refer: SlotRef;
  stack: ItemStack | null;
  className?: string;
}) {
  // 触屏没有右键：按住超过 TOUCH_LONG_PRESS_MS 视为右键（取半 / 放一个）
  const longPressTimer = useRef<number | null>(null);
  const clearLongPress = (): void => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.button === MOUSE_MIDDLE) {
      return;
    }
    if (e.pointerType !== 'touch') {
      game.handleSlotClick(refer, e.button, e.shiftKey);
      return;
    }
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      game.handleSlotClick(refer, MOUSE_RIGHT, false);
    }, TOUCH_LONG_PRESS_MS);
  };
  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.pointerType !== 'touch') {
      return;
    }
    if (longPressTimer.current !== null) {
      clearLongPress();
      game.handleSlotClick(refer, MOUSE_LEFT, false);
    }
  };
  return (
    <div
      className={`slot${className ? ` ${className}` : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={clearLongPress}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ItemIcon stack={stack} />
    </div>
  );
}

function InventoryGrid({ game }: { game: Game }) {
  const inv = game.player.inventory;
  const mainIndices = useMemo(
    () => Array.from({ length: INVENTORY_SIZE - HOTBAR_SIZE }, (_, i) => i + HOTBAR_SIZE),
    [],
  );
  const hotbarIndices = useMemo(() => Array.from({ length: HOTBAR_SIZE }, (_, i) => i), []);
  return (
    <div className="inventory-grid">
      <div className="slot-grid cols-9">
        {mainIndices.map((i) => (
          <Slot key={i} game={game} refer={{ kind: 'inventory', index: i }} stack={inv.get(i)} />
        ))}
      </div>
      <div className="slot-grid cols-9 hotbar-row">
        {hotbarIndices.map((i) => (
          <Slot key={i} game={game} refer={{ kind: 'inventory', index: i }} stack={inv.get(i)} />
        ))}
      </div>
    </div>
  );
}

function CraftingArea({ game, size }: { game: Game; size: number }) {
  const cells = useMemo(() => {
    const out: number[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        out.push(r * 3 + c);
      }
    }
    return out;
  }, [size]);
  const result = game.craftResult();
  return (
    <div className="crafting-area">
      <div className="section-title">{size === 3 ? '工作台' : '合成'}</div>
      <div className="crafting-row">
        <div className={`slot-grid cols-${size}`}>
          {cells.map((i) => (
            <Slot key={i} game={game} refer={{ kind: 'craft', index: i }} stack={game.craftingGrid[i] ?? null} />
          ))}
        </div>
        <div className="arrow">→</div>
        <Slot game={game} refer={{ kind: 'craftResult', index: 0 }} stack={result} className="result" />
      </div>
    </div>
  );
}

function FurnaceArea({ game }: { game: Game }) {
  const furnace = game.openFurnace;
  if (!furnace) {
    return null;
  }
  const burnRatio = furnace.burnTotal > 0 ? furnace.burnTicks / furnace.burnTotal : 0;
  const cookRatio = furnace.cookTicks / SMELT_TICKS;
  return (
    <div className="furnace-area">
      <div className="section-title">熔炉</div>
      <div className="furnace-row">
        <div className="furnace-column">
          <Slot game={game} refer={{ kind: 'furnaceInput', index: 0 }} stack={furnace.input} />
          <div className="fire">
            <div className="fire-fill" style={{ height: `${Math.round(burnRatio * 100)}%` }} />
          </div>
          <Slot game={game} refer={{ kind: 'furnaceFuel', index: 0 }} stack={furnace.fuel} />
        </div>
        <div className="progress-arrow">
          <div className="progress-fill" style={{ width: `${Math.round(cookRatio * 100)}%` }} />
        </div>
        <Slot game={game} refer={{ kind: 'furnaceOutput', index: 0 }} stack={furnace.output} className="result" />
      </div>
    </div>
  );
}

function CreativeList({ game }: { game: Game }) {
  const [tab, setTab] = useState<(typeof CREATIVE_TABS)[number]['key']>('blocks');
  const items = useMemo(() => {
    const t = CREATIVE_TABS.find((c) => c.key === tab) ?? CREATIVE_TABS[0];
    return ITEM_DEFS.filter((d) => t.filter(d.kind));
  }, [tab]);
  return (
    <div className="creative-list">
      <div className="tabs">
        {CREATIVE_TABS.map((t) => (
          <button key={t.key} className={`tab${t.key === tab ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="slot-grid cols-9 creative-grid">
        {items.map((d) => (
          <Slot
            key={d.id}
            game={game}
            refer={{ kind: 'creative', index: 0, itemId: d.id }}
            stack={{ id: d.id, count: 1 }}
          />
        ))}
      </div>
      <div className="creative-trash" onPointerDown={() => game.clearCursor()}>
        🗑 点击此处丢弃光标物品
      </div>
    </div>
  );
}

/** 背包 / 工作台 / 熔炉 界面。 */
export function InventoryScreen({ game, state }: InventoryScreenProps) {
  const isCreative = state.mode === GameMode.CREATIVE;
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const cursor = game.cursor;
  return (
    <div
      className="overlay inventory-overlay"
      onPointerMove={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
      onPointerDown={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
    >
      <div className="panel inventory-panel">
        <div className="panel-body">
          {state.screen === Screen.INVENTORY && isCreative && <CreativeList game={game} />}
          {state.screen === Screen.INVENTORY && !isCreative && <CraftingArea game={game} size={2} />}
          {state.screen === Screen.CRAFTING && <CraftingArea game={game} size={3} />}
          {state.screen === Screen.FURNACE && <FurnaceArea game={game} />}
          <div className="section-title">物品栏</div>
          <InventoryGrid game={game} />
        </div>
        <button className="close-button" onClick={() => game.closeScreen()}>
          关闭 (E)
        </button>
      </div>
      {cursor && (
        <div className="cursor-stack" style={{ left: cursorPos.x, top: cursorPos.y }}>
          <ItemIcon stack={cursor} />
        </div>
      )}
    </div>
  );
}
