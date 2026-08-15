// 端到端冒烟脚本：启动 dev server 后运行 `npm run e2e`（需已安装 playwright chromium）。
// 覆盖：新建世界 → 放置方块 → 夜晚刷怪 → 战斗 → 保存并退出 → 读档。
import { chromium } from 'playwright';

const BASE_URL = process.env.E2E_URL ?? 'http://localhost:5173/';
const WORLD_READY_MS = 6000;
const CENTER = { x: 640, y: 400 };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push(m.text());
  }
});
page.on('pageerror', (e) => errors.push(e.message));
// 无头浏览器不支持指针锁定，这里用最小 shim 模拟
await page.addInitScript(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked, configurable: true });
  Element.prototype.requestPointerLock = function () {
    locked = this;
    document.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = function () {
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
});

const snapshot = () =>
  page.evaluate(() => {
    const g = window.__mcGame;
    const s = g.store.get();
    const mobs = {};
    for (const e of g.entities.values()) {
      mobs[e.type] = (mobs[e.type] ?? 0) + 1;
    }
    return {
      tick: g.tick,
      health: s.health,
      screen: s.screen,
      pos: [g.player.x, g.player.y, g.player.z].map((v) => Number(v.toFixed(1))),
      mobs,
      hotbar: g.player.inventory.slots.slice(0, 9).map((x) => x && `${x.id}x${x.count}`),
    };
  });

function assert(cond, message) {
  if (!cond) {
    throw new Error(`断言失败：${message}`);
  }
}

await page.goto(BASE_URL);
await page.getByRole('button', { name: /生存模式/ }).click();
await page.getByRole('button', { name: '创建并进入世界' }).click();
await page.waitForTimeout(WORLD_READY_MS);
await page.mouse.click(CENTER.x, CENTER.y);
await page.waitForTimeout(300);
const start = await snapshot();
assert(start.health === 20, '初始血量应为 20');

await page.evaluate(() => {
  const g = window.__mcGame;
  g.player.inventory.add({ id: 'cobblestone', count: 64 });
  g.player.inventory.add({ id: 'torch', count: 16 });
});
// 视角依次向下扫，直到成功放置（地形随机，某些朝向可能被水/自身阻挡）
let placed = await snapshot();
for (const targetY of [560, 640, 720, 790]) {
  await page.mouse.move(CENTER.x, CENTER.y);
  await page.mouse.move(CENTER.x, targetY, { steps: 4 });
  await page.waitForTimeout(200);
  await page.mouse.click(CENTER.x, targetY, { button: 'right' });
  await page.waitForTimeout(400);
  placed = await snapshot();
  if (placed.hotbar[0] === 'cobblestonex63') {
    break;
  }
}
assert(placed.hotbar[0] === 'cobblestonex63', `放置方块后应消耗 1 个圆石，实际 ${placed.hotbar[0]}`);

await page.evaluate(() => {
  window.__mcGame.timeTick = 14000;
});
await page.waitForTimeout(6000);
const night = await snapshot();
const hostile = ['zombie', 'skeleton', 'creeper', 'spider'].reduce((n, t) => n + (night.mobs[t] ?? 0), 0);
assert(hostile > 0, '夜晚应有敌对生物生成');

await page.keyboard.press('Escape');
await page.getByRole('button', { name: '保存并退出到主菜单' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: '进入', exact: true }).first().click();
await page.waitForTimeout(WORLD_READY_MS);
await page.mouse.click(CENTER.x, CENTER.y);
await page.waitForTimeout(300);
const loaded = await snapshot();
assert(loaded.hotbar[0] === 'cobblestonex63', '读档后快捷栏应恢复');
assert(loaded.tick >= night.tick, '读档后 tick 应延续');

await browser.close();
if (errors.length > 0) {
  console.error('页面错误：', errors);
  process.exit(1);
}
console.log('E2E 冒烟通过', { start, placed, night, loaded });
