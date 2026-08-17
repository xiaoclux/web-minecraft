import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { FACINGS } from '../src/engine/blocks/blockShapes';
import { TriggerSystem } from '../src/engine/systems/TriggerSystem';
import {
  COMPARATOR_MODE_BIT,
  COMPARATOR_OUTPUT_SHIFT,
  NOTE_CENTER,
  NOTE_COUNT,
  REDSTONE_MAX_POWER,
  REDSTONE_POWERED_BIT,
  TRIGGER_CHECK_INTERVAL_TICKS,
} from '../src/engine/constants/redstone';
import {
  comparatorOutput,
  isPoweredRailOn,
  notePitch,
  powerAt,
  repeaterInputPower,
  sourcePower,
  sourcePowerTo,
  updateWires,
  wirePower,
} from '../src/engine/systems/RedstoneSystem';
import {
  PISTON_DOWN,
  PISTON_UP,
  collectPushed,
  extendPiston,
  isPushable,
  pistonDirection,
  retractPiston,
} from '../src/engine/systems/PistonSystem';
import { PISTON_MAX_PUSH, POWERED_RAIL_CHAIN, RailShape } from '../src/engine/constants/redstone';
import { railAxis } from '../src/engine/entities/MinecartEntity';
import { Chunk } from '../src/engine/world/Chunk';
import { World } from '../src/engine/world/World';
import { fillLayer } from './helpers';

function testWorld(): World {
  const world = new World(true);
  for (let cx = -1; cx <= 2; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      world.addChunk(new Chunk(cx, cz, true));
    }
  }
  fillLayer(world, 9, 47, BlockId.STONE);
  return world;
}

/** 从 (x0,10,0) 起沿 +X 铺 length 格红石粉。 */
function layWire(world: World, x0: number, length: number): void {
  for (let i = 0; i < length; i++) {
    world.setBlock(x0 + i, 10, 0, BlockId.REDSTONE_WIRE, 0);
  }
}

describe('红石信号', () => {
  it('红石块是恒定电源，拉杆按开关位供电', () => {
    const world = testWorld();
    world.setBlock(0, 10, 0, BlockId.REDSTONE_BLOCK);
    expect(sourcePower(world, 0, 10, 0)).toBe(REDSTONE_MAX_POWER);
    world.setBlock(2, 10, 0, BlockId.LEVER, 0);
    expect(sourcePower(world, 2, 10, 0)).toBe(0);
    world.setBlock(2, 10, 0, BlockId.LEVER, REDSTONE_POWERED_BIT);
    expect(sourcePower(world, 2, 10, 0)).toBe(REDSTONE_MAX_POWER);
  });

  it('红石粉从电源出发每格衰减 1，超出 15 格断电', () => {
    const world = testWorld();
    layWire(world, 1, 20);
    world.setBlock(0, 10, 0, BlockId.REDSTONE_BLOCK);
    updateWires(world, 0, 10, 0);
    expect(wirePower(world, 1, 10, 0)).toBe(REDSTONE_MAX_POWER);
    expect(wirePower(world, 2, 10, 0)).toBe(REDSTONE_MAX_POWER - 1);
    expect(wirePower(world, 15, 10, 0)).toBe(1);
    // 第 16 格开始就没电了
    expect(wirePower(world, 16, 10, 0)).toBe(0);
    expect(wirePower(world, 19, 10, 0)).toBe(0);
  });

  it('断开电源后整条线路归零', () => {
    const world = testWorld();
    layWire(world, 1, 6);
    world.setBlock(0, 10, 0, BlockId.REDSTONE_BLOCK);
    updateWires(world, 0, 10, 0);
    expect(wirePower(world, 3, 10, 0)).toBeGreaterThan(0);
    world.setBlock(0, 10, 0, BlockId.AIR);
    updateWires(world, 0, 10, 0);
    for (let i = 1; i <= 6; i++) {
      expect(wirePower(world, i, 10, 0)).toBe(0);
    }
  });

  it('用电器读到的信号：紧挨电源或被有电的粉喂到', () => {
    const world = testWorld();
    world.setBlock(0, 10, 0, BlockId.REDSTONE_BLOCK);
    // 紧挨红石块
    expect(powerAt(world, 1, 10, 0)).toBe(REDSTONE_MAX_POWER);
    // 离得远、且没有粉连过去
    expect(powerAt(world, 5, 10, 0)).toBe(0);
    layWire(world, 1, 4);
    updateWires(world, 0, 10, 0);
    expect(powerAt(world, 5, 10, 0)).toBeGreaterThan(0);
  });

  it('红石粉可以爬上下一格的台阶', () => {
    const world = testWorld();
    world.setBlock(0, 10, 0, BlockId.REDSTONE_BLOCK);
    world.setBlock(1, 10, 0, BlockId.REDSTONE_WIRE, 0);
    // 台阶：抬高一格
    world.setBlock(2, 10, 0, BlockId.STONE);
    world.setBlock(2, 11, 0, BlockId.REDSTONE_WIRE, 0);
    world.setBlock(3, 11, 0, BlockId.STONE);
    updateWires(world, 0, 10, 0);
    expect(wirePower(world, 1, 10, 0)).toBe(REDSTONE_MAX_POWER);
    expect(wirePower(world, 2, 11, 0)).toBe(REDSTONE_MAX_POWER - 1);
  });
});

describe('红石火把与中继器', () => {
  it('火把不给自己脚下的方块供电（否则会自锁）', () => {
    const world = testWorld();
    world.setBlock(2, 10, 0, BlockId.STONE);
    world.setBlock(2, 11, 0, BlockId.REDSTONE_TORCH);
    // 脚下方块（排除火把自己）不该有电
    expect(powerAt(world, 2, 10, 0, [2, 11, 0])).toBe(0);
    // 但火把仍然给旁边的格子供电
    expect(powerAt(world, 3, 11, 0)).toBe(REDSTONE_MAX_POWER);
  });

  it('熄灭的火把不供电', () => {
    const world = testWorld();
    world.setBlock(2, 11, 0, BlockId.REDSTONE_TORCH_OFF);
    expect(sourcePower(world, 2, 11, 0)).toBe(0);
  });

  it('中继器只吃背面的信号、只朝正面输出', () => {
    const world = testWorld();
    // 中继器朝 +X（FACINGS[0]）
    world.setBlock(2, 10, 0, BlockId.REPEATER_ON, 0);
    // 正面那格有电
    expect(powerAt(world, 3, 10, 0)).toBe(REDSTONE_MAX_POWER);
    // 背面与两侧没电
    expect(powerAt(world, 1, 10, 0)).toBe(0);
    expect(powerAt(world, 2, 10, 1)).toBe(0);
  });

  it('中继器的背面输入只认正对的那一格', () => {
    const world = testWorld();
    world.setBlock(2, 10, 0, BlockId.REPEATER, 0);
    expect(repeaterInputPower(world, 2, 10, 0)).toBe(0);
    // 背面（-X 侧）放红石块
    world.setBlock(1, 10, 0, BlockId.REDSTONE_BLOCK);
    expect(repeaterInputPower(world, 2, 10, 0)).toBe(REDSTONE_MAX_POWER);
    // 侧面放红石块不算
    world.setBlock(1, 10, 0, BlockId.AIR);
    world.setBlock(2, 10, 1, BlockId.REDSTONE_BLOCK);
    expect(repeaterInputPower(world, 2, 10, 0)).toBe(0);
  });
});

describe('活塞', () => {
  it('推动一串方块，最远的先搬，活塞前留下活塞臂', () => {
    const world = testWorld();
    for (let i = 1; i <= 3; i++) {
      world.setBlock(i, 10, 0, BlockId.STONE);
    }
    // 活塞在 0，朝 +X
    world.setBlock(0, 10, 0, BlockId.PISTON, 0);
    expect(extendPiston(world, 0, 10, 0, 0)).toBe(true);
    expect(world.getBlock(1, 10, 0)).toBe(BlockId.PISTON_HEAD);
    for (let i = 2; i <= 4; i++) {
      expect(world.getBlock(i, 10, 0)).toBe(BlockId.STONE);
    }
    expect(world.getBlock(5, 10, 0)).toBe(BlockId.AIR);
  });

  it('推不动基岩与黑曜石', () => {
    const world = testWorld();
    world.setBlock(1, 10, 0, BlockId.OBSIDIAN);
    expect(isPushable(world, 1, 10, 0)).toBe(false);
    expect(extendPiston(world, 0, 10, 0, 0)).toBe(false);
    world.setBlock(1, 10, 0, BlockId.BEDROCK);
    expect(extendPiston(world, 0, 10, 0, 0)).toBe(false);
  });

  it('超过 12 个就推不动', () => {
    const world = testWorld();
    for (let i = 1; i <= PISTON_MAX_PUSH; i++) {
      world.setBlock(i, 10, 0, BlockId.STONE);
    }
    expect(collectPushed(world, 0, 10, 0, [1, 0, 0])?.length).toBe(PISTON_MAX_PUSH);
    world.setBlock(PISTON_MAX_PUSH + 1, 10, 0, BlockId.STONE);
    expect(collectPushed(world, 0, 10, 0, [1, 0, 0])).toBeNull();
  });

  it('粘性活塞缩回时把前面那格拉回来，普通活塞不拉', () => {
    const world = testWorld();
    world.setBlock(1, 10, 0, BlockId.STONE);
    world.setBlock(0, 10, 0, BlockId.STICKY_PISTON, 0);
    extendPiston(world, 0, 10, 0, 0);
    expect(world.getBlock(2, 10, 0)).toBe(BlockId.STONE);
    retractPiston(world, 0, 10, 0, 0, true);
    expect(world.getBlock(1, 10, 0)).toBe(BlockId.STONE);
    expect(world.getBlock(2, 10, 0)).toBe(BlockId.AIR);

    // 普通活塞：缩回后方块留在原地
    const world2 = testWorld();
    world2.setBlock(1, 10, 0, BlockId.STONE);
    world2.setBlock(0, 10, 0, BlockId.PISTON, 0);
    extendPiston(world2, 0, 10, 0, 0);
    retractPiston(world2, 0, 10, 0, 0, false);
    expect(world2.getBlock(1, 10, 0)).toBe(BlockId.AIR);
    expect(world2.getBlock(2, 10, 0)).toBe(BlockId.STONE);
  });

  it('朝上 / 朝下的活塞方向正确', () => {
    expect(pistonDirection(PISTON_UP)).toEqual([0, 1, 0]);
    expect(pistonDirection(PISTON_DOWN)).toEqual([0, -1, 0]);
    expect(pistonDirection(0)).toEqual([1, 0, 0]);
  });
});

describe('铁轨与矿车', () => {
  it('动力铁轨沿轨最多连锁 8 格传电', () => {
    const world = testWorld();
    // 一条东西向的动力轨
    for (let i = 0; i <= 12; i++) {
      world.setBlock(i, 10, 0, BlockId.POWERED_RAIL, RailShape.EAST_WEST);
    }
    // 只在最左边接一个电源
    world.setBlock(0, 11, 0, BlockId.REDSTONE_BLOCK);
    expect(isPoweredRailOn(world, 0, 10, 0)).toBe(true);
    expect(isPoweredRailOn(world, POWERED_RAIL_CHAIN, 10, 0)).toBe(true);
    // 超出连锁范围
    expect(isPoweredRailOn(world, POWERED_RAIL_CHAIN + 1, 10, 0)).toBe(false);
  });

  it('中间断开的动力轨不再往后传', () => {
    const world = testWorld();
    for (let i = 0; i <= 6; i++) {
      world.setBlock(i, 10, 0, BlockId.POWERED_RAIL, RailShape.EAST_WEST);
    }
    world.setBlock(3, 10, 0, BlockId.RAIL, RailShape.EAST_WEST);
    world.setBlock(0, 11, 0, BlockId.REDSTONE_BLOCK);
    expect(isPoweredRailOn(world, 2, 10, 0)).toBe(true);
    expect(isPoweredRailOn(world, 4, 10, 0)).toBe(false);
  });

  it('轨道走向决定矿车的行进轴', () => {
    expect(railAxis(RailShape.EAST_WEST)).toEqual([1, 0]);
    expect(railAxis(RailShape.NORTH_SOUTH)).toEqual([0, 1]);
  });
});

describe('音符盒', () => {
  it('中间音是原音高，高一个八度正好翻倍', () => {
    expect(notePitch(NOTE_CENTER)).toBeCloseTo(1);
    expect(notePitch(NOTE_CENTER + 12)).toBeCloseTo(2);
    expect(notePitch(NOTE_CENTER - 12)).toBeCloseTo(0.5);
  });

  it('两个八度共 25 个音，音高单调递增', () => {
    expect(NOTE_COUNT).toBe(25);
    for (let note = 1; note < NOTE_COUNT; note++) {
      expect(notePitch(note)).toBeGreaterThan(notePitch(note - 1));
    }
  });
});

describe('比较器', () => {
  /** 放一个朝 +x 的比较器（正面在 +x 侧），返回它的坐标。 */
  function placeComparator(world: World, x: number, y: number, z: number, subtract = false): void {
    const facing = FACINGS.findIndex(([fx, fz]) => fx === 1 && fz === 0);
    world.setBlock(x, y, z, BlockId.COMPARATOR, facing | (subtract ? COMPARATOR_MODE_BIT : 0));
  }

  const noContainer = (): number => 0;

  it('比较模式：背后信号强于两侧时原样输出，否则输出 0', () => {
    const world = testWorld();
    placeComparator(world, 0, 10, 0);
    // 背后（-x 侧）放一个满强度的红石块
    world.setBlock(-1, 10, 0, BlockId.REDSTONE_BLOCK);
    expect(comparatorOutput(world, 0, 10, 0, noContainer)).toBe(REDSTONE_MAX_POWER);
    // 侧面也来一个满强度：侧面不强于背后，仍然原样输出
    world.setBlock(0, 10, 1, BlockId.REDSTONE_BLOCK);
    expect(comparatorOutput(world, 0, 10, 0, noContainer)).toBe(REDSTONE_MAX_POWER);
    // 背后换成弱信号（一根强度 4 的粉）：侧面更强，输出归零
    world.setBlock(-1, 10, 0, BlockId.REDSTONE_WIRE, 4);
    expect(comparatorOutput(world, 0, 10, 0, noContainer)).toBe(0);
  });

  it('减法模式：输出 = 背后 − 两侧较大者', () => {
    const world = testWorld();
    placeComparator(world, 0, 10, 0, true);
    world.setBlock(-1, 10, 0, BlockId.REDSTONE_WIRE, 12);
    world.setBlock(0, 10, 1, BlockId.REDSTONE_WIRE, 5);
    expect(comparatorOutput(world, 0, 10, 0, noContainer)).toBe(7);
    // 侧面比背后还强时输出 0，不会变成负数
    world.setBlock(0, 10, 1, BlockId.REDSTONE_WIRE, 15);
    expect(comparatorOutput(world, 0, 10, 0, noContainer)).toBe(0);
  });

  it('背后是容器时读充盈度', () => {
    const world = testWorld();
    placeComparator(world, 0, 10, 0);
    const level = comparatorOutput(world, 0, 10, 0, (x, _y, z) => (x === -1 && z === 0 ? 9 : 0));
    expect(level).toBe(9);
  });

  it('输出强度存在 meta 高 4 位，且只朝正面输出', () => {
    const world = testWorld();
    const facing = FACINGS.findIndex(([fx, fz]) => fx === 1 && fz === 0);
    world.setBlock(0, 10, 0, BlockId.COMPARATOR, facing | (11 << COMPARATOR_OUTPUT_SHIFT));
    expect(sourcePower(world, 0, 10, 0)).toBe(11);
    expect(sourcePowerTo(world, 0, 10, 0, 1, 10, 0)).toBe(11);
    expect(sourcePowerTo(world, 0, 10, 0, -1, 10, 0)).toBe(0);
    expect(sourcePowerTo(world, 0, 10, 0, 0, 10, 1)).toBe(0);
  });
});

describe('绊线与陷阱箱', () => {
  it('绊线钩沿朝向读整条线，线被踩到时钩通电', () => {
    const world = testWorld();
    const facingEast = FACINGS.findIndex(([fx, fz]) => fx === 1 && fz === 0);
    world.setBlock(0, 10, 0, BlockId.TRIPWIRE_HOOK, facingEast);
    for (let i = 1; i <= 3; i++) {
      world.setBlock(i, 10, 0, BlockId.TRIPWIRE);
    }
    // 站在第 2 根线上
    const occupied = { x: 2, z: 0 };
    const system = new TriggerSystem({
      world,
      someEntityAt: (visit) => visit(occupied.x + 0.5, 10, occupied.z + 0.5),
    });
    for (let i = 0; i < TRIGGER_CHECK_INTERVAL_TICKS * 2; i++) {
      system.tick();
    }
    expect(world.getMeta(2, 10, 0) & REDSTONE_POWERED_BIT).not.toBe(0);
    expect(world.getMeta(0, 10, 0) & REDSTONE_POWERED_BIT).not.toBe(0);
    expect(sourcePower(world, 0, 10, 0)).toBe(REDSTONE_MAX_POWER);

    // 走到线外：整条线与钩都断电
    occupied.x = 8;
    for (let i = 0; i < TRIGGER_CHECK_INTERVAL_TICKS * 2; i++) {
      system.tick();
    }
    expect(world.getMeta(2, 10, 0) & REDSTONE_POWERED_BIT).toBe(0);
    expect(world.getMeta(0, 10, 0) & REDSTONE_POWERED_BIT).toBe(0);
  });

  it('压力板也走同一套触发检测（读档放下的板子同样有效）', () => {
    const world = testWorld();
    world.setBlock(5, 10, 5, BlockId.STONE_PRESSURE_PLATE);
    const system = new TriggerSystem({ world, someEntityAt: (visit) => visit(5.5, 10, 5.5) });
    for (let i = 0; i < TRIGGER_CHECK_INTERVAL_TICKS; i++) {
      system.tick();
    }
    expect(world.getMeta(5, 10, 5) & REDSTONE_POWERED_BIT).not.toBe(0);
  });

  it('陷阱箱按通电位输出信号', () => {
    const world = testWorld();
    world.setBlock(0, 10, 0, BlockId.TRAPPED_CHEST, 0);
    expect(sourcePower(world, 0, 10, 0)).toBe(0);
    world.setBlock(0, 10, 0, BlockId.TRAPPED_CHEST, REDSTONE_POWERED_BIT);
    expect(sourcePower(world, 0, 10, 0)).toBe(REDSTONE_MAX_POWER);
  });
});
