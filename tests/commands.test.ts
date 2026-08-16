import { describe, expect, it, vi } from 'vitest';
import { COMMANDS, completeCommand, parseCoordinate, runCommand, type CommandHost } from '../src/engine/systems/Commands';

function makeHost(overrides: Partial<CommandHost> = {}): CommandHost & { replies: string[] } {
  const replies: string[] = [];
  return {
    replies,
    reply: (m: string) => replies.push(m),
    playerPosition: () => ({ x: 10, y: 64, z: -20 }),
    teleport: vi.fn(),
    setGameMode: vi.fn(),
    setDifficulty: vi.fn(),
    setTime: vi.fn(),
    addTime: vi.fn(),
    currentTime: () => 0,
    setWeather: vi.fn(),
    giveItem: vi.fn(),
    clearInventory: vi.fn(),
    killMobs: () => 3,
    addXpLevels: vi.fn(),
    applyEffect: vi.fn(),
    clearEffects: vi.fn(),
    setBlockAt: () => true,
    fillBlocks: () => 27,
    summonMob: () => true,
    enchantHeldItem: () => true,
    setSpawnPoint: vi.fn(),
    worldSeed: () => 'seed-42',
    setGameRule: () => true,
    listGameRules: () => ['keepInventory = false'],
    ...overrides,
  } as CommandHost & { replies: string[] };
}

describe('指令解析', () => {
  it('未知指令给出提示，空输入什么也不做', () => {
    const host = makeHost();
    expect(runCommand(host, '/nope')).toContain('未知指令');
    expect(runCommand(host, '   ')).toBe('');
  });

  it('带不带斜杠都能执行', () => {
    const host = makeHost();
    expect(runCommand(host, '/seed')).toBe('世界种子：seed-42');
    expect(runCommand(host, 'seed')).toBe('世界种子：seed-42');
  });

  it('~ 相对坐标按当前位置解析', () => {
    expect(parseCoordinate('~', 10)).toBe(10);
    expect(parseCoordinate('~5', 10)).toBe(15);
    expect(parseCoordinate('~-3', 10)).toBe(7);
    expect(parseCoordinate('20', 10)).toBe(20);
    expect(parseCoordinate('abc', 10)).toBeNull();
    expect(parseCoordinate(undefined, 10)).toBeNull();
  });

  it('/tp 支持相对坐标', () => {
    const teleport = vi.fn();
    const host = makeHost({ teleport });
    runCommand(host, '/tp ~ ~10 ~');
    expect(teleport).toHaveBeenCalledWith(10, 74, -20);
  });

  it('/gamemode 接受全名、缩写与数字', () => {
    const setGameMode = vi.fn();
    const host = makeHost({ setGameMode });
    runCommand(host, '/gamemode creative');
    runCommand(host, '/gamemode s');
    runCommand(host, '/gamemode 2');
    expect(setGameMode).toHaveBeenNthCalledWith(1, 'creative');
    expect(setGameMode).toHaveBeenNthCalledWith(2, 'survival');
    expect(setGameMode).toHaveBeenNthCalledWith(3, 'adventure');
    expect(runCommand(host, '/gamemode nope')).toContain('用法');
  });

  it('/time 支持预设时刻与 set/add', () => {
    const setTime = vi.fn();
    const addTime = vi.fn();
    const host = makeHost({ setTime, addTime });
    runCommand(host, '/time set night');
    expect(setTime).toHaveBeenCalledWith(13000);
    runCommand(host, '/time add 500');
    expect(addTime).toHaveBeenCalledWith(500);
    expect(runCommand(host, '/time set nope')).toContain('用法');
  });

  it('/weather 把秒换算成 tick', () => {
    const setWeather = vi.fn();
    const host = makeHost({ setWeather });
    runCommand(host, '/weather rain 30');
    expect(setWeather).toHaveBeenCalledWith('rain', 600);
    runCommand(host, '/weather clear');
    expect(setWeather).toHaveBeenLastCalledWith('clear', undefined);
  });

  it('/give 默认给一个、数量至少为 1', () => {
    const giveItem = vi.fn();
    const host = makeHost({ giveItem });
    runCommand(host, '/give diamond');
    expect(giveItem).toHaveBeenCalledWith({ id: 'diamond', count: 1 });
    runCommand(host, '/give diamond 64');
    expect(giveItem).toHaveBeenLastCalledWith({ id: 'diamond', count: 64 });
    runCommand(host, '/give diamond -5');
    expect(giveItem).toHaveBeenLastCalledWith({ id: 'diamond', count: 1 });
  });

  it('/setblock 与 /fill 认未知方块名', () => {
    const host = makeHost({ setBlockAt: () => false, fillBlocks: () => -1 });
    expect(runCommand(host, '/setblock ~ ~ ~ nope')).toContain('未知方块');
    expect(runCommand(host, '/fill ~ ~ ~ ~1 ~1 ~1 nope')).toContain('未知方块');
  });

  it('/help 会把每条指令都输出一遍', () => {
    const host = makeHost();
    runCommand(host, '/help');
    expect(host.replies.length).toBe(COMMANDS.length);
  });

  it('指令名可以按前缀补全', () => {
    expect(completeCommand('/ga')).toEqual(['/gamemode', '/gamerule']);
    expect(completeCommand('se')).toEqual(['/setblock', '/seed']);
    expect(completeCommand('/zzz')).toEqual([]);
  });
});
