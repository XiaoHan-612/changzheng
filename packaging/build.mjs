#!/usr/bin/env node
/**
 * 组装「双击即玩」的便携版软件。
 *
 * 产物：
 *   changzheng/dist/长征-抉择/
 *     长征-抉择.exe            ← Electron 运行时（改个名就是它自己的软件）
 *     *.dll / *.pak / locales/  ← Chromium 运行时，全部自带，不依赖系统装了什么浏览器
 *     resources/app/            ← 外壳 + **原样照搬**的游戏工程
 *       main.js   package.json   icon.png
 *       changzheng/{server,public,data,.env.example,package.json,node_modules}
 *     user-data/                ← 首次运行后在这里写配置与日志（绿色版，删掉即恢复出厂）
 *     使用说明.txt
 *
 * **Key 一律不随包**：本机 changzheng/.env 装着真 Key，打包时**故意不拷**（见 copyGame 末尾的硬断言）。
 * 玩家第一次打开在游戏内「设置」里填自己的 Key，或往 user-data/.env 放一份；界面上会明确提示。
 *
 * 原则：**一行游戏代码都不改**。原工程本来就是「Express 起服务 + 静态前端」，
 * 这里做的只是给它配一个自带 Chromium 的窗口和一份可写的 user-data。
 *
 * 用法：node build.mjs       （首次会自动下载 Electron 运行时到 packaging/electron-dist）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { makeIco, encodePng, renderIcon } from './make-icon.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const GAME = path.join(REPO, 'changzheng');
const DIST = path.join(HERE, 'electron-dist');
const CACHE = path.join(HERE, '.electron-cache');
const APP_NAME = '长征-抉择';
const OUT = path.join(REPO, 'dist', APP_NAME);
const RES_APP = path.join(OUT, 'resources', 'app');
const MIRROR = process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/';
// 固定版本，保证每次打出来的包一致；换版本就改这里（或临时用 ELECTRON_VERSION=... 覆盖）
const ELECTRON_VERSION = process.env.ELECTRON_VERSION || '44.4.3';

const log = (...a) => console.log('·', ...a);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

main().catch((err) => {
  console.error('\n构建失败：', err && err.message ? err.message : err);
  process.exit(1);
});

async function main() {
  console.log(`\n打包《星火微光·我路过他们的长征》→ ${OUT}\n`);

  checkGame();
  await ensureElectronDist();
  clean();
  copyRuntime();
  copyGame();
  copyShell();
  writeReadme();
  report();
}

// ────────────────────────── 检查 / 取运行时 ──────────────────────────

function checkGame() {
  const need = ['server/index.js', 'public/index.html', 'data/acts.json'];
  for (const rel of need) {
    if (!fs.existsSync(path.join(GAME, rel))) {
      throw new Error(`游戏工程缺文件：changzheng/${rel}（打包前请确认工程完整）`);
    }
  }
  // .env 是 gitignore 的本机文件（装着真 Key）——**故意不进包**，所以这里只做说明，不作为错误。
  if (fs.existsSync(path.join(GAME, '.env'))) {
    log('本机 changzheng/.env 存在（源码态用），打包会跳过它：发布包里不含任何 Key');
  } else {
    log('本机 changzheng/.env 不存在；打包本来也不带 Key');
  }
  log('游戏工程自检通过（server / public / data 都在）');
}

async function ensureElectronDist() {
  if (fs.existsSync(path.join(DIST, 'electron.exe'))) {
    log(`Electron ${ELECTRON_VERSION} 运行时已就绪（packaging/electron-dist）`);
    return;
  }
  const zip = path.join(CACHE, `electron-v${ELECTRON_VERSION}-win32-x64.zip`);
  fs.mkdirSync(CACHE, { recursive: true });
  if (!fs.existsSync(zip)) {
    const url = `${MIRROR}v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip`;
    log(`下载 Electron ${ELECTRON_VERSION}：${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}（可设 ELECTRON_MIRROR 换镜像）`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
  }
  log(`解压 Electron 运行时（${mb(fs.statSync(zip).size)}）…`);
  fs.mkdirSync(DIST, { recursive: true });
  // Windows 自带 bsdtar，能直接解 zip；不引第三方解压库
  execFileSync('tar', ['-xf', zip, '-C', DIST], { stdio: 'inherit' });
  if (!fs.existsSync(path.join(DIST, 'electron.exe'))) {
    throw new Error('解压后没看到 electron.exe，压缩包可能不完整：删掉 packaging/.electron-cache 重试');
  }
}

// ────────────────────────── 组装 ──────────────────────────

function clean() {
  if (fs.existsSync(OUT)) {
    log('清掉上一次的产物…');
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT, { recursive: true });
}

function copyRuntime() {
  log('复制 Chromium 运行时…');
  fs.cpSync(DIST, OUT, { recursive: true });
  // 改名即成品：Windows 任务栏、任务管理器里显示的就是这个名字
  fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, `${APP_NAME}.exe`));
  // 留着 default_app.asar 会让「没找到 app 目录」的情形静默打开 Electron 欢迎页，删掉更干净
  fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });
}

function copyGame() {
  log('复制游戏工程（原样，不改一行代码）…');
  fs.mkdirSync(RES_APP, { recursive: true });
  const items = [
    'server', 'public', 'data',
    'package.json',            // 有 "type": "module"，服务端 ESM 靠它
    // ⚠️ 这里**故意不拷 `.env`**：它装着本机真 Key，进包就是对外泄露（无论发给谁、上传到哪）。
    //    Key 的唯一来源是玩家自己在「设置」里填（落到 user-data/runtime-config.json）
    //    或自己往 user-data/.env 放一份。下面的硬断言会兜住任何"手滑加回来"。
    '.env.example',            // 模板（GLM_API_KEY 为空），给玩家照着填
  ];
  for (const item of items) {
    const src = path.join(GAME, item);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(RES_APP, 'changzheng', item), { recursive: true });
  }
  // 硬断言：包内绝不允许出现 .env（含 Key）。宁可打包失败，也不出去一份带 Key 的成品。
  const leaked = path.join(RES_APP, 'changzheng', '.env');
  if (fs.existsSync(leaked)) {
    throw new Error('包里出现了 .env —— 这会把本机 Key 一起发出去，已中止。请检查 copyGame 的 items 列表');
  }

  // 运行时依赖只留 express 那一棵树；playwright 是测试用的，进包纯属浪费体积
  log('复制运行时依赖 node_modules（去掉 playwright）…');
  const skip = new Set(['playwright', 'playwright-core', '.bin']);
  fs.cpSync(path.join(GAME, 'node_modules'), path.join(RES_APP, 'changzheng', 'node_modules'), {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(path.join(GAME, 'node_modules'), src);
      if (!rel) return true;
      if (skip.has(rel.split(path.sep)[0])) return false;
      if (rel === '.package-lock.json') return false;
      return true;
    },
  });
  if (!fs.existsSync(path.join(RES_APP, 'changzheng', 'node_modules', 'express'))) {
    throw new Error('依赖复制后没看到 express —— 检查 changzheng/node_modules 是否完整');
  }
}

function copyShell() {
  log('放入桌面外壳…');
  fs.copyFileSync(path.join(HERE, 'main.js'), path.join(RES_APP, 'main.js'));
  fs.copyFileSync(path.join(HERE, 'app-package.json'), path.join(RES_APP, 'package.json'));

  // 图标：项目里没有现成 logo，代码画一颗红星（窗口/任务栏用它）
  const png = encodePng(256, 256, renderIcon(256));
  fs.writeFileSync(path.join(RES_APP, 'icon.png'), png);
  fs.writeFileSync(path.join(OUT, `${APP_NAME}.ico`), makeIco());
  log('生成应用图标（红星）');

  // user-data 预建一个，让「日志/配置在哪」一眼可见
  const userData = path.join(OUT, 'user-data');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, '说明.txt'),
    '这个文件夹是游戏运行时自己用的，删掉会自动重建：\r\n'
    + '  runtime-config.json     设置页里填的 Key / 模型 / 接口地址（推荐走设置页，写在这里）\r\n'
    + '  .env                    也可以：新建一个 .env，写 GLM_API_KEY=你的Key（二选一即可）\r\n'
    + '  logs\\ai-calls-*.jsonl   每次 AI 裁决的 JSONL 审计日志（含响应、耗时、来源）\r\n'
    + '  logs\\session-full.jsonl 本次会话全量日志\r\n'
    + '  启动日志.txt            外壳启动过程（排障用）\r\n'
    + '\r\n本包不含任何 API Key：没填之前 AI 裁决会明确报错（不会编造内容），请先填自己的 Key。\r\n', 'utf8');
}

function writeReadme() {
  const text = `《星火微光 · 我路过他们的长征》 桌面版
============================================================
双击「${APP_NAME}.exe」即可。不需要装 Node、不需要装浏览器、不需要联网装依赖。

第一次打开会先闪一下启动画面（约 1～2 秒），然后进入标题页。
关卡里的 AI 裁决是**真调**线上大模型，所以每次点击要等 1～15 秒，
这是正常的，不是卡死；界面会显示「正在裁决」。

界面操作
------------------------------------------------------------
  F11                  全屏 / 退出全屏
  F12 或 Ctrl+Shift+I  打开调试面板（普通玩不需要）
  关闭窗口             直接退出游戏

API Key（第一次打开必须填，本包不含 Key）
------------------------------------------------------------
本软件包**不含任何 API Key**（游戏没有 MOCK 兜底，未配置时调用会明确报错，不会编造内容）。
请用你自己的 Key，两个办法任选：
  1.（推荐）游戏内「设置」页填 Key → 点「测试连通」确认能通 → 保存
     它会写进 user-data/runtime-config.json，不动游戏目录；
  2. 在 user-data 里新建一个 .env，写 GLM_API_KEY=你的Key（一行就行）。
接口地址与模型名默认已配好（见 resources/app/changzheng/.env.example）；
只有换成别的网关时才需要在「设置」里改地址。

日志与审计
------------------------------------------------------------
每次 AI 裁决都会落 JSONL，位置：user-data/logs/
  ai-calls-YYYY-MM-DD.jsonl   当天所有调用
  session-full.jsonl          本次会话全量
删掉 user-data 整个文件夹 = 恢复出厂设置（配置与日志一起清空）。

常见问题
------------------------------------------------------------
Q: Windows 提示「已保护你的电脑」/「未知发布者」怎么办？
A: 这是没有代码签名证书的自制程序的正常提示。点「更多信息」→「仍要运行」即可。
   发给别人时，让对方也照这个点一下。

Q: 提示连不上模型 / 调用失败？
A: 先确认网络能通到网关（有些会场网络会挡），再进「设置」点「测试连通」看具体报错。
   报错原因会显示在界面上，也会记进 user-data/logs/。

Q: 没有声音？
A: 右上角有静音开关；再确认系统音量与输出设备。游戏内音频都是随包自带的本地文件。

Q: 想挪到别的电脑？
A: 整个「${APP_NAME}」文件夹拷过去就行（含 user-data），不需要安装。
   注意 user-data 里存着 Key，别把整个文件夹发到公开地方。

Q: 想改游戏内容？
A: 本目录里的 resources/app/changzheng 就是原工程（server / public / data），
   和仓库里那份一致，改完重启软件即可生效。
`;
  fs.writeFileSync(path.join(OUT, '使用说明.txt'), text, 'utf8');
}

function report() {
  let files = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else { files += 1; bytes += fs.statSync(p).size; }
    }
  };
  walk(OUT);
  console.log(`\n完成：${OUT}`);
  console.log(`  ${files} 个文件 · ${mb(bytes)}`);
  console.log(`  双击 ${APP_NAME}.exe 就能玩\n`);
}
