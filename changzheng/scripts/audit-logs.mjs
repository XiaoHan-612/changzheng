// 日志审计：读 logs/*.jsonl，按 callType 校验响应必需字段，
// 统计 source / model / 耗时 / FALLBACK，产出 docs/LOG-AUDIT.md。
// 用法：node scripts/audit-logs.mjs（真调一局后跑一次，作为「AI 调用深度」的证据）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'logs');
const OUT = path.join(ROOT, 'docs', 'LOG-AUDIT.md');

// 每个 callType 的响应必需字段；用 | 表示"任一命中即可"
const REQUIRED = {
  scene_gen: ['title', 'atmosphere'],
  choice_hint: ['hints'],
  npc_chat: ['reply'],
  share_judge: ['effects', 'narrative', 'choice'],
  minigame_review: ['effects', 'narrative'],
  branch_judge: ['effects', 'scene_text|narrative'],
  quiz_generate: ['question', 'options', 'answer_index'],
  quiz_answer_ai: ['answer_index'],
  quiz_judge: ['human_score', 'ai_score'],
  night_options: ['options'],
  night_resolve: ['narrative'],
  ending_review: ['ending_id', 'paragraphs'],
  act_review: ['title', 'lines'],
  failure_review: ['paragraphs'],
  study_report: ['summary'],
  sim_turn: ['narrative', 'feasible'],
};

function readLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];
  const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.jsonl'));
  // 注意：同一条调用会同时写进「按日文件」和 session-full.jsonl，
  // 直接遍历会重复计数，所以按 id 去重。
  const seen = new Set();
  const out = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(LOG_DIR, f), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t);
        const key = rec.id || `${f}:${out.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...rec, _file: f });
      } catch { /* 跳过坏行 */ }
    }
  }
  return out;
}

function missingFields(callType, res) {
  const need = REQUIRED[callType];
  if (!need || !res) return [];
  return need.filter((spec) => {
    const keys = spec.split('|');
    return !keys.some((k) => res[k] !== undefined && res[k] !== null);
  });
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function main() {
  const logs = readLogs();
  if (!logs.length) {
    console.error(`没有读到日志：${LOG_DIR}`);
    process.exit(1);
  }

  const byType = new Map();
  const bySource = {};
  const byModel = {};
  const violations = [];
  const fallbacks = [];
  const durations = [];

  for (const l of logs) {
    const t = l.callType || 'other';
    const rec = byType.get(t) || { n: 0, ms: [], miss: 0 };
    rec.n += 1;
    if (typeof l.durationMs === 'number') {
      rec.ms.push(l.durationMs);
      durations.push(l.durationMs);
    }
    const miss = missingFields(t, l.response);
    if (miss.length) {
      rec.miss += 1;
      violations.push({ ts: (l.timestamp || '').slice(11, 19), callType: t, miss, file: l._file });
    }
    byType.set(t, rec);
    bySource[l.source || '?'] = (bySource[l.source || '?'] || 0) + 1;
    byModel[l.model || '?'] = (byModel[l.model || '?'] || 0) + 1;
    if (l.source === 'FALLBACK') fallbacks.push({ ts: (l.timestamp || '').slice(11, 19), callType: t, error: l.error || '' });
  }

  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  const lines = [];
  lines.push('# AI 调用日志审计');
  lines.push('');
  lines.push(`> 由 node scripts/audit-logs.mjs 生成 · 日志目录 ${LOG_DIR.replace(ROOT + path.sep, '')}`);
  lines.push('');
  lines.push(`- 总记录：**${logs.length}** 条`);
  lines.push(`- 覆盖 callType：**${byType.size}** 类`);
  lines.push(`- 平均耗时：${avg(durations)}ms　·　p95：${pct(durations, 0.95)}ms　·　最慢：${Math.max(...durations)}ms`);
  lines.push(`- source 分布：${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join('　')}`);
  lines.push(`- model 分布：${Object.entries(byModel).map(([k, v]) => `${k}=${v}`).join('　')}`);
  lines.push(`- 字段缺失：**${violations.length}** 条　·　FALLBACK：**${fallbacks.length}** 条`);
  lines.push('- 说明：日志按日累积，可能混入旧版本产生的记录；判断当前版本是否合规，以本轮之后新增的记录为准。');
  lines.push('');
  lines.push('## 按 callType');
  lines.push('');
  lines.push('| callType | 次数 | 平均耗时 | 最慢 | 字段缺失 |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const [t, r] of [...byType.entries()].sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`| ${t} | ${r.n} | ${avg(r.ms)}ms | ${r.ms.length ? Math.max(...r.ms) : 0}ms | ${r.miss} |`);
  }
  lines.push('');
  lines.push('## 字段缺失明细');
  lines.push('');
  if (!violations.length) lines.push('无。所有记录都满足对应 callType 的必需字段。');
  else {
    lines.push('| 时间 | callType | 缺字段 | 来源文件 |');
    lines.push('|---|---|---|---|');
    for (const v of violations.slice(0, 50)) lines.push(`| ${v.ts} | ${v.callType} | ${v.miss.join(', ')} | ${v.file} |`);
  }
  lines.push('');
  lines.push('## FALLBACK 明细');
  lines.push('');
  if (!fallbacks.length) lines.push('无。');
  else {
    lines.push('| 时间 | callType | 错误 |');
    lines.push('|---|---|---|');
    for (const f of fallbacks.slice(0, 50)) lines.push(`| ${f.ts} | ${f.callType} | ${String(f.error).slice(0, 120)} |`);
  }
  lines.push('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`已写出 ${path.relative(ROOT, OUT)}`);
  console.log(`记录 ${logs.length} 条 · callType ${byType.size} 类 · 缺失 ${violations.length} · FALLBACK ${fallbacks.length}`);
  if (violations.length) process.exitCode = 1;
}

main();
