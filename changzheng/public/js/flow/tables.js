/**
 * flow/tables —— 流程层的**数据表**（不是逻辑）：抉择集与"可重复热点"。
 *
 * 从 main.js 搬出来（批 7 二·4）。单独立一个文件的理由：这两张表被流程、体检脚本、
 * 影音审计（av-audit 从整个流程层静态解析各 CHOICE_SET 的舞台图）同时读——
 * "内容在哪"只有一个答案，脚本也不必再依赖 main.js 这个文件名叫什么。
 */
import { PATH_ZONES } from '../data.js';

export const CHOICE_SETS = {
  cross: {
    title: '怎么过河',
    callType: 'branch_judge',
    img: '/assets/scenes/depart_bridge.jpg',
    options: [
      { label: '跟着队伍快走', sub: '跟上，别掉队' },
      { label: '扶一把崴脚的战友', sub: '慢一点，拉他一把' },
      { label: '帮老乡拆最后一块门板', sub: '桥要稳，民心也要稳' },
    ],
    factId: 'h_depart',
  },
  escort: {
    title: '护送伤员过封锁',
    callType: 'branch_judge',
    img: '/assets/scenes/xiangjiang_bridge.jpg',
    loss: { who: '担架上的伤员', reason: '为了抢时间冲过封锁，担架没能全部抬过去' },
    options: [
      { label: '立刻冲过去', sub: '快，但风险大', risk: 'high' },
      { label: '等烟散了再走', sub: '稳，但更耗体力', risk: 'mid' },
      { label: '绕浅滩', sub: '远一点，脚会湿', risk: 'low' },
    ],
    factId: 'h_xiangjiang',
  },
  direction: {
    title: '往哪里走',
    callType: 'branch_judge',
    img: '/assets/scenes/map_desk.jpg',
    options: [
      { label: '要开个会，把方向定下来', sub: '信念向' },
      { label: '听上面的就行', sub: '稳妥' },
      { label: '我只想知道明天往哪走', sub: '小战士视角' },
    ],
    factId: 'h_zunyi',
  },
  ferry: {
    title: '今夜能不能渡',
    callType: 'branch_judge',
    img: '/assets/scenes/jinsha_ferry.jpg',
    // 抢渡是有代价的抉择：体力/粮食见底时硬渡，会有人留在江里
    loss: { who: '木筏上的战士', reason: '抢在雾散前强渡，木筏撞上暗礁，有人没能上岸' },
    options: [
      { label: '跟船工的桨声走', sub: '信老乡', risk: 'mid' },
      { label: '天亮再渡', sub: '更安全，更慢', risk: 'low' },
      { label: '分批快渡，伤员先上', sub: '分工', risk: 'mid' },
    ],
    factId: 'h_jinsha',
  },
  let_clothes: {
    title: '让出棉衣',
    callType: 'share_judge',
    options: [
      { label: '把外衣让给发抖的战士', sub: '你冷，他更冷' },
      { label: '两人挤一件走', sub: '一起扛' },
      { label: '先赶到山顶再说', sub: '保存自己' },
    ],
    factId: 'h_xueshan',
  },
  lazikou: {
    title: '腊子口怎么打',
    callType: 'branch_judge',
    img: '/assets/scenes/lazikou_cliff.jpg',
    // 正面强攻从来不是零代价：这是全篇最后一个"会失去人"的抉择
    loss: { who: '突击班里的战士', reason: '正面强攻腊子口，突击班没能全部下来' },
    options: [
      { label: '正面佯攻，侧崖奇袭', sub: '出其不意', risk: 'mid' },
      { label: '集中火力正面强攻', sub: '硬碰硬', risk: 'high' },
      { label: '找向导绕道', sub: '耗粮但稳', risk: 'low' },
    ],
    factId: 'h_huining',
  },
  rally: {
    title: '会师',
    callType: 'branch_judge',
    img: '/assets/scenes/huining_flag.jpg',
    options: [
      { label: '跑过去和另一路兄弟拥抱', sub: '说不出话' },
      { label: '先安顿伤员再会合', sub: '责任' },
      { label: '把红旗插到高处', sub: '让所有人都看见' },
    ],
    factId: 'h_huining',
  },
  snow_help: {
    title: '扶他一把',
    callType: 'branch_judge',
    img: '/assets/scenes/snow_climb.jpg',
    npc: '掉队的战士',
    npcRole: '雪山掉队',
    loss: { who: '掉队的战士', reason: '风雪里他没能跟上，队伍在天黑前下不了山' },
    options: [
      { label: '架起他的胳膊一起走', sub: '慢，但谁都不落', risk: 'low' },
      { label: '替他背枪，让他自己走', sub: '分担一点是一点', risk: 'mid' },
      { label: '先赶到山顶再说', sub: '保存自己', risk: 'high' },
    ],
    factId: 'h_xueshan',
  },
  message: {
    title: '一封密信',
    callType: 'branch_judge',
    img: '/assets/scenes/zunyi_street.jpg',
    options: [
      { label: '按地址送到，不问内容', sub: '守规矩' },
      { label: '先交给指导员', sub: '稳妥' },
      { label: '拆开看一眼', sub: '心里不踏实' },
    ],
    factId: 'h_zunyi',
  },
  oillamp: {
    title: '油灯下的地图',
    callType: 'branch_judge',
    img: '/assets/scenes/map_desk.jpg',
    options: [
      { label: '照着地图找渡口', sub: '信图上的墨线' },
      { label: '出门问当地的老乡', sub: '信活人' },
      { label: '按原路折回一段', sub: '稳，但多耗体力' },
    ],
    factId: 'h_zunyi',
  },
  luding_plan: {
    title: '铁索桥头',
    callType: 'branch_judge',
    img: '/assets/scenes/luding_bridge.jpg',
    options: [
      { label: '先派人试探铁索', sub: '稳，但探路的人最险', risk: 'high' },
      { label: '等天色再暗些', sub: '隐蔽，但耗时间', risk: 'mid' },
      { label: '一次冲过去', sub: '快，铁索上没处躲', risk: 'high' },
    ],
    factId: 'h_luding',
  },
};

/**
 * 可重复的热点类型。其余热点做过一次就置灰（isDone），
 * 既防"反复点同一个热点刷资源/刷模型调用"，也让玩家必须去走没走过的地方。
 * 「休息」不在其中：它是体力恢复阀，靠 restCount 递减而不是禁用。
 */
export const REPEATABLE_HOTSPOTS = new Set(['fire', 'rest']);

/**
 * 交谈的「顺口一问」——**按人物给**，同名角色在不同幕可以再分幕写。
 *
 * 为什么要有这张表：原来 doTalk 里写死三句
 * （前面的路怎么走 / 你为什么来当红军 / 我想家了），谁点开都是这三句 ——
 * 母亲、船工、向导、新兵说着同一套话，人物之间没有区别（用户反馈）。
 * 取法：按 npc 名**子串匹配**角色键（"湘江老兵"命中「老兵」），
 * 角色项可以直接是数组（各幕通用），也可以是 `{ act3: [...], default: [...] }` 分幕写。
 *
 * 写法规矩：一行一句、口语、16 字内（按钮里放得下），
 * 而且它们是玩家"说出口"的话 —— 模型要接得住，不是菜单项。
 * 键的顺序有意义：靠前的先匹配，所以「向导」要写在更宽的「老乡」前面
 * （"向导老乡"两个键都命中，靠前的赢）。
 */
export const TALK_QUICK = {
  // ── 于都河 · 告别 ──
  母亲: [
    '我们什么时候能回来？',
    '您别送了，到门口就回吧。',
    '我会跟上队伍的，您放心。',
  ],
  // ── 湘江 · 伤亡最重的一幕 ──
  老兵: [
    '您打过多少仗了？',
    '这一路，您心里怕过吗？',
    '教我一手吧，我不想拖累别人。',
  ],
  担架伤员: [
    '疼得厉害吗？',
    '再忍一忍，前头就有人家。',
    '我给你讲个笑话吧。',
  ],
  卫生员: [
    '伤员还撑得住吗？',
    '纱布和药还够不够？',
    '我能搭把手做什么？',
  ],
  // ── 遵义 ──
  指导员: [
    '我们到底要往哪里去？',
    '为什么非得走这条路？',
    '有人想不通，该怎么跟他说？',
  ],
  // ── 金沙江 · 泸定 ──
  船工: [
    '这水有多深？',
    '一夜能渡几趟？',
    '老乡，这一趟多谢你了。',
  ],
  向导: [
    '隘口还有多远？',
    '这山能不能绕过去？',
    '您走前头，我们跟紧。',
  ],
  老乡: [
    '前头还有多少路？',
    '镇上有没有白军？',
    '您家里几口人？',
  ],
  // ── 雪山 · 草地 ──
  宣传员: [
    '鼓动一句什么好？',
    '同志们这会儿最想听什么？',
    '歇一歇吧，嗓子都哑了。',
  ],
  // ── 腊子口 · 会宁 ──
  新兵: [
    '怕不怕？',
    '家里还有什么人？',
    '到了会宁，你想做什么？',
  ],
  // 兜底：没登记的人物走这一档
  default: [
    '前面的路怎么走？',
    '你为什么来当红军？',
    '我想家了。',
  ],
};

/**
 * 取某个 NPC 的顺口一问。
 * @param {string} npcName 名字（子串匹配角色键，如「湘江老兵」命中「老兵」）
 * @param {string} [actId] 当前幕（角色项分幕写时用）
 * @returns {string[]} 3 句；永远有兜底，不会返回空
 */
export function talkQuickFor(npcName = '', actId = '') {
  const name = String(npcName || '');
  const key = Object.keys(TALK_QUICK).find((k) => k !== 'default' && name.includes(k));
  const entry = TALK_QUICK[key] || TALK_QUICK.default;
  if (Array.isArray(entry)) return entry;
  return entry[actId] || entry.default || TALK_QUICK.default;
}

