// TTS 缓存命名的**唯一实现**（脚本侧）：`sha1(音色|文本)` 前 16 位 + '_' + 音色 + '.wav'。
//
// 为什么单独一个文件：这套算法原先在四处各写一遍（server/index.js、scripts/tts-manifest.mjs、
// scripts/check-tts.mjs、scripts/check-audio.mjs），"没指定音色时算哪个 id"还一度写成两个值
// ——前端回落的 'narr' 与服务端默认的 'default' 不同，同一个算法算出两个文件名，缓存永远命中不了
// （见 docs/HANDOFF-CODE.md 坑 49）。脚本侧现在共用这一份；服务端那一份在 server/index.js，
// `npm run qa:audio` 会核对它的默认值与前端 `DEFAULT_VOICE` 一致。
import crypto from 'node:crypto';

/** 服务端 /api/tts 与前端的默认音色（三处必须是一个值，qa:audio 会核对） */
export const DEFAULT_VOICE = 'default';

/** 音色清洗：中文角色名会被清空 → 回落默认（踩过：中文名哈希对不上） */
export function normalizeVoice(voiceId) {
  const v = String(voiceId || '').replace(/[^\w-]/g, '');
  return v || DEFAULT_VOICE;
}

/** 文本 + 音色 → 缓存文件名 */
export function hashName(text, voiceId) {
  const voice = normalizeVoice(voiceId);
  const hash = crypto.createHash('sha1').update(`${voice}|${text}`).digest('hex').slice(0, 16);
  return `${hash}_${voice}.wav`;
}
