// 便携包构建器：把工程打成一个「解压即玩」的文件夹（见 docs/DELIVERY.md 方案 A）。
//
// 用法：node tools/build-portable.mjs [输出目录]
//   默认输出：<仓库上一级>/星火微光·我路过他们的长征/
//
// 产物结构（扁平，双击 启动游戏.bat 就跑）：
//   node.exe            便携运行时（从本机 Node 复制，接收方不需要装 Node）
//   启动游戏.bat         双击入口
//   使用说明.txt         给玩家/评委看的一页说明
//   launcher.mjs        起服务 + 探测真实端口 + 开浏览器（**只在便携包里存在**，不改应用代码）
//   runtime-config.json 预置 Key / 网关 / 模型（零配置；明文，见使用说明的红字）
//   server/ public/ data/ scripts/ tools/ docs/  应用本体（scripts/tools 留作现场排查）
//   node_modules/       只有生产依赖（express），不含 playwright
//
// 为什么用脚本而不是手拷：这条产线要能重跑（素材/代码一改就再打一次），
// 而且"哪些文件进包"这件事必须有唯一真源——手拷最容易漏 public/fonts 或 logs/sample。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 默认落在**桌面上**：产物是给"发给别人"用的独立文件夹，不该塞进任何一个 git 仓库里
// （125MB 的二进制挨着源码，下次 git status 会被它刷屏）。要换位置就传第二个参数。
const DESKTOP = path.join(os.homedir(), 'Desktop');
const DEFAULT_OUT = path.join(fs.existsSync(DESKTOP) ? DESKTOP : path.resolve(ROOT, '..', '..'),
  '星火微光·我路过他们的长征');
const OUT = path.resolve(process.argv[2] || DEFAULT_OUT);
const MARK = '.portable-build';                   // 产物标记：没有它不敢删目录（避免误删别人的文件夹）

const log = (...a) => console.log(...a);
const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';

function sizeOf(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { total += fs.statSync(p).size; } catch { /* 跳过读不到的 */ } }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return total;
}

/* ── 0. 安全检查：只清空"自己上次产的"目录 ── */
if (fs.existsSync(OUT)) {
  const entries = fs.readdirSync(OUT);
  if (entries.length && !entries.includes(MARK)) {
    console.error(`✗ 输出目录已存在且不是本工具产的：${OUT}\n  里面有：${entries.slice(0, 6).join('、')}…\n  换个目录（第二个参数），或先手工清空。`);
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

/* ── 1. 应用本体 ── */
const COPY = ['server', 'public', 'data', 'scripts', 'tools', 'docs'];
for (const d of COPY) {
  const from = path.join(ROOT, d);
  if (!fs.existsSync(from)) { console.error(`✗ 缺目录：${d}`); process.exit(1); }
  fs.cpSync(from, path.join(OUT, d), { recursive: true });
}
// 日志目录：只带"说明 + 一份真实全程样本"（运行日志是产物，不进包）
fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
for (const f of ['README.md', 'sample-full-run.jsonl']) {
  const from = path.join(ROOT, 'logs', f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT, 'logs', f));
}

/* ── 2. package.json：去掉 devDependencies（playwright 只在开发机用得上） ── */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const portablePkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: pkg.type,
  description: pkg.description,
  dependencies: pkg.dependencies,
  scripts: { start: 'node server/index.js' },
};
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(portablePkg, null, 2) + '\n', 'utf8');

/* ── 3. 生产依赖：优先 npm 装（干净），装不上就从本机 node_modules 里挑 ── */
log('· 安装生产依赖（express）…');
let depHow = 'npm install --omit=dev';
try {
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: OUT, stdio: 'pipe', shell: process.platform === 'win32', timeout: 180000,
  });
} catch (err) {
  log('  npm 装不上（离线？），改为从本机 node_modules 复制…');
  depHow = '从本机 node_modules 复制';
  const src = path.join(ROOT, 'node_modules');
  const dst = path.join(OUT, 'node_modules');
  fs.mkdirSync(dst, { recursive: true });
  // express 的传递依赖：直接问 npm ls 会依赖 npm；这里按 express 的实际依赖树复制
  const deps = JSON.parse(execFileSync('node', ['-e',
    "const p=require('express/package.json');console.log(JSON.stringify(Object.keys(p.dependencies)))",
  ], { cwd: ROOT }).toString());
  const seen = new Set();
  const copyDep = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const from = path.join(src, name);
    if (!fs.existsSync(from)) return;
    fs.cpSync(from, path.join(dst, name), { recursive: true });
    const dj = path.join(from, 'package.json');
    if (!fs.existsSync(dj)) return;
    const d = JSON.parse(fs.readFileSync(dj, 'utf8'));
    for (const n of Object.keys(d.dependencies || {})) copyDep(n);
  };
  copyDep('express');
  log(`  已复制 ${seen.size} 个包`);
}

/* ── 4. 便携运行时：node.exe（+ 许可声明） ── */
const NODE = process.execPath;
if (!/node(\.exe)?$/i.test(NODE)) { console.error(`✗ 找不到 node 可执行文件：${NODE}`); process.exit(1); }
fs.copyFileSync(NODE, path.join(OUT, 'node.exe'));
fs.writeFileSync(path.join(OUT, 'LICENSE-node.txt'), `本目录下的 node.exe 是 Node.js 运行时的未修改副本（${process.version}）。
Node.js 采用 MIT 许可，原文如下（取自官方 LICENSE）：

Copyright Node.js contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
`, 'utf8');

/* ── 5. 预置配置（零配置就能玩）：Key / 网关 / 模型照抄本机那一份 ── */
const rtSrc = path.join(ROOT, 'runtime-config.json');
let preset = null;
if (fs.existsSync(rtSrc)) {
  preset = JSON.parse(fs.readFileSync(rtSrc, 'utf8'));
  fs.writeFileSync(path.join(OUT, 'runtime-config.json'), JSON.stringify(preset, null, 2) + '\n', 'utf8');
}
// 环境变量兜底：runtime-config 没有 Key 时，从 .env 里搬（不打印任何值）
if (!preset?.GLM_API_KEY && fs.existsSync(path.join(ROOT, '.env'))) {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i > 0) env[s.slice(0, i)] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  if (env.GLM_API_KEY) {
    fs.writeFileSync(path.join(OUT, 'runtime-config.json'), JSON.stringify({
      GLM_API_KEY: env.GLM_API_KEY,
      GLM_API_URL: env.GLM_API_URL || '',
      GLM_MODEL: env.GLM_MODEL || 'glm-5.1',
      GLM_REASONING_EFFORT: env.GLM_REASONING_EFFORT || 'low',
    }, null, 2) + '\n', 'utf8');
  }
}
const hasKey = fs.existsSync(path.join(OUT, 'runtime-config.json'));

/* ── 6. 启动器与说明（模板写在构建器里：改口径只改一处） ── */
fs.writeFileSync(path.join(OUT, 'launcher.mjs'), launcherJs(), 'utf8');
fs.writeFileSync(path.join(OUT, '启动游戏.bat'), bat(), 'utf8');
fs.writeFileSync(path.join(OUT, '启动游戏（无窗口）.vbs'), vbs(), 'utf8');
fs.writeFileSync(path.join(OUT, '使用说明.txt'), '﻿' + readme({ hasKey }), 'utf8');
fs.writeFileSync(path.join(OUT, MARK), new Date().toISOString() + '\n', 'utf8');

/* ── 7. 汇总 ── */
const appSize = ['server', 'public', 'data', 'scripts', 'tools', 'docs', 'logs', 'node_modules']
  .reduce((n, d) => n + sizeOf(path.join(OUT, d)), 0);
log('');
log('便携包已生成：');
log('  ' + OUT);
log(`  node.exe        ${mb(fs.statSync(path.join(OUT, 'node.exe')).size)}  (${process.version})`);
log(`  应用 + 依赖      ${mb(appSize)}  (依赖：${depHow})`);
log(`  预置配置        ${hasKey ? 'runtime-config.json（已带 Key，双击即玩）' : '⚠ 没有 Key —— 首次要在设置里填'}`);
log(`  合计            ${mb(sizeOf(OUT))}`);
log('');
log('自检：到输出目录双击「启动游戏.bat」，浏览器应自动打开；关掉黑窗口即退出。');

/* ══════════════ 模板 ══════════════ */

function bat() {
  // ⚠️ bat 里**不要写中文**：cmd 是按当前 OEM 代码页逐行解析这个文件的，
  //    文件若是 UTF-8，中文行会被撕成"不是内部或外部命令"（chcp 65001 救不了已经解析的那几行）。
  //    中文提示统一由 launcher.mjs（Node，UTF-8 输出）打印，这里只做三件事：
  //    切目录 → 起包内 node → 出错时停住让人看日志。
  return `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Changzheng - Xinghuo Weiguang
"%~dp0node.exe" "%~dp0launcher.mjs"
echo.
echo [Game exited] If there were errors above, please screenshot the last lines.
pause
`;
}

function vbs() {
  // 同上：VBS 由 Windows Script Host 按 ANSI 读取，脚本里不写中文
  return `' Silent launch: no console window, browser still opens.
' To quit: end node.exe in Task Manager.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run """node.exe"" ""launcher.mjs""", 0, False
`;
}

function launcherJs() {
  return `/**
 * 便携启动器：起服务 → 从输出里读出真实端口 → 用**独立应用窗口**打开（找不到浏览器才退回默认浏览器）。
 *
 * 为什么不改 server/index.js 让它自己开浏览器：那份代码开发机也在跑（测试、体检都起它），
 * "启动即开浏览器"是**便携外壳**的事，所以只放在这个只有便携包才有的文件里。
 * 端口由 server 自己选（3001 被占用会自动 +1），所以这里必须**读它打印的地址**，不能猜。
 *
 * 为什么优先应用窗口：这是"一个软件"的观感——没有地址栏、没有标签页，关掉窗口就是关掉游戏。
 * 用法是 Chromium 的 \`--app=<url>\` + 包内独立的 user-data-dir（\`app-profile/\`），
 * 因此不会碰到玩家自己浏览器的书签/登录态。Edge 是 Windows 自带，所以优先用它。
 * 环境变量：NO_OPEN=1 只起服务不开窗口（自动化验收用）；PLAY_WINDOW=0 强制用默认浏览器。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
console.log('星火微光 · 我路过他们的长征 —— 正在启动本地服务…');

const child = spawn(process.execPath, [path.join(DIR, 'server', 'index.js')], {
  cwd: DIR,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let opened = false;
const pipe = (buf, isErr) => {
  const s = String(buf);
  (isErr ? process.stderr : process.stdout).write(s);
  const m = s.match(/http:\\/\\/localhost:(\\d+)/);
  if (m && !opened) {
    opened = true;
    // NO_OPEN=1：只起服务不开浏览器（自动化验收/无头机器用；正常双击不会设这个）
    if (process.env.NO_OPEN === '1') console.log('（NO_OPEN=1：跳过打开浏览器） http://localhost:' + m[1]);
    else openBrowser('http://localhost:' + m[1]);
  }
};
child.stdout.on('data', (b) => pipe(b, false));
child.stderr.on('data', (b) => pipe(b, true));
child.on('exit', (code) => process.exit(code == null ? 0 : code));

const WIN_BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

/** 在独立的应用窗口里打开（像桌面软件那样）；找不到 Chromium 浏览器就返回 false */
function openAppWindow(url) {
  if (process.env.PLAY_WINDOW === '0') return false;
  const exe = WIN_BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) return false;
  const profile = path.join(DIR, 'app-profile');       // 包内独立配置：不碰玩家自己的浏览器
  try {
    const child = spawn(exe, [
      '--app=' + url,
      '--user-data-dir=' + profile,
      '--no-first-run', '--no-default-browser-check',
      '--disable-features=Translate', '--window-size=1366,850',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('（已用应用窗口打开：' + path.basename(exe) + '）');
    return true;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (openAppWindow(url)) return;
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    console.log('（已打开默认浏览器：' + url + '）');
  } catch {
    console.log('没能自动打开浏览器，请手动访问：' + url);
  }
}

// 关窗口 = 退出游戏（cmd 关掉时会送到这里，顺手带走子进程）
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { try { child.kill(); } catch { /* 已经退了 */ } process.exit(0); });
}
`;
}


function readme({ hasKey }) {
  return `星火微光 · 我路过他们的长征
=================================
五幕 AI 长征叙事游戏（赛道二 · 指定模型 智谱 GLM-5.1）
本包已自带运行环境，**接收方不需要安装 Node、数据库或任何依赖**。

一、怎么开始
---------------------------------
1. 解压到**可写目录**（桌面、D 盘都行；不要放进 C:\\Program Files —— 那里写不了日志与配置）。
2. 双击「启动游戏.bat」。
3. 等它自己打开浏览器（首次约 3–8 秒）。窗口里会打印地址，形如：
      地址: http://localhost:3001　（只监听 127.0.0.1）
   没自动弹出浏览器就手动复制这个地址打开。
4. 玩完关掉那个黑窗口即可退出。想不看见黑窗口，用「启动游戏（无窗口）.vbs」。

端口被占用时会自动换到 3002 / 3003…（最多试 10 个），**以窗口里打印的地址为准**。

二、配置（一般不用管）
---------------------------------
${hasKey
    ? '· 本包**已经预置好 Key 与网关**，双击即可玩，不用做任何设置。'
    : '· ⚠ 本包**没有预置 Key**：先在标题页「设置 → API Key」里填一个，点「测试连通」通过即可。'}
· 配置在 runtime-config.json（游戏内「设置」里改的就是它）。
· 想换自己的智谱 Key / 官方接口：设置 → API Key 填自己的，
  接口地址填 https://open.bigmodel.cn/api/paas/v4/chat/completions，点「测试连通」再「保存」。
· 模型固定为 glm-5.1（赛制指定）。

三、必须知道的三件事
---------------------------------
1. **要联网**。模型是实时真调（本项目没有离线/MOCK 模式）；断网时界面会明确报错并给「重试」，
   不会编造内容顶上。
2. **runtime-config.json 里是明文 Key**。只把本包发给可信的人；演示/评审结束后，
   建议到模型平台后台**轮换或删除**那把 Key（或直接把 runtime-config.json 删掉再发）。
3. 日志写在 logs/（按日一个 JSONL，记每次模型调用的输入输出与耗时，可审计）。
   想给评委看调用记录：游戏内顶栏「记录」，或直接打开 logs/ai-calls-<日期>.jsonl。

四、出问题先看这里
---------------------------------
· **双击没反应 / 提示"已阻止"**：这说明包是"从网上下载的"（Windows 会给压缩包打标记）。
  解决：右键 zip → 属性 → 勾"解除锁定" → 再解压；已经解压过的，右键 node.exe 与
  启动游戏（无窗口）.vbs 做同样操作，或整包拷到别的目录再试。
  杀毒软件误报 node.exe 也常见：把本文件夹加进白名单即可（node.exe 是官方运行时原样副本）。
· 提示「模型调用失败」→ 先确认能上网；再点「设置 → 测试连通」看具体报错；
  连续失败可把接口地址换成官方地址 + 自己的 Key（见第二节）。
· 页面空白 / 点了没反应 → 硬刷新（Ctrl+Shift+R）；仍不行换个浏览器（推荐 Edge / Chrome）。
· 想确认服务健康：浏览器访问 http://localhost:<窗口里的端口>/api/config，能返回 JSON 就是好的。
· 其他：docs/HANDOFF.md（交接与排查）、docs/DELIVERY.md（本包的封装口径）、
  docs/QA.md（验收命令）。scripts/ 里有现场排查脚本（如 check-glm.mjs 测网关连通性）。

五、这个包是怎么做出来的（要重做/更新时看）
---------------------------------
包里 tools/build-portable.mjs 就是打包脚本：在工程目录执行
    node tools/build-portable.mjs [输出目录]
它会重打一份（拷应用 → 装生产依赖 → 复制 node.exe 与预置配置 → 生成启动器与本说明）。
素材/代码更新后重新跑一遍即可，不要手工拷文件（容易漏 public/fonts 或 logs 样本）。

六、包里有什么
---------------------------------
node.exe             便携运行时（Node.js ${process.version}，MIT 许可见 LICENSE-node.txt）
启动游戏.bat          双击入口
launcher.mjs         启动器：起服务 + 读真实端口 + 开浏览器
runtime-config.json  预置配置（明文 Key）
server/ public/ data/ 服务端 / 前端与全部素材 / 五幕与史实数据
scripts/ tools/ docs/ 排查脚本与交接文档
logs/                运行日志（另附一份真实全程样本 sample-full-run.jsonl）
`;
}
