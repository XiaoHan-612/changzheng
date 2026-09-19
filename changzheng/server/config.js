import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
const runtimePath = process.env.RUNTIME_CONFIG || path.join(__dirname, '..', 'runtime-config.json');

function readJsonFile(p) {
  try {
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`[config] ${path.basename(p)} 解析失败，已按空配置继续：${err.message}`);
    return {};
  }
}

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) {
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      out[k] = v;
    }
  }
  return out;
}

const envFile = loadEnvFile(envPath);
const runtime = readJsonFile(runtimePath);

/** 赛制指定的天津移动网关。放在 CONFIG 之前：默认值与地址安全闸都要用它 */
export const COMPETITION_API_URL = 'http://111.32.22.35:32592/mgate/v1/chat/completions';

// runtime-config.json 可覆盖 .env（设置界面写入）
export const CONFIG = {
  // 默认就是赛制指定的天津移动网关。注意路径必须带 /mgate/v1：
  // 少了这一段网关不报错，只静默回 204 空响应，游戏里表现为"每次调用都失败"。
  GLM_API_URL:
    runtime.GLM_API_URL ||
    process.env.GLM_API_URL ||
    envFile.GLM_API_URL ||
    COMPETITION_API_URL,
  GLM_API_KEY: runtime.GLM_API_KEY || process.env.GLM_API_KEY || envFile.GLM_API_KEY || '',
  // 赛制指定 glm-5.1（该网关 /mgate/v1/models 只挂这一个模型，填别的会失败）
  GLM_MODEL: runtime.GLM_MODEL || process.env.GLM_MODEL || envFile.GLM_MODEL || 'glm-5.1',
  // 这个是「思考档位」的兜底值。本网关的 glm-5.1 始终思考，运行态已在 ai.js 里
  // 用 chat_template_kwargs 直接把思考关掉（不然小预算调用 content 全空），
  // 所以档位实际不生效；保留字段是为了换回智谱端时还能调。max 档本网关不认，会被 ai.js 过滤掉。
  GLM_REASONING_EFFORT:
    runtime.GLM_REASONING_EFFORT || process.env.GLM_REASONING_EFFORT
    || envFile.GLM_REASONING_EFFORT || 'low',
  PORT: Number(process.env.PORT || envFile.PORT || 3001),
  LOG_DIR: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
  // 没有兜底文案了，重试与超时要克制：最坏 35s + 0.6s + 35s ≈ 71s 就报错给用户重试。
  // 35s 是照实测定的（2026-09-17 天津移动网关、关思考后各类调用）：
  //   小调用 0.5–1.7s；scene_gen/branch_judge 5–7s；最重的 ending_review 14.3s、school_quiz 12.9s。
  // 原来 25s 对重结算类余量不到一倍，网关一慢就会误判超时并触发重试（玩家白等一轮）。
  MAX_RETRIES: 2,
  TIMEOUT_MS: 35000,
  runtimePath,
};

/**
 * 接口地址的安全闸：**host 必须在白名单里**。
 *
 * 白名单 = 赛制指定的 `open.bigmodel.cn` + 赛制指定的天津移动网关 + **本机已经保存过的那一个**
 * （`.env` / `runtime-config.json` 里配的，可能是自建网关）。
 * 用途有两处，口径同一条：设置页的「测试连通」探测、以及写 runtime-config 时改 apiUrl。
 * 为什么要有它：这两个入口过去接受任意 URL —— 局域网里的别人可以把演示机当成
 * "拿你们的 Key 打任意地址"的代理（Key 还会被发到那个地址上）。
 *
 * 为什么白名单内的 http 也放行（2026-09-17 补）：赛制指定的天津移动网关**只有 http**
 * （`http://111.32.22.35:32592/mgate/v1/...`）。原来的"一律要求 https"会把
 * **赛制必须用的那个地址**判成非法 —— 设置页的「测试连通」和"改接口"都会失败，
 * 加固不能把赛道堵死。安全边界因此收在 host 白名单上：地址只能指向
 * ① 赛制指定的两个（写死在这里），或 ② 本机文件里已经存过的那个（局域网改不了本机文件）。
 * 任意第三方 host 依然进不来，"拿 Key 打任意地址"这条堵住不动。
 */
export function assertSafeApiUrl(raw) {
  const s = String(raw || '').trim();
  let u;
  try { u = new URL(s); } catch { throw new Error(`接口地址不是合法 URL：${s || '(空)'}`); }
  const allowed = new Set(['open.bigmodel.cn', new URL(COMPETITION_API_URL).host]);
  try { allowed.add(new URL(CONFIG.GLM_API_URL).host); } catch { /* 保存的那个不合法就不加 */ }
  if (!allowed.has(u.host)) {
    throw new Error(
      `接口地址不在白名单：${u.host}（只允许 open.bigmodel.cn、111.32.22.35:32592 赛制网关，或本机已保存过的那个接口）`,
    );
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`接口地址协议不支持：${u.protocol}（只允许 http / https）`);
  }
  return u.toString();
}

export function saveRuntimeConfig(patch) {
  const next = { ...runtime, ...patch };
  // 清除与保留的语义分开：**空字符串 = 清除这一项**（设置里清空输入框就是清空），
  // null / undefined = 没给这一项，保持原值（也会从文件里删掉，不留 `"X": null` 这种垃圾）。
  // 早先注释写反了（说"传 null 清空"），而实现只认空字符串——注释已按实际行为改正。
  for (const k of Object.keys(next)) {
    if (next[k] === null || next[k] === undefined) delete next[k];
  }
  fs.writeFileSync(runtimePath, JSON.stringify(next, null, 2), 'utf8');
  Object.assign(runtime, next);
  if ('GLM_API_KEY' in patch) CONFIG.GLM_API_KEY = patch.GLM_API_KEY ?? CONFIG.GLM_API_KEY;
  if ('GLM_MODEL' in patch) CONFIG.GLM_MODEL = patch.GLM_MODEL ?? CONFIG.GLM_MODEL;
  if ('GLM_API_URL' in patch) CONFIG.GLM_API_URL = patch.GLM_API_URL ?? CONFIG.GLM_API_URL;
  if ('GLM_REASONING_EFFORT' in patch) CONFIG.GLM_REASONING_EFFORT = patch.GLM_REASONING_EFFORT ?? CONFIG.GLM_REASONING_EFFORT;
  if (patch.GLM_API_KEY === '') CONFIG.GLM_API_KEY = '';
  // 清空模型字段 = 回到**赛制指定的那个**（不是回到本机测试用的 flash）：
  // 这里回退成 glm-5.3-flash 会让"清一下输入框"顺手把赛制口径换掉，评委问起来说不清（2026-09-15 修）
  if (patch.GLM_MODEL === '') CONFIG.GLM_MODEL = 'glm-5.1';
  // 清空接口字段同理：回到天津移动网关（含 /mgate/v1），而不是智谱默认端点
  if (patch.GLM_API_URL === '') CONFIG.GLM_API_URL = COMPETITION_API_URL;
  return {
    model: CONFIG.GLM_MODEL,
    reasoningEffort: CONFIG.GLM_REASONING_EFFORT,
    hasKey: !!CONFIG.GLM_API_KEY,
    apiUrl: CONFIG.GLM_API_URL.replace(/\/[^/]*$/, '/***'),
    keyMask: CONFIG.GLM_API_KEY ? `${CONFIG.GLM_API_KEY.slice(0, 6)}…${CONFIG.GLM_API_KEY.slice(-4)}` : '',
  };
}
