/**
 * 游戏视图（含 three.js 与整个引擎）按需加载：主菜单首屏只需要 React + 菜单代码。
 * 主菜单挂载后会在后台预取，进入世界时通常已就绪。
 */
export const loadGameView = () => import('./GameView').then((m) => ({ default: m.GameView }));
