import type { CSSProperties } from 'react';
import { getItem } from '../engine/items/ItemRegistry';
import type { ItemStack } from '../engine/items/ItemStack';
import { getItemIcon } from '../engine/textures/IconRegistry';

interface ItemIconProps {
  stack: ItemStack | null;
  size?: number;
  showCount?: boolean;
}

const DEFAULT_ICON_SIZE = 32;

/** 物品图标（含数量与耐久条）。 */
export function ItemIcon({ stack, size = DEFAULT_ICON_SIZE, showCount = true }: ItemIconProps) {
  if (!stack) {
    return null;
  }
  const def = getItem(stack.id);
  const durability = def?.tool?.durability;
  const damage = stack.damage ?? 0;
  const style: CSSProperties = { width: size, height: size };
  const barStyle: CSSProperties | undefined =
    durability && damage > 0
      ? {
          width: `${Math.max(0, 1 - damage / durability) * 100}%`,
          background: damage / durability > 0.7 ? '#e04040' : damage / durability > 0.4 ? '#e0c040' : '#40e040',
        }
      : undefined;
  return (
    <div className="item-icon" style={style} title={def?.label ?? stack.id}>
      <img src={getItemIcon(stack.id)} alt={def?.label ?? stack.id} draggable={false} />
      {showCount && stack.count > 1 && <span className="item-count">{stack.count}</span>}
      {barStyle && (
        <div className="item-durability">
          <div style={barStyle} />
        </div>
      )}
    </div>
  );
}
