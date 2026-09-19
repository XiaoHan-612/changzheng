'use strict';
/**
 * 《星火微光·我路过他们的长征》桌面外壳
 * ─────────────────────────────────────────────────────────────
 * 这个文件只做「封装」这一件事，不碰任何玩法逻辑：
 *   1. 找一个空闲端口，把原工程的 Express 服务（changzheng/server/index.js）直接拉起来；
 *   2. 把「会写盘」的三处（.env / runtime-config.json / logs）指到 exe 旁边的 user-data/，
 *      这样封装后的目录是「绿色版」：配置、日志、审计 JSONL 都能在文件夹里直接找到；
 *   3. 开一个没有地址栏、没有菜单的窗口指向 http://127.0.0.1:<port>，双击即可玩。
 *
 * 之所以用「进程内 import 服务」而不是另起一个 node 子进程：原工程的 server/index.js
 * 是 import 即启动的 ESM 模块，同进程内跑既没有多余的黑窗口，也不用去解析它的 stdout 猜端口。
 */
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { pathToFileURL } = require('node:url');

const APP_TITLE = '长征 · 抉择';

// ── 游戏工程所在目录 ──
// 打包后：<exe 同级>/resources/app/changzheng/
// 开发时：packaging/../changzheng/（方便 build 前先跑一遍看看）
const GAME_DIR = (() => {
  const packaged = path.join(__dirname, 'changzheng');
  if (fs.existsSync(path.join(packaged, 'server', 'index.js'))) return packaged;
  const dev = path.resolve(__dirname, '..', 'changzheng');
  return dev;
})();

// ── 单实例：第二次双击就把已有窗口叫到前面，别开出两个服务抢端口 ──
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main().catch((err) => {
    fatal('启动失败', err);
  });
}

// 无人值守时的兜底：Chromium 默认「没有用户手势不放声音」，游戏里开局那一下点击
// 之后才起环境床，本来也够；但演示机上被静音过一次就再也不出声很难解释，直接放开。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function main() {
  let stateDir = null;

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  await app.whenReady();

  stateDir = pickStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const logFile = path.join(stateDir, '启动日志.txt');
  teeConsole(logFile);

  const envFile = pickEnvFile(stateDir);
  const port = await pickPort();

  // 这三行必须在 import 服务端**之前**设置：config.js 在模块加载时就把它们读走了。
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.ENV_FILE = envFile;
  process.env.RUNTIME_CONFIG = path.join(stateDir, 'runtime-config.json');
  process.env.LOG_DIR = path.join(stateDir, 'logs');

  console.log('══════════════════════════════════════════════');
  console.log(`  ${APP_TITLE} · 桌面封装版`);
  console.log(`  游戏工程: ${GAME_DIR}`);
  console.log(`  配置目录: ${stateDir}`);
  console.log(`  Key 来源: ${envFile}`
    + (fs.existsSync(path.join(stateDir, '.env'))
      ? '（user-data/.env）'
      : '（发布包内不含 Key —— 没配过就请到游戏内「设置」里填）'));
  console.log(`  端口: ${port}`);
  console.log(`  启动时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('══════════════════════════════════════════════');

  Menu.setApplicationMenu(null);

  const win = createWindow();
  await win.loadURL(splashUrl());

  const ready = await importGameServer();
  if (!ready) {
    await dialog.showMessageBox({
      type: 'error',
      title: APP_TITLE,
      message: '游戏服务没能启动',
      detail: `本地服务在 127.0.0.1:${port} 上没有响应。\n\n启动日志：${logFile}`,
      buttons: ['退出'],
    });
    app.exit(1);
    return;
  }

  const base = `http://127.0.0.1:${port}`;
  try {
    await win.loadURL(base);
  } catch (err) {
    console.error('页面加载失败：', err);
    await dialog.showMessageBox({
      type: 'error',
      title: APP_TITLE,
      message: '游戏界面没能打开',
      detail: `地址：${base}\n${err && err.message ? err.message : err}\n\n启动日志：${logFile}`,
      buttons: ['退出'],
    });
    app.exit(1);
    return;
  }

  win.show();
  win.focus();
  console.log(`[shell] 界面已打开：${base}`);

  app.on('window-all-closed', () => app.quit());
}

// ────────────────────────── 窗口 ──────────────────────────

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    useContentSize: true,          // 让「内容区」正好 1280×800 —— 与策划/测试时的视口一致
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d12',
    title: APP_TITLE,
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // 演出里有大量影音与定时器，窗口被挡住时不要降频（否则回营地那一下会顿）
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);

  // 游戏里不需要第二个窗口；外链一律丢给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://127.0.0.1:') && !url.startsWith('data:')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // 没有菜单栏，快捷键自己接：F11 全屏、Ctrl+Shift+I / F12 开调试
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[shell] 渲染进程退出：', details);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    // 加载中途被下一次 loadURL 顶掉（-3）是正常的，不当错误报
    if (code === -3) return;
    console.error(`[shell] 加载失败 ${code} ${desc} ${url}`);
  });

  return win;
}

function splashUrl() {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:#0b0d12;color:#e8e2d4;
    font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center}
  .box{text-align:center}
  .t{font-size:22px;letter-spacing:.28em;opacity:.92}
  .s{margin-top:14px;font-size:13px;opacity:.5;letter-spacing:.1em}
  .bar{margin:26px auto 0;width:180px;height:2px;background:#2a2f3a;overflow:hidden;border-radius:2px}
  .bar i{display:block;width:40%;height:100%;background:#c8a15a;animation:run 1.1s ease-in-out infinite}
  @keyframes run{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
</style></head><body><div class="box">
  <div class="t">长 征 · 抉 择</div>
  <div class="s">正在启动本地服务…</div>
  <div class="bar"><i></i></div>
</div></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// ────────────────────────── 服务 ──────────────────────────

async function importGameServer() {
  const entry = path.join(GAME_DIR, 'server', 'index.js');
  if (!fs.existsSync(entry)) {
    console.error(`[shell] 找不到服务端入口：${entry}`);
    return false;
  }
  try {
    // 原工程 server/index.js 是「import 即 listen」的模块，这里 import 一下服务就起来了
    await import(pathToFileURL(entry).href);
  } catch (err) {
    console.error('[shell] 服务端 import 失败：', err);
    return false;
  }
  return waitForServer(Number(process.env.PORT), 30000);
}

async function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return true;
    } catch { /* 还没起来，接着等 */ }
    await sleep(150);
  }
  return false;
}

function pickPort() {
  // 显式给了 PORT 就用它（自动化验收要用），否则每次挑一个空闲端口，避免和别的程序抢 3001
  const forced = Number(process.env.PORT);
  if (Number.isInteger(forced) && forced > 0) return Promise.resolve(forced);
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(3001));
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

// ────────────────────────── 可写目录 / 配置 ──────────────────────────

/**
 * 用户数据放哪：优先 exe 同级的 user-data/（绿色版，日志与配置一眼可见），
 * 目录不可写（例如装到了 Program Files 又没提权）就退回系统 %APPDATA%。
 */
function pickStateDir() {
  if (process.env.CZ_STATE_DIR) return process.env.CZ_STATE_DIR;
  const beside = path.join(path.dirname(app.getPath('exe')), 'user-data');
  try {
    fs.mkdirSync(beside, { recursive: true });
    const probe = path.join(beside, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    return beside;
  } catch {
    return app.getPath('userData');
  }
}

/**
 * Key / 接口地址的来源，按优先级：
 *   1. user-data/.env            玩家自己放的那份（推荐；发布包里只有这一条路能带 Key）
 *   2. 工程目录里的 .env          只在开发者本地存在 —— **发布包里故意不含**（见 build.mjs 的硬断言）
 *   3. 工程目录里的 .env.example  模板：Key 为空，界面会明确提示"未配置 Key"，不会编造内容
 * 三条都不动游戏目录，重装 / 换包不会互相覆盖。
 */
function pickEnvFile(stateDir) {
  const userEnv = path.join(stateDir, '.env');
  if (fs.existsSync(userEnv)) return userEnv;
  const bundled = path.join(GAME_DIR, '.env');
  if (fs.existsSync(bundled)) return bundled;
  const example = path.join(GAME_DIR, '.env.example');
  return fs.existsSync(example) ? example : bundled;
}

// ────────────────────────── 杂项 ──────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 把主进程的 console 同时写进 user-data/启动日志.txt —— 打包后没有黑窗口，出问题只能靠它 */
function teeConsole(file) {
  let stream;
  try {
    stream = fs.createWriteStream(file, { flags: 'a' });
  } catch {
    return;
  }
  const fmt = (v) => {
    if (v instanceof Error) return v.stack || v.message;
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };
  for (const level of ['log', 'info', 'warn', 'error']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      try {
        stream.write(`[${new Date().toISOString()}] [${level}] ${args.map(fmt).join(' ')}\n`);
      } catch { /* 写日志失败绝不影响玩 */ }
    };
  }
}

async function fatal(title, err) {
  const msg = err && err.stack ? err.stack : String(err);
  try { console.error(`[shell] ${title}：${msg}`); } catch { /* ignore */ }
  try {
    await app.whenReady();
    dialog.showErrorBox(title, msg);
  } catch { /* ignore */ }
  app.exit(1);
}
