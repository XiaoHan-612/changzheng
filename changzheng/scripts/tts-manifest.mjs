// 由 data/tts-lines.json 生成 docs/TTS-MANIFEST.md：
// 音频模型只需照表产出 wav，文件名与哈希保持一致即可被 /api/tts 命中。
// 用法：node scripts/tts-manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashName } from './lib/tts-hash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'data', 'tts-lines.json');
const OUT = path.join(ROOT, 'docs', 'TTS-MANIFEST.md');
const CACHE = path.join(ROOT, 'public', 'audio', 'cache');

export { hashName };

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const lines = data.lines || [];
const rows = lines.map((l) => {
  const file = hashName(l.text, l.voiceId);
  const done = fs.existsSync(path.join(CACHE, file)) ? '✅ 已就位' : '⬜ 待生成';
  return `| ${l.id} | ${l.actor} | ${l.voiceId} | ${l.when} | ${l.text} | \`${file}\` | ${done} |`;
});

const md = [
  '# 语音（TTS）清单',
  '',
  '> 由 `node scripts/tts-manifest.mjs` 生成。把 wav 放进 `public/audio/cache/`，**文件名必须与最后一列一致**，`/api/tts` 会自动命中；没命中就静默降级，不阻塞流程。',
  '',
  `- 台词条数：**${lines.length}**`,
  `- 已就位：**${rows.filter((r) => r.includes('已就位')).length}**`,
  '- 生成规则：`sha1(voiceId + "|" + text)` 取前 16 位，拼 `_<voiceId>.wav`',
  '- 采样：单声道 wav，16k/22.05kHz，≤80 字，静音裁掉首尾',
  '',
  '| id | 说话人 | voiceId | 场景 | 文本 | 文件名 | 状态 |',
  '|---|---|---|---|---|---|---|',
  ...rows,
  '',
  '## 音色建议（与策划案 §2.6.3 一致）',
  '',
  '| 角色 | 音色气质 | voiceId |',
  '|---|---|---|',
  '| 旁白 / 史实回响 | 克制、像翻史书，中性 | narr |',
  '| 老班长 | 低、慢、少话有力 | laoban |',
  '| 指导员 | 讲理、耐心 | zhiyuan |',
  '| 红小鬼 | 倔、快、心软，少年声 | xiaogui |',
  '| 卫生员 | 轻、稳 | weisheng |',
  '| 哨兵 | 压着嗓子、警觉 | sentry |',
  '| 突击队长 | 短促、有劲 | captain |',
  '| 船工 / 老乡 | 热、土、谨慎（可带轻微方言） | guide |',
  '| 宣传员 | 清亮、不喊口号 | drummer |',
  '',
  '## 环境床（ogg，15–30s 可循环）',
  '',
  '| 场景 | 文件 | 说明 |',
  '|---|---|---|',
  '| 于都河夜 | `public/audio/ambient/depart_river.ogg` | 河水 + 夜虫 |',
  '| 湘江 | `public/audio/ambient/xiangjiang_wind.ogg` | 远炮闷响 + 风 + 江水 |',
  '| 遵义雨夜 | `public/audio/ambient/zunyi_rain.ogg` | 雨声 + 室内静 |',
  '| 金沙江 | `public/audio/ambient/jinsha_rapids.ogg` | 急流 |',
  '| 泸定桥 | `public/audio/ambient/luding_iron.ogg` | 铁索风 + 对岸火力余响 |',
  '| 雪山 | `public/audio/ambient/snow_wind.ogg` | 雪风 |',
  '| 草地营火 | `public/audio/ambient/grass_fire.ogg` | 风 + 火 |',
  '| 会宁 | `public/audio/ambient/huining_low.ogg` | 低人流嘈杂 + 远号 |',
  '',
  '> 目前环境床由 WebAudio 实时合成兜底（`public/js/audio.js`）；ogg 到位后按上表放入即可替换。',
  '',
].join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md, 'utf8');
console.log(`已写出 ${path.relative(ROOT, OUT)}：${lines.length} 条台词`);
