#!/usr/bin/env node
/**
 * 把已打好的便携版目录，再压成**一个 exe**。
 *
 *   dist/长征-抉择-单文件版.exe
 *
 * 做法：用 Windows 自带的 C# 编译器（.NET Framework 4.x 的 csc.exe，Win10/11 必有）
 * 编一个 ~20 KB 的启动器，然后把游戏数据的 zip 追在它后面，最后写 16 字节尾巴
 * （magic + 载荷偏移）。没有引入任何第三方打包器，也不需要 7-Zip / NSIS / Inno。
 *
 * 为什么不直接把整个目录塞进 exe 就完事：Chromium 必须从磁盘上的真实文件加载，
 * 所以 exe 只能是「一个文件去分发」，运行时仍要在硬盘上有一份 —— 启动器负责展开这一次，
 * 并且记住版本戳，之后每次双击都是直接拉起游戏，不再解包。
 *
 * 用法：node build-singlefile.mjs   （会先确保 dist/长征-抉择 存在，不存在就先跑 build.mjs）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeIcoBmp } from './make-icon.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const APP_NAME = '长征-抉择';
const PORTABLE = path.join(REPO, 'dist', APP_NAME);
const WORK = path.join(HERE, '.singlefile');
const OUT = path.join(REPO, 'dist', `${APP_NAME}-单文件版.exe`);

const log = (...a) => console.log('·', ...a);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

main().catch((err) => {
  console.error('\n单文件打包失败：', err && err.message ? err.message : err);
  process.exit(1);
});

async function main() {
  console.log(`\n打成单文件 → ${OUT}\n`);

  if (!fs.existsSync(path.join(PORTABLE, `${APP_NAME}.exe`))) {
    throw new Error(`还没打便携版目录：${PORTABLE}\n先执行 node build.mjs`);
  }
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });

  const zip = makePayload();
  const stamp = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex').slice(0, 16);
  log(`数据指纹 ${stamp}`);

  const icon = path.join(WORK, 'exe-icon.ico');
  fs.writeFileSync(icon, makeIcoBmp([16, 32, 48, 256]));
  const launcher = compileLauncher(stamp, icon);

  // 拼接：启动器 + 数据 + [magic 8][偏移 8]
  const trailer = Buffer.alloc(16);
  trailer.write('CZPK1END', 0, 'ascii');
  trailer.writeBigInt64LE(BigInt(fs.statSync(launcher).size), 8);
  fs.writeFileSync(OUT, Buffer.concat([
    fs.readFileSync(launcher),
    fs.readFileSync(zip),
    trailer,
  ]));

  const size = fs.statSync(OUT).size;
  console.log(`\n完成：${OUT}`);
  console.log(`  单文件 ${mb(size)}（启动器 ${(fs.statSync(launcher).size / 1024).toFixed(0)} KB + 数据 ${mb(fs.statSync(zip).size)}）`);
  console.log('  首次双击：展开到 %LOCALAPPDATA%\\长征-抉择\\ app\\（带进度条），之后每次双击直接开游戏\n');
}

/** 把便携版目录原样压成一个 zip（保留顶层目录名，启动器会剥掉） */
function makePayload() {
  const zip = path.join(WORK, 'payload.zip');
  log('压缩游戏数据…');
  // --options zip:hdrcharset=UTF-8 不能省：Windows 自带 bsdtar 默认按系统代码页（简体中文是 GBK）
  // 写文件名且不打 UTF-8 标记，.NET 的 ZipArchive 会读成乱码 → 顶层目录剥不掉、找不到 exe。
  // （实测过一次：展开出来的目录名全是 U+FFFD，启动器对话框报「没找到 长征-抉择.exe」。）
  execFileSync('tar', ['-a', '--options', 'zip:hdrcharset=UTF-8', '-c', '-f', zip, '-C', path.join(REPO, 'dist'), APP_NAME], { stdio: 'inherit' });
  if (!fs.existsSync(zip)) throw new Error('压缩失败：没生成 payload.zip');
  assertZipNamesUtf8(zip);
  return zip;
}

/** 复查 zip 里的文件名确实带 UTF-8 标记（跑在压缩之后，防"这次环境不同又写回 GBK"） */
function assertZipNamesUtf8(zip) {
  const buf = fs.readFileSync(zip);
  const i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (i < 0) throw new Error('payload.zip 里找不到第一个本地文件头');
  const flag = buf.readUInt16LE(i + 6);
  const nlen = buf.readUInt16LE(i + 26);
  const name = buf.subarray(i + 30, i + 30 + nlen).toString('utf8');
  if (!(flag & 0x800) || !name.startsWith(`${APP_NAME}/`)) {
    throw new Error(`payload.zip 的文件名编码不对（flag=0x${flag.toString(16)}，第一个条目=${JSON.stringify(name)}）：`
      + '需要 UTF-8 标记，否则展开后会乱码、找不到 exe');
  }
  log(`zip 文件名编码复查通过（第一个条目：${name}）`);
}

function compileLauncher(stamp, icon) {
  const fw = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319',
  ].find((d) => fs.existsSync(path.join(d, 'csc.exe')));
  if (!fw) throw new Error('找不到 csc.exe（Windows 自带的 C# 编译器）。Win10/11 一定有，若真没有请装 .NET Framework 4.x');

  const src = path.join(WORK, 'launcher.cs');
  const code = fs.readFileSync(path.join(HERE, 'launcher.cs'), 'utf8')
    .replace('@@BUILD_STAMP@@', stamp);
  // csc 不带 BOM 时按系统代码页读源码，中文会变乱码；显式给 UTF-8 它就懂了
  fs.writeFileSync(src, '\uFEFF' + code, 'utf8');

  const exe = path.join(WORK, 'launcher.exe');
  log('编译启动器（csc.exe，本机自带，不下载任何东西）…');
  execFileSync(path.join(fw, 'csc.exe'), [
    '/nologo',
    '/target:winexe',          // 不要黑窗口
    '/optimize+',
    '/codepage:65001',
    `/win32icon:${icon}`,
    `/out:${exe}`,
    `/r:${path.join(fw, 'System.dll')}`,
    `/r:${path.join(fw, 'System.IO.Compression.dll')}`,
    `/r:${path.join(fw, 'System.IO.Compression.FileSystem.dll')}`,
    `/r:${path.join(fw, 'System.Windows.Forms.dll')}`,
    `/r:${path.join(fw, 'System.Drawing.dll')}`,
    src,
  ], { stdio: 'inherit' });

  if (!fs.existsSync(exe)) throw new Error('编译没有产出 launcher.exe');
  return exe;
}
