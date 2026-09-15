// AI 调用体检（qa:ai）—— 预算表、字段契约、真调日志三方对账，外加每类调用的实测账目。
//
// 为什么需要它：批 6 把"每类预算"搬进了 `public/js/modules/ai/registry.js`，而字段契约在
// `server/schema.js`（16 类）——两处必须**一一对应**：策略表里多一类而 schema 没有，
// 服务器会在落库前把响应判成"缺必需字段"；schema 多一类而策略表没有，那一类会吃默认预算。
// 这类漂移只在真调时才炸，所以这里做静态对账 + 读日志报实测。
//
// 用法：npm run qa:ai          读 logs/（或 LOG_DIR）里的真调记录
//       npm run qa:ai -- --json  只输出机器可读的那份
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED } from '../server/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'logs');
const JSON_OUT = process.argv.includes('--json');

const problems = [];
const ok = [];

// ── ① 策略表 ↔ 字段契约（16 类必须一一对应）──
const registrySrc = fs.readFileSync(path.join(ROOT, 'public/js/modules/ai/registry.js'), 'utf8');
// 只取 CALL_POLICY 段里的键（DEFAULT_POLICY 是兜底，不算一类）
const policySrc = registrySrc.slice(registrySrc.indexOf('export const CALL_POLICY'));
const policyTypes = [...policySrc.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
const schemaTypes = Object.keys(REQUIRED);
const onlyPolicy = policyTypes.filter((t) => !schemaTypes.includes(t));
const onlySchema = schemaTypes.filter((t) => !policyTypes.includes(t));
if (onlyPolicy.length) problems.push(`策略表里有、但 server/schema.js 没有的 callType：${onlyPolicy.join('、')}（落库会被判缺必需字段）`);
if (onlySchema.length) problems.push(`server/schema.js 有、但策略表里没登记的 callType：${onlySchema.join('、')}（这些会吃默认预算，漏改）`);
if (!onlyPolicy.length && !onlySchema.length) ok.push(`策略表与字段契约一一对应（${policyTypes.length} 类）`);

// ── ② 客户端真的把预算带出去了吗（静态看一眼，避免"表改了、请求没带"）──
const runSrc = fs.readFileSync(path.join(ROOT, 'public/js/modules/ai/run.js'), 'utf8');
if (!/maxTokens/.test(runSrc) || !/temperature/.test(runSrc)) {
  problems.push('modules/ai/run.js 没有把 maxTokens / temperature 带进请求（策略表就白写了）');
} else {
  ok.push('预算与温度随请求下发（server 侧会收口并记进日志）');
}

// ── ③ 读真调日志：每类的次数、耗时、额度、token 用量 ──
const readLogs = () => {
  if (!fs.existsSync(LOG_DIR)) return [];
  const seen = new Set();
  const out = [];
  for (const f of fs.readdirSync(LOG_DIR).filter((x) => x.endsWith('.jsonl'))) {
    for (const line of fs.readFileSync(path.join(LOG_DIR, f), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t);
        if (rec.source !== 'GLM') continue;              // 只统计真调（回放/错误另算）
        const key = rec.id || `${f}:${out.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(rec);
      } catch { /* 坏行跳过 */ }
    }
  }
  return out;
};
const logs = readLogs();
const byType = new Map();
for (const l of logs) {
  const t = l.callType || '(未标)';
  const r = byType.get(t) || { n: 0, ms: 0, max: 0, budget: new Set(), inTok: 0, outTok: 0, tokN: 0 };
  r.n += 1;
  r.ms += l.durationMs || 0;
  r.max = Math.max(r.max, l.durationMs || 0);
  if (l.budgetTokens) r.budget.add(l.budgetTokens);
  const u = l.usage;
  if (u && (u.prompt_tokens || u.completion_tokens)) {
    r.inTok += u.prompt_tokens || 0;
    r.outTok += u.completion_tokens || 0;
    r.tokN += 1;
  }
  byType.set(t, r);
}

// 落地但策略表里没登记的类（说明有调用绕过了 ask()）——这是最该拦的漂移
const strayTypes = [...byType.keys()].filter((t) => !policyTypes.includes(t));
if (strayTypes.length) problems.push(`日志里出现了策略表没登记的调用：${strayTypes.join('、')}（绕过了 modules/ai？）`);
const budgetOff = logs.filter((l) => l.budgetTokens && (l.budgetTokens < 300 || l.budgetTokens > 4000));
if (budgetOff.length) problems.push(`有 ${budgetOff.length} 条记录的额度越界（收口失效）`);

// 额度必须与策略表一致：不一致说明有调用**绕过了 modules/ai 的 ask()**（自己拍了默认值），
// 或者表改了没重跑那局。2026-09-15 就是靠这条发现 main.js 的 fireSceneGen / 选项预告、
// 以及几处后台调用仍在直连 decide()（于是它们的预算不受表管）。
//
// 判定口径：只看**每类最近一条**——"活着"的漂移才红；更早的历史记录如实记账不拦
// （否则改一次表就永久红，谁都不看它了）。
const policyOfType = {};
for (const m of policySrc.matchAll(/^\s{2}([a-z_]+):\s\{([^}]*)\}/gm)) {
  const mt = m[2].match(/maxTokens:\s*(\d+)/);
  policyOfType[m[1]] = mt ? Number(mt[1]) : null;
}
const byTime = [...logs].sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
const lastOf = new Map();
for (const l of byTime) if (l.budgetTokens) lastOf.set(l.callType, l);
const liveDrift = [];
const oldDrift = [];
for (const [type, rec] of lastOf.entries()) {
  const want = policyOfType[type];
  if (!want || rec.budgetTokens === want) continue;
  liveDrift.push(`${type}(最近一次 ${rec.budgetTokens} / 表里 ${want})`);
  oldDrift.push(type);
}
if (liveDrift.length) {
  problems.push(`最近一次调用的额度与策略表不一致：${liveDrift.join('、')}——有调用绕过了 ask()，或表改了没重跑`);
} else if (lastOf.size) {
  ok.push(`最近一次调用的额度都合策略表（${lastOf.size} 类可比对）`);
}
const staleMismatch = Object.keys(policyOfType).filter((t) => {
  const rec = lastOf.get(t);
  if (rec && rec.budgetTokens !== policyOfType[t]) return false;
  return logs.some((l) => l.callType === t && l.budgetTokens && l.budgetTokens !== policyOfType[t]);
});
if (staleMismatch.length && !liveDrift.length) {
  ok.push(`历史记录里有 ${staleMismatch.join('、')} 用过默认额度（改动之前的那几局，不影响当前）`);
}

if (!JSON_OUT) {
  console.log('AI 调用体检：');
  for (const o of ok) console.log('  ✓ ' + o);
  if (logs.length) {
    console.log(`\n实测（读 ${LOG_DIR.replace(ROOT + path.sep, '')}，真调 ${logs.length} 条）：`);
    console.log('  callType         次数   平均耗时   最慢    额度    token(入/出)');
    for (const [t, r] of [...byType.entries()].sort((a, b) => b[1].n - a[1].n)) {
      const avg = Math.round(r.ms / r.n);
      const budget = [...r.budget].join('/') || '—';
      const tok = r.tokN ? `${Math.round(r.inTok / r.tokN)}/${Math.round(r.outTok / r.tokN)}` : '—';
      console.log(`  ${t.padEnd(16)} ${String(r.n).padStart(4)} ${String(avg + 'ms').padStart(9)} ${String(r.max + 'ms').padStart(8)} ${budget.padStart(7)}    ${tok}`);
    }
  } else {
    console.log(`\n（${LOG_DIR.replace(ROOT + path.sep, '')} 里还没有真调记录：跑一局或 npm run verify:full 之后再来看实测）`);
  }
  console.log('');
}
if (JSON_OUT) {
  console.log(JSON.stringify({
    policyTypes,
    schemaTypes,
    problems,
    measured: Object.fromEntries([...byType.entries()].map(([t, r]) => [t, { n: r.n, avgMs: Math.round(r.ms / r.n), maxMs: r.max }])),
  }));
}
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\n✗ AI 体检未通过：${problems.length} 项`);
  process.exit(1);
}
if (!JSON_OUT) console.log('✓ AI 体检通过：预算表与字段契约一致、预算真的下发、日志里没有绕过的调用');
