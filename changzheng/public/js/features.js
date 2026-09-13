// 功能开关（唯一处）。
//
// devTools = 评委演示 / 答辩面板 / AI 实况 / 记录 / 顶栏模型标签 / 标题页模型署名。
// 这些是"证明这是 AI 作品"的展示面，不是玩法本身。当前按"纯粹的游戏"定位**默认关闭**，
// 但代码完整保留：在「设置 → 展示」里勾选即可打开（存在本机 localStorage，下次自动记住）。
export const FEATURES = {
  devTools: false,
};

const KEY = 'czjc_devtools';

/** 当前是否展示调试/答辩相关界面：本机设置优先，其次代码默认值 */
export function isDevToolsOn() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch { /* 隐私模式等 */ }
  return !!FEATURES.devTools;
}

/** 应用开关：给 body 打标记，CSS 负责显隐 */
export function applyFeatures() {
  document.body.classList.toggle('dev-tools', isDevToolsOn());
}

/** 由设置面板调用：写入本机并立即生效 */
export function setDevTools(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  applyFeatures();
  return isDevToolsOn();
}
