/**
 * 指令系统：解析 `/xxx a b c` 并交给对应的处理函数。
 * 指令只依赖这里声明的 CommandHost 接口（而不是整个 Game），方便单测与以后的多人服务端复用。
 */

import type { Difficulty, GameMode } from '../constants/game';
import type { EffectId } from '../entities/effects';
import type { ItemStack } from '../items/ItemStack';
import type { Weather } from './WeatherSystem';

/** 指令执行时能用到的游戏能力。 */
export interface CommandHost {
  /** 往聊天栏输出一行反馈。 */
  reply(message: string): void;
  /** 玩家当前位置（取整）。 */
  playerPosition(): { x: number; y: number; z: number };
  teleport(x: number, y: number, z: number): void;
  setGameMode(mode: GameMode): void;
  setDifficulty(difficulty: Difficulty): void;
  setTime(tick: number): void;
  addTime(tick: number): void;
  /** 当前世界时间（tick）。 */
  currentTime(): number;
  setWeather(weather: Weather, ticks?: number): void;
  giveItem(stack: ItemStack): void;
  clearInventory(): void;
  killMobs(): number;
  addXpLevels(levels: number): void;
  applyEffect(effect: EffectId, seconds: number, amplifier: number): void;
  clearEffects(): void;
  setBlockAt(x: number, y: number, z: number, blockName: string): boolean;
  fillBlocks(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockName: string): number;
  summonMob(type: string, x: number, y: number, z: number): boolean;
  enchantHeldItem(enchantId: string, level: number): boolean;
  setSpawnPoint(x: number, y: number, z: number): void;
  worldSeed(): string;
  setGameRule(rule: string, value: boolean): boolean;
  /** 列出全部游戏规则与当前值（/gamerule 不带参数时用）。 */
  listGameRules(): string[];
}

/** 一条指令的定义。 */
export interface CommandDef {
  name: string;
  /** 用法说明（/help 用）。 */
  usage: string;
  description: string;
  /** 执行；返回给玩家的反馈（返回空串表示自己已经 reply 过）。 */
  run(host: CommandHost, args: string[]): string;
}

/** 一天的 tick 数（/time 用）。 */
const DAY_LENGTH = 24000;
/** /time set 的几个预设时刻。 */
const TIME_PRESETS: Readonly<Record<string, number>> = {
  day: 1000,
  noon: 6000,
  night: 13000,
  midnight: 18000,
  sunrise: 23000,
  sunset: 12000,
};
/** 秒 → tick。 */
const TICKS_PER_SECOND = 20;
/** /fill 一次最多改多少方块（防止手滑卡死）。 */
export const FILL_LIMIT = 32768;

/** 解析整数参数；解析失败返回 null。 */
function parseInt10(text: string | undefined): number | null {
  if (text === undefined) {
    return null;
  }
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * 解析可能带 `~` 的坐标（`~` = 当前值，`~5` = 当前值 + 5）。
 * @returns 解析后的坐标；非法返回 null
 */
export function parseCoordinate(text: string | undefined, current: number): number | null {
  if (text === undefined) {
    return null;
  }
  if (text === '~') {
    return current;
  }
  if (text.startsWith('~')) {
    const offset = Number.parseFloat(text.slice(1));
    return Number.isFinite(offset) ? current + offset : null;
  }
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

/** 解析一组三维坐标。 */
function parsePosition(
  args: string[],
  start: number,
  origin: { x: number; y: number; z: number },
): { x: number; y: number; z: number } | null {
  const x = parseCoordinate(args[start], origin.x);
  const y = parseCoordinate(args[start + 1], origin.y);
  const z = parseCoordinate(args[start + 2], origin.z);
  if (x === null || y === null || z === null) {
    return null;
  }
  return { x, y, z };
}

const GAME_MODES: Readonly<Record<string, GameMode>> = {
  survival: 'survival',
  s: 'survival',
  '0': 'survival',
  creative: 'creative',
  c: 'creative',
  '1': 'creative',
  adventure: 'adventure',
  a: 'adventure',
  '2': 'adventure',
};

const DIFFICULTIES: Readonly<Record<string, Difficulty>> = {
  peaceful: 0,
  p: 0,
  '0': 0,
  easy: 1,
  e: 1,
  '1': 1,
  normal: 2,
  n: 2,
  '2': 2,
  hard: 3,
  h: 3,
  '3': 3,
};

const WEATHERS: Readonly<Record<string, Weather>> = {
  clear: 'clear',
  rain: 'rain',
  thunder: 'thunder',
};

/** 全部指令。 */
export const COMMANDS: readonly CommandDef[] = [
  {
    name: 'help',
    usage: '/help',
    description: '列出所有指令',
    run: (host) => {
      for (const command of COMMANDS) {
        host.reply(`${command.usage} —— ${command.description}`);
      }
      return '';
    },
  },
  {
    name: 'gamemode',
    usage: '/gamemode <survival|creative|adventure>',
    description: '切换游戏模式',
    run: (host, args) => {
      const mode = GAME_MODES[(args[0] ?? '').toLowerCase()];
      if (!mode) {
        return '用法：/gamemode <survival|creative|adventure>';
      }
      host.setGameMode(mode);
      return `游戏模式已切换为 ${mode}`;
    },
  },
  {
    name: 'tp',
    usage: '/tp <x> <y> <z>',
    description: '传送到指定坐标（支持 ~ 相对坐标）',
    run: (host, args) => {
      const target = parsePosition(args, 0, host.playerPosition());
      if (!target) {
        return '用法：/tp <x> <y> <z>';
      }
      host.teleport(target.x, target.y, target.z);
      return `已传送到 ${Math.round(target.x)} ${Math.round(target.y)} ${Math.round(target.z)}`;
    },
  },
  {
    name: 'time',
    usage: '/time <set|add> <值|day|night|noon|midnight>',
    description: '设置或推进时间',
    run: (host, args) => {
      const action = args[0];
      const raw = args[1] ?? '';
      const preset = TIME_PRESETS[raw.toLowerCase()];
      const amount = preset ?? parseInt10(raw);
      if ((action !== 'set' && action !== 'add') || amount === null) {
        return '用法：/time <set|add> <值|day|night|noon|midnight>';
      }
      if (action === 'set') {
        host.setTime(amount);
        return `时间已设为 ${amount}`;
      }
      host.addTime(amount);
      return `时间推进了 ${amount}`;
    },
  },
  {
    name: 'weather',
    usage: '/weather <clear|rain|thunder> [秒]',
    description: '设置天气',
    run: (host, args) => {
      const weather = WEATHERS[(args[0] ?? '').toLowerCase()];
      if (!weather) {
        return '用法：/weather <clear|rain|thunder> [秒]';
      }
      const seconds = parseInt10(args[1]);
      host.setWeather(weather, seconds === null ? undefined : seconds * TICKS_PER_SECOND);
      return `天气已设为 ${weather}`;
    },
  },
  {
    name: 'difficulty',
    usage: '/difficulty <peaceful|easy|normal|hard>',
    description: '设置难度',
    run: (host, args) => {
      const key = (args[0] ?? '').toLowerCase();
      const difficulty = DIFFICULTIES[key];
      if (difficulty === undefined) {
        return '用法：/difficulty <peaceful|easy|normal|hard>';
      }
      host.setDifficulty(difficulty);
      return `难度已设为 ${key}`;
    },
  },
  {
    name: 'give',
    usage: '/give <物品 id> [数量]',
    description: '给自己物品',
    run: (host, args) => {
      const id = args[0];
      if (!id) {
        return '用法：/give <物品 id> [数量]';
      }
      const count = parseInt10(args[1]) ?? 1;
      host.giveItem({ id, count: Math.max(1, count) });
      return `已给予 ${id} x${Math.max(1, count)}`;
    },
  },
  {
    name: 'clear',
    usage: '/clear',
    description: '清空背包',
    run: (host) => {
      host.clearInventory();
      return '背包已清空';
    },
  },
  {
    name: 'kill',
    usage: '/kill',
    description: '杀死附近所有生物',
    run: (host) => {
      const count = host.killMobs();
      return `已消灭 ${count} 只生物`;
    },
  },
  {
    name: 'xp',
    usage: '/xp <等级>',
    description: '增加经验等级',
    run: (host, args) => {
      const levels = parseInt10(args[0]);
      if (levels === null) {
        return '用法：/xp <等级>';
      }
      host.addXpLevels(levels);
      return `经验等级 +${levels}`;
    },
  },
  {
    name: 'effect',
    usage: '/effect <效果 id|clear> [秒] [等级]',
    description: '给自己加状态效果',
    run: (host, args) => {
      const id = args[0];
      if (!id) {
        return '用法：/effect <效果 id|clear> [秒] [等级]';
      }
      if (id === 'clear') {
        host.clearEffects();
        return '已清除所有效果';
      }
      const seconds = parseInt10(args[1]) ?? 30;
      const amplifier = Math.max(0, (parseInt10(args[2]) ?? 1) - 1);
      host.applyEffect(id as EffectId, seconds, amplifier);
      return '';
    },
  },
  {
    name: 'enchant',
    usage: '/enchant <附魔 id> [等级]',
    description: '给手上的物品附魔',
    run: (host, args) => {
      const id = args[0];
      if (!id) {
        return '用法：/enchant <附魔 id> [等级]';
      }
      const level = Math.max(1, parseInt10(args[1]) ?? 1);
      return host.enchantHeldItem(id, level) ? `已附魔 ${id} ${level}` : '这件物品不能附这个魔';
    },
  },
  {
    name: 'setblock',
    usage: '/setblock <x> <y> <z> <方块名>',
    description: '放置一个方块',
    run: (host, args) => {
      const pos = parsePosition(args, 0, host.playerPosition());
      const name = args[3];
      if (!pos || !name) {
        return '用法：/setblock <x> <y> <z> <方块名>';
      }
      return host.setBlockAt(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z), name)
        ? `已放置 ${name}`
        : `未知方块：${name}`;
    },
  },
  {
    name: 'fill',
    usage: '/fill <x1> <y1> <z1> <x2> <y2> <z2> <方块名>',
    description: '用方块填满一个区域',
    run: (host, args) => {
      const origin = host.playerPosition();
      const a = parsePosition(args, 0, origin);
      const b = parsePosition(args, 3, origin);
      const name = args[6];
      if (!a || !b || !name) {
        return '用法：/fill <x1> <y1> <z1> <x2> <y2> <z2> <方块名>';
      }
      const count = host.fillBlocks(
        Math.floor(a.x),
        Math.floor(a.y),
        Math.floor(a.z),
        Math.floor(b.x),
        Math.floor(b.y),
        Math.floor(b.z),
        name,
      );
      if (count < 0) {
        return `未知方块：${name}`;
      }
      return `已填充 ${count} 个方块`;
    },
  },
  {
    name: 'summon',
    usage: '/summon <生物 id> [x] [y] [z]',
    description: '生成一只生物',
    run: (host, args) => {
      const type = args[0];
      if (!type) {
        return '用法：/summon <生物 id> [x] [y] [z]';
      }
      const origin = host.playerPosition();
      const pos = args.length >= 4 ? parsePosition(args, 1, origin) : origin;
      if (!pos) {
        return '用法：/summon <生物 id> [x] [y] [z]';
      }
      return host.summonMob(type, pos.x, pos.y, pos.z) ? `已生成 ${type}` : `未知生物：${type}`;
    },
  },
  {
    name: 'spawnpoint',
    usage: '/spawnpoint',
    description: '把重生点设在当前位置',
    run: (host) => {
      const pos = host.playerPosition();
      host.setSpawnPoint(pos.x, pos.y, pos.z);
      return `重生点已设为 ${pos.x} ${pos.y} ${pos.z}`;
    },
  },
  {
    name: 'seed',
    usage: '/seed',
    description: '显示世界种子',
    run: (host) => `世界种子：${host.worldSeed()}`,
  },
  {
    name: 'gamerule',
    usage: '/gamerule [规则] [true|false]',
    description: '查看或修改游戏规则',
    run: (host, args) => {
      if (args.length === 0) {
        for (const line of host.listGameRules()) {
          host.reply(line);
        }
        return '';
      }
      const rule = args[0];
      const value = args[1];
      if (value !== 'true' && value !== 'false') {
        return '用法：/gamerule <规则> <true|false>';
      }
      return host.setGameRule(rule, value === 'true') ? `${rule} 已设为 ${value}` : `未知规则：${rule}`;
    },
  },
  {
    name: 'say',
    usage: '/say <内容>',
    description: '广播一条消息',
    run: (_host, args) => {
      if (args.length === 0) {
        return '用法：/say <内容>';
      }
      return `[广播] ${args.join(' ')}`;
    },
  },
];

const COMMANDS_BY_NAME: ReadonlyMap<string, CommandDef> = new Map(COMMANDS.map((c) => [c.name, c]));

/** 一天的 tick 数（供 /time 与调用方共用）。 */
export const COMMAND_DAY_LENGTH = DAY_LENGTH;

/**
 * 执行一条指令文本（可带或不带开头的 `/`）。
 * @returns 给玩家的反馈；未知指令返回提示
 */
export function runCommand(host: CommandHost, text: string): string {
  const trimmed = text.startsWith('/') ? text.slice(1) : text;
  const parts = trimmed.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  const command = COMMANDS_BY_NAME.get(parts[0].toLowerCase());
  if (!command) {
    return `未知指令：/${parts[0]}（输入 /help 查看全部指令）`;
  }
  return command.run(host, parts.slice(1));
}

/** 按前缀补全指令名（聊天栏按 Tab 用）。 */
export function completeCommand(prefix: string): string[] {
  const name = prefix.startsWith('/') ? prefix.slice(1) : prefix;
  return COMMANDS.filter((c) => c.name.startsWith(name.toLowerCase())).map((c) => `/${c.name}`);
}
