// 终局升华的诗：把 data/poem.json 渲染成给音频模型的对照表（docs/POEM-TTS.md）。
//
// 与 tts:manifest 是同一套思路（文本 + 文件名一一对应，放对文件名就自动命中），区别只有一个：
// 诗的音频**没有文件也必须能演**（缺音频时按 poem.json 的 pace 逐字走），所以诗不进
// data/tts-lines.json——那张清单的口径是"声明了就必须在"，诗属于"有就好、没有照走"。
//
// 用法：node scripts/poem-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashName } from './lib/tts-hash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'poem.json');
const OUT = path.join(ROOT, 'docs', 'POEM-TTS.md');
const CACHE = path.join(ROOT, 'public', 'audio', 'cache');
const POEM_DIR = path.join(ROOT, 'public', 'audio', 'poem');

const poem = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const voice = poem.audio?.voiceId || 'narr';
const lines = poem.lines || [];

/** 整段录音（可选）：public/audio/poem/ 里除说明外的一切音频 */
const whole = fs.existsSync(POEM_DIR)
  ? fs.readdirSync(POEM_DIR).filter((f) => /\.(ogg|wav|mp3)$/i.test(f))
  : [];

const rows = lines.map((l) => {
  const file = hashName(l.text, voice);
  const done = fs.existsSync(path.join(CACHE, file)) ? '✅ 已就位' : '⬜ 待生成';
  const span = (l.startMs != null && l.endMs != null) ? `${(l.startMs / 1000).toFixed(1)}–${(l.endMs / 1000).toFixed(1)}s` : '—';
  return `| poem_${l.i} | 第 ${l.pair} 联 | ${l.text}${l.punct} | \`${file}\` | ${span} | ${done} |`;
});

const positioned = lines.filter((l) => l.startMs != null && l.endMs != null).length;

const md = [
  '# 终局升华 · 诗与落款（音频对照表）',
  '',
  '> 由 `node scripts/poem-manifest.mjs` 生成。诗与落款的唯一真源是 `data/poem.json`（屏幕字幕、逐字、配音都读它）。',
  '',
  `## ${poem.title} · ${poem.author}（${poem.written}）`,
  '',
  `出处：${poem.source}`,
  '',
  `- 句数：**${lines.length}**（每句 ${lines[0]?.text.length ?? 0} 字，两句一联）`,
  `- 逐句配音音色：**${voice}**（文件名 = sha1(voiceId + "|" + 文本) 前 16 位 + \`_${voice}.wav\`）`,
  `- 已就位：**${rows.filter((r) => r.includes('已就位')).length} / ${rows.length}**`,
  `- 整段录音：**${whole.length ? whole.join('、') : '无'}**（放 \`public/audio/poem/\`，再把 poem.json 的 \`audio.full\` 填上）`,
  `- 时间轴已标：**${positioned} / ${lines.length}** 句（整段录音路线必须有；逐句路线可留空）`,
  '',
  '## 逐句配音（推荐：与现有 TTS 产线同一条路）',
  '',
  '产出的 wav 放进 `public/audio/cache/`，**文件名必须与下表一致**，`/api/tts` 会自动命中；',
  '没命中就静默降级——逐字改按 `poem.json` 的 `pace` 走，流程不阻塞。',
  '',
  '| id | 位置 | 文本 | 文件名 | 时间轴 | 状态 |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
  '规格：单声道 wav，16k/22.05kHz，静音裁掉首尾；一句一个文件（不要连读，句间停顿交给屏幕）。',
  '语气：**克制、不喊口号**——与史实回响同一档（见策划案 §2.6 的混音口径）。',
  '',
  '## 整段录音（可选：一段真正的朗诵）',
  '',
  '1. 把录音放进 `public/audio/poem/`（该目录**不入库**：`.gitignore` 里挡着，别人录的音频不进公开历史）；',
  '2. 在 `data/poem.json` 的 `audio.full` 填文件名，并按录音给每句标 `startMs` / `endMs`；',
  '3. 逐字就会跟着录音的已播毫秒走（`voice:progress` 那一路），逐句配音那一路自动让位。',
  '',
  '走这条路时 `npm run qa:audio` 会核对"放进来的文件有没有被 `audio.full` 指到"，漏填会红。',
  '',
  `落款：**${poem.seal?.line || ''}** · ${poem.seal?.note || ''}`,
  '',
].join('\n');

fs.writeFileSync(OUT, md, 'utf8');
console.log(`诗：${poem.title} · ${lines.length} 句 · 逐句配音已就位 ${rows.filter((r) => r.includes('已就位')).length}/${rows.length}`
  + ` · 整段录音 ${whole.length ? whole.length + ' 个' : '无'}`);
console.log(`对照表：docs/POEM-TTS.md`);
