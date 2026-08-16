import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { REDSTONE_MAX_POWER, REDSTONE_POWERED_BIT } from '../src/engine/constants/redstone';
import { powerAt, repeaterInputPower, sourcePower, updateWires, wirePower } from '../src/engine/systems/RedstoneSystem';
import { Chunk } from '../src/engine/world/Chunk';
import { World } from '../src/engine/world/World';

function testWorld(): World {
  const world = new World(true);
  for (let cx = -1; cx <= 2; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      world.addChunk(new Chunk(cx, cz, true));
    }
  }
  // 铺一层石头当地面
  for (let x = -16; x < 48; x++) {
    for (let z = -16; z < 16; z++) {
      world.setBlock(x, 9, z, BlockId.STONE);
    }
  }
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
