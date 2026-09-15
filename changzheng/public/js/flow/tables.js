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

