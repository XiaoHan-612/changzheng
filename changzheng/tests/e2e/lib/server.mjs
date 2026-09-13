// 测试用服务启动器（唯一实现）。
//
// 踩过的坑：早先每个脚本各写一份 ensureServer()，只判断"端口上有没有服务"——
// 于是一个几小时前启动的旧进程会被一直复用，**服务端代码改动在测试里完全不生效**，
// 测出来的绿色是假绿。这里加了代码指纹比对：服务端代码比进程新，就杀掉重启。
import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const PORT = process.env.PORT || 3001;
export const BASE = `http://localhost:${PORT}`;

/** 本地 server/*.js 的最新修改时间（毫秒）；服务端会返回它启动时的同一口径 */
export function localCodeStamp() {
  const dir = path.join(ROOT, 'server');
  return Math.max(...fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
    .map((f) => fs.statSync(path.join(dir, f)).mtimeMs));
}

async function health() {
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function startDetached() {
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: 'ignore', detached: true });
  child.unref();
}

/**
 * 按端口杀掉"正在监听"的进程。
 * 用于迁移期：早先启动的旧服务不暴露 pid，只能从端口反查；
 * 只认 LISTENING 行，避免误伤恰好连过这个端口的浏览器等进程。
 */
function killByPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set(out.split('\n')
        .filter((l) => /LISTENING/i.test(l))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((p) => /^\d+$/.test(p) && Number(p) !== process.pid));
      for (const p of pids) { try { process.kill(Number(p)); } catch { /* ignore */ } }
      return pids.size;
    }
    const out = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
    const pids = out.split('\n').map((s) => s.trim()).filter(Boolean)
      .filter((p) => Number(p) !== process.pid);
    for (const p of pids) { try { process.kill(Number(p)); } catch { /* ignore */ } }
    return pids.length;
  } catch {
    return 0;
  }
}

/**
 * 确保有一个"跑着当前代码"的服务在监听。
 * - 没有服务 → 启一个
 * - 有服务但代码指纹落后 → 杀掉旧进程再启一个（这才是真正的坑）
 * @returns {Promise<{restarted:boolean}>}
 */
export async function ensureServer() {
  const want = localCodeStamp();
  const info = await health();
  if (info && info.codeStamp === want) return { restarted: false };

  if (info) {
    // 旧进程：先请它自己退出，退不掉再强杀
    if (info.pid) {
      try { process.kill(info.pid); } catch { /* 可能已退出 */ }
      for (let i = 0; i < 20; i++) {
        await sleep(150);
        if (!(await health())) break;
      }
      const still = await health();
      if (still && still.pid) { try { process.kill(still.pid, 'SIGKILL'); } catch { /* ignore */ } }
    } else {
      // 迁移期：旧版本服务不带 pid，从端口反查
      killByPort(Number(PORT));
    }
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      if (!(await health())) break;
    }
  }

  startDetached();
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    const now = await health();
    if (now && now.codeStamp === want) return { restarted: true };
  }
  throw new Error('无法启动服务（或服务代码指纹始终对不上）');
}
