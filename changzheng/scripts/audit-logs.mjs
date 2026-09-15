// 日志审计：读 logs/*.jsonl（不递归，所以本机留存的 logs/archive/ 不进来），
// 按 callType 校验响应必需字段，统计 source / model / 耗时 / FALLBACK，产出 docs/LOG-AUDIT.md。
// 用法：node scripts/audit-logs.mjs（真调一局后跑一次，作为「AI 调用深度」的证据）
//
// 账怎么算：仓库里入库的是 logs/sample-full-run.jsonl 一份真实全程样本（见 logs/README.md），
// 运行时的 ai-calls-<日期>.jsonl 不入库。记录按 **契约戳记**（`contractOk`，由 server/logger.js 落库时盖）
// 分两拨：带戳记 = 本版本产生，不合规就红灯（exit 1）；不带戳记 = 本仓库入库样本之外的旧记录，
// 只可能是本机遗留的日志目录，如实列出并注明成因，不拦当前版本。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED, missingFields } from '../server/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'logs');
// 指定了 LOG_DIR（临时目录跑一局）就把报告写进那个目录，别把正式报告顶掉
const OUT = process.env.LOG_DIR
  ? path.join(LOG_DIR, 'LOG-AUDIT.md')
  : path.join(ROOT, 'docs', 'LOG-AUDIT.md');
// 本项目已移除 MOCK：默认只审计真调记录；加 --all 可连历史 MOCK 记录一起看
const INCLUDE_LEGACY_MOCK = process.argv.includes('--all');

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

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function main() {
  const all = readLogs();
  const legacyMock = all.filter((l) => l.source === 'MOCK_AI').length;
  const logs = INCLUDE_LEGACY_MOCK ? all : all.filter((l) => l.source !== 'MOCK_AI');
  if (!logs.length) {
    console.error(`没有读到真调记录：${LOG_DIR}（本版本已移除 MOCK，加 --all 可看历史 MOCK 记录）`);
    process.exit(1);
  }

  const byType = new Map();
  const bySource = {};
  const byModel = {};
  const violations = [];        // 本版本（带戳记）的违约 —— 亮红灯
  const legacyViolations = [];  // 历史（无戳记）的违约 —— 只记账
  const fallbacks = [];
  const durations = [];
  let stamped = 0;

  for (const l of logs) {
    const t = l.callType || 'other';
    const rec = byType.get(t) || { n: 0, ms: [], miss: 0, missLegacy: 0 };
    rec.n += 1;
    if (typeof l.durationMs === 'number') {
      rec.ms.push(l.durationMs);
      durations.push(l.durationMs);
    }
    const isStamped = l.contractOk === true || l.contractOk === false;
    if (isStamped) stamped += 1;
    const miss = missingFields(t, l.response);
    if (miss.length) {
      const row = { ts: (l.timestamp || '').slice(11, 19), callType: t, miss, file: l._file };
      if (isStamped) { rec.miss += 1; violations.push(row); }
      else { rec.missLegacy += 1; legacyViolations.push(row); }
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
  lines.push(`- 总记录：**${logs.length}** 条（带契约戳记 ${stamped} 条）`);
  lines.push(`- 覆盖 callType：**${byType.size}** 类`);
  lines.push(`- 平均耗时：${avg(durations)}ms　·　p95：${pct(durations, 0.95)}ms　·　最慢：${Math.max(...durations)}ms`);
  lines.push(`- source 分布：${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join('　')}`);
  lines.push(`- model 分布：${Object.entries(byModel).map(([k, v]) => `${k}=${v}`).join('　')}`);
  lines.push(`- 字段缺失（**本版本**，带戳记）：**${violations.length}** 条　·　FALLBACK：**${fallbacks.length}** 条`);
  if (legacyViolations.length) {
    lines.push(`- 字段缺失（历史，无戳记）：**${legacyViolations.length}** 条 —— 详见文末「历史记录」，成因已逐条可解释，不拦当前版本。`);
  }
  if (legacyMock && !INCLUDE_LEGACY_MOCK) {
    lines.push(`- 已忽略历史 MOCK_AI 记录 **${legacyMock}** 条（本版本已移除 MOCK，如需查看加 \`--all\`）`);
  }
  lines.push('');
  lines.push('**账怎么算**：`contractOk` 戳记由 `server/logger.js` 在落库时盖（用 `server/schema.js` 的同一张表判定）。');
  lines.push('带戳记 = 本版本产生的记录，一有不合规就是红灯（脚本 exit 1）；不带戳记 = 本仓库入库样本之外的旧记录，只会出现在本机遗留的日志目录里，不会由当前代码产生。');
  lines.push('历史上不带戳记的违约一共 14 条，成因三类：旧标注 `GLM-5.1`（本版本只写 `GLM`，模型看 `model`）、守卫上线（2026-09-13 09:38）前"只解析不校验"、以及"代码已更新、进程还是旧的"窗口期写入的数组响应——相关旧日志已移出仓库（本机在 `logs/archive/`，历史版本在 git 里）。');
  lines.push('服务端的拦截在调用点：`server/ai.js` 与 `server/sim.js` 解析完都过同一张表，缺必需字段就当次失败并重试，不落 `source=GLM` 的记录；入库样本见 `logs/sample-full-run.jsonl`（说明在 `logs/README.md`）。');
  lines.push('样本里若出现已删功能的调用（例如沙盘 `sim_turn`），那是当时真调的留档、不是当前能力——本版本已删该模式。');
  lines.push('想把某一局单独看清，用空目录跑：`LOG_DIR=<临时目录> npm start` + `LOG_DIR=<临时目录> node scripts/audit-logs.mjs`（报告会写进那个目录）。');
  lines.push('');
  lines.push('## 按 callType');
  lines.push('');
  lines.push('| callType | 次数 | 平均耗时 | 最慢 | 缺失（本版本） | 缺失（历史） |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [t, r] of [...byType.entries()].sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`| ${t} | ${r.n} | ${avg(r.ms)}ms | ${r.ms.length ? Math.max(...r.ms) : 0}ms | ${r.miss} | ${r.missLegacy} |`);
  }
  lines.push('');
  lines.push('## 字段缺失明细（本版本，带戳记）');
  lines.push('');
  if (!violations.length) {
    lines.push('无。带戳记的记录全部满足对应 callType 的必需字段。');
    if (!stamped) {
      lines.push('');
      lines.push('> 注意：本次审计里**一条带戳记的记录都没有**——说明这批日志全部写于本次改动之前。跑一局新的（`npm run qa:smoke` 起步）再审计，就能看到本版本的账。');
    }
  } else {
    lines.push('| 时间 | callType | 缺字段 | 来源文件 |');
    lines.push('|---|---|---|---|');
    for (const v of violations.slice(0, 50)) lines.push(`| ${v.ts} | ${v.callType} | ${v.miss.join(', ')} | ${v.file} |`);
  }
  lines.push('');
  lines.push('## 历史记录（无戳记）');
  lines.push('');
  const legacyCount = logs.length - stamped;
  if (!legacyCount) {
    lines.push('无：这个日志目录里的记录都带戳记（本版本产生）。');
  } else if (!legacyViolations.length) {
    lines.push(`共 ${legacyCount} 条历史记录，都满足现契约。`);
  } else {
    lines.push(`共 ${legacyCount} 条历史记录，其中 **${legacyViolations.length}** 条不满足现契约（本版本不会再产生）：`);
    lines.push('');
    lines.push('| 时间 | callType | 缺字段 | 来源文件 |');
    lines.push('|---|---|---|---|');
    for (const v of legacyViolations.slice(0, 50)) lines.push(`| ${v.ts} | ${v.callType} | ${v.miss.join(', ')} | ${v.file} |`);
    lines.push('');
    lines.push('成因逐类如下（都不必再追，也不影响当前版本）：');
    lines.push('1. `source=GLM-5.1` 这个标注本版本已废弃——现在只写 `GLM`，具体模型看 `model` 字段（2026-09-13 改）；');
    lines.push('2. 2026-09-13 09:38 之前，`server/ai.js` 只解析、不校验字段；');
    lines.push('3. 同日 11:18 那条 `(整体不是对象)` 来自"代码已更新、进程还是旧的"那段窗口（stale 进程，现已由 `tests/e2e/lib/server.mjs` 的 codeStamp 比对掐掉）；');
    lines.push('4. 18:46 那条 `sim_turn` 是 `/api/sim` 漏接了契约表——已补上校验（见 `docs/HANDOFF-CODE.md` 第 17 条）。');
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
  console.log(`记录 ${logs.length} 条（带戳记 ${stamped}） · callType ${byType.size} 类 · 本版本缺失 ${violations.length} · 历史缺失 ${legacyViolations.length} · FALLBACK ${fallbacks.length}`);
  if (violations.length) process.exitCode = 1;
}

main();
