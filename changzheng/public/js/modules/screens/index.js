/**
 * screens 模块 —— **屏的生命周期归属**：谁渲染这屏，谁负责在离开时清干净。
 *
 * 它修的是架构上最硬的一处越界（见 `docs/BUS.md` §一）：原先 `ui.showScreen()` 会去清
 * **别人**的容器——舞台正文 `#stage-panel`、玩法区 `#board-body`、对白 `#dlg-body`……
 * 于是「换屏」这一个动作统管了所有屏的内部状态；`openBoard()` 为了躲开它，还得用
 * `cloneNode` 换节点、并且必须严格保证"先 showScreen 再挂 host"的顺序。
 *
 * 现在反过来：
 *   1. `showScreen/hideOverlay` 只广播 `screen:hide { id }`，**不动任何容器**；
 *   2. 各屏的宿主用 `own(screenId, onHide)` 登记自己的清理函数（渲染代码与清理代码放在一起）；
 *   3. 本模块收到 `screen:hide` 时，只调用那一屏**自己登记**的清理。
 *
 * 好处不只是"干净"：清理逻辑与渲染逻辑住在一起，谁也不会忘；顺序不再要紧
 * （离开才清，进入时宿主自己决定要不要先清）。
 *
 * 迁移说明：批 3 由 `main.js` 登记 stage / board 两屏；批 5 各屏渲染器搬进 `modules/screens/*` 后，
 * 由它们自己在 `init` 里登记，`main.js` 里的登记会随之删除。
 */
// 屏归属表与当前屏：**模块自己的模块级变量**（不挂描述符上——描述符只放方法与规定字段）
const owners = new Map();
let currentId = '';

export default {
  name: 'screens',
  note: '屏的生命周期归属：宿主登记自己的清理，离开时只清自己的容器',
  subscriptions: {
    'screen:show': 'onScreenShow',
    'screen:hide': 'onScreenHide',
  },

  api: {
    /**
     * 登记某屏的清理函数。**只允许清这一屏自己渲染的容器**——
     * 这是"屏自清"的全部含义，别在这里顺手清别人的。
     * @param {string} screenId 如 'screen-stage'
     * @param {() => void} onHide
     */
    own(screenId, onHide) {
      owners.set(screenId, onHide);
      return () => owners.delete(screenId);
    },
    /** 当前屏 id（由 screen:show 维护） */
    current() { return currentId; },
    /** 已登记的屏（体检用） */
    owners() { return [...owners.keys()]; },
  },

  onScreenShow(p) {
    currentId = p.id;
  },

  onScreenHide(p) {
    const fn = owners.get(p.id);
    if (typeof fn === 'function') {
      try {
        fn();
      } catch (err) {
        console.warn(`[screens] 屏「${p.id}」的清理函数抛错（已忽略）：`, err);
      }
    }
  },
};
