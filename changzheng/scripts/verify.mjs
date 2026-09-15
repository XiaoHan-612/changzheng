/**
 * 验收编排器 —— 把"一堆 npm run qa:xxx"收成两条命令，并按**并行 + 隔离**跑。
 *
 * 为什么要它：改一行代码想知道的那些检查（unit / 一致性守卫 / 总线 / 动效 / 玩法板 / 音频）
 * 加起来只要 75 秒，但串行跑 + 每个脚本各起一次浏览器与服务，就变成了"懒得跑"。
 * 真调那一档（e2e / av …）是分钟级，属于交付验收，不该混在随手校验里。
 *
 *   npm run verify:fast    改动过程中跑，**并行**（目标 <30s，会真调几次）
 *   npm run verify:full    真调那一档，**串行**跑（避免并发挤网关），逐项报耗时与调用次数
 *
 * 隔离：每个任务拿自己的 PORT / LOG_DIR / RUNTIME_CONFIG（都是服务端读的环境变量），
 * 所以并行不会互相踢端口、不会把日志写成一锅粥、也不会动仓库里的 runtime-config.json。
 * 失败时先把带 ✗ 的行捞出来，再补输出尾部——省得在几百行日志里找。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'czjc-verify-'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const concurrencyArg = process.argv.find((a) => a.startsWith('--jobs='));
const MODE = process.argv.includes('--full') ? 'full' : 'fast';

/**
 * 快档：日常那一批。顺序无所谓，并行跑。
 * 注意其中 `motion` 会真调（它要点一次抉择，实测 3 次调用）——想完全不烧额度就用
 * `npm run dev:check`（6 秒、走到玩法板为止，那条路径不碰模型）。
 */
const FAST = [
  { name: 'unit', cmd: 'npm', args: ['run', 'test:unit'] },
  { name: 'tokens', cmd: 'npm', args: ['run', 'qa:tokens'] },
  { name: 'frames', cmd: 'npm', args: ['run', 'qa:frames'] },
  { name: 'tone', cmd: 'npm', args: ['run', 'qa:tone'] },
  { name: 'handoff', cmd: 'npm', args: ['run', 'qa:handoff'] },
  { name: 'bus', cmd: 'npm', args: ['run', 'qa:bus'] },
  { name: 'motion', cmd: 'npm', args: ['run', 'qa:motion'] },
  { name: 'board', cmd: 'npm', args: ['run', 'qa:board'] },
  { name: 'audio', cmd: 'npm', args: ['run', 'qa:audio'] },
  { name: 'ai', cmd: 'npm', args: ['run', 'qa:ai'] },
  { name: 'assets', cmd: 'npm', args: ['run', 'qa:assets'] },
];

/** 真调档：串行（并发打网关既慢又不稳），且如实报"这一轮烧了多少次调用"。 */
const FULL = [
  { name: 'e2e', cmd: 'npm', args: ['run', 'test:e2e'], calls: true },
  { name: 'av', cmd: 'npm', args: ['run', 'qa:av'], calls: true },
  { name: 'sandbox', cmd: 'npm', args: ['run', 'qa:sandbox'], calls: true },
  { name: 'regress', cmd: 'npm', args: ['run', 'qa:regress'], calls: true },
  { name: 'failure', cmd: 'npm', args: ['run', 'qa:failure'], calls: true },
  { name: 'loss', cmd: 'npm', args: ['run', 'qa:loss'], calls: true },
  { name: 'smoke', cmd: 'npm', args: ['run', 'qa:smoke'], calls: true },
];

const TASKS = MODE === 'full' ? FULL : FAST;
const picked = only.length ? TASKS.filter((t) => only.includes(t.name)) : TASKS;
// 并发默认 3：磁盘/静态任务很快，占大头的是几个浏览器任务（动效/玩法板/音频/素材），
// 开 4 个以上它们互相抢 CPU，墙钟反而更长、固定等待也更容易抖。
const JOBS = Number(concurrencyArg ? concurrencyArg.split('=')[1] : 0) || (MODE === 'full' ? 1 : 3);

/** 数一下这一轮真调了几次（按日志里的 id 去重，与 qa:audit 同一口径） */
function countCalls(logDir) {
  try {
    const seen = new Set();
    for (const f of fs.readdirSync(logDir).filter((x) => x.endsWith('.jsonl'))) {
      for (const line of fs.readFileSync(path.join(logDir, f), 'utf8').split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const rec = JSON.parse(t);
          if (rec.source !== 'MOCK_AI') seen.add(rec.id || `${f}:${seen.size}`);
        } catch { /* 跳过坏行 */ }
      }
    }
    return seen.size;
  } catch {
    return 0;
  }
}

/**
 * 杀掉某个端口上的监听进程。
 *
 * 为什么每个任务跑完要做这一步：任务里的脚本会 `ensureServer()` 起一个**游离**服务，
 * 它在本任务结束后还活着。下一个任务、甚至下一轮验收，如果正好落在同一个端口上，
 * `ensureServer` 只看代码指纹——指纹一致就把旧进程**当成自己的继续用**，
 * 于是请求写到旧进程的 `LOG_DIR`（临时目录，多半已被删）。症状极具迷惑性：
 * 任务里"一次真调都没发生"，而仓库日志里却多出几条来路不明的记录
 * （2026-09-15 的 loss 项超时 10 分钟、真调 0 次，就是这个；单跑必过）。
 */
function killByPort(port) {
  try {
    const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
    const pids = new Set(out.split('\n')
      .filter((l) => /LISTENING/i.test(l) && new RegExp(`:${port}\\s`).test(l))
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((p) => /^\d+$/.test(p) && Number(p) !== process.pid));
    for (const p of pids) { try { process.kill(Number(p)); } catch { /* 已经没了 */ } }
    return pids.size;
  } catch {
    return 0;
  }
}

function run(task, slot) {
  return new Promise((resolve) => {
    const port = 3200 + slot;
    const logDir = path.join(TMP, `logs-${task.name}`);
    fs.mkdirSync(logDir, { recursive: true });
    const env = {
      ...process.env,
      PORT: String(port),
      LOG_DIR: logDir,
      RUNTIME_CONFIG: path.join(TMP, `runtime-${task.name}.json`),
    };
    const t0 = Date.now();
    const child = spawn(task.cmd, task.args, { cwd: ROOT, env, shell: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      const killed = killByPort(port);      // 交还端口：别让游离服务活到下一个任务/下一轮
      resolve({ ...task, code, ms: Date.now() - t0, out, calls: countCalls(logDir), killed });
    });
  });
}

const results = [];
const queue = [...picked];
const t0 = Date.now();
process.stdout.write(`验收（${MODE === 'fast' ? '快档' : '真调档'}）共 ${picked.length} 项，并发 ${JOBS}\n\n`);

let slot = 0;
async function worker() {
  for (;;) {
    const task = queue.shift();
    if (!task) return;
    const r = await run(task, slot++);
    results.push(r);
    const mark = r.code === 0 ? '✓' : '✗';
    console.log(`  ${mark} ${r.name.padEnd(9)} ${(r.ms / 1000).toFixed(1)}s · 真调 ${r.calls} 次`);
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, picked.length) }, worker));

const failed = results.filter((r) => r.code !== 0);
const total = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n合计 ${total}s（串行约需 ${(results.reduce((s, r) => s + r.ms, 0) / 1000).toFixed(0)}s）`);
if (failed.length) {
  for (const f of failed) {
    console.log(`\n───── ${f.name} 失败（exit ${f.code}）─────`);
    // 只打尾部会把失败行截掉：qa 脚本先打一整张表，✗ 通常落在表里、表又在 24 行之外。
    // 所以先把带 ✗ / 报错字样的行捞出来，再补尾部。
    const lines = f.out.trim().split('\n');
    const hits = lines.filter((l) => /✗|Error|error:|未命中|没有录制|pageerror|失败/.test(l)).slice(0, 12);
    if (hits.length) {
      console.log('  ▸ 命中问题的行：');
      for (const h of hits) console.log('    ' + h.trim());
    }
    console.log('  ▸ 输出尾部：');
    console.log(lines.slice(-18).join('\n'));
  }
  console.log(`\n✗ ${failed.length}/${results.length} 项未通过：${failed.map((f) => f.name).join('、')}`);
} else {
  console.log(`\n✓ ${results.length}/${results.length} 项全部通过`);
}
const totalCalls = results.reduce((s, r) => s + (r.calls || 0), 0);
if (totalCalls) console.log(`本轮真调合计 ${totalCalls} 次（额度与耗时主要花在这里）`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
