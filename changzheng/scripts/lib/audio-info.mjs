// 音频容器解析：给素材体检与音频体检共用，避免两份实现漂移。
// 只做"读头部"的轻量解析：够判断编码/采样/声道/时长与扩展名是否一致。

/** 读 WAV 头：{ codec:'wav', rate, channels, dur } */
export function wavInfo(buf) {
  if (buf.length < 12 || buf.slice(0, 4).toString() !== 'RIFF' || buf.slice(8, 12).toString() !== 'WAVE') return null;
  let off = 12;
  let fmt = null;
  let dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.slice(off, off + 4).toString('latin1');
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    }
    if (id === 'data') dataLen = size;
    off += 8 + size + (size % 2);
  }
  if (!fmt || !fmt.rate) return null;
  return {
    codec: 'wav',
    rate: fmt.rate,
    channels: fmt.channels,
    dur: dataLen / (fmt.rate * fmt.channels * (fmt.bits / 8)),
  };
}

/** 读 Ogg（Vorbis / Opus）头 */
export function oggInfo(buf) {
  if (buf.length < 4 || buf.slice(0, 4).toString() !== 'OggS') return null;
  const s = buf.toString('latin1');
  const isOpus = s.includes('OpusHead');
  const isVorbis = s.includes('\x01vorbis');
  if (!isOpus && !isVorbis) return null;
  let rate = 0;
  let channels = 0;
  let preskip = 0;
  if (isVorbis) {
    const i = s.indexOf('\x01vorbis');
    channels = buf[i + 11];
    rate = buf.readUInt32LE(i + 12);
  } else {
    const i = buf.indexOf('OpusHead');
    channels = buf[i + 9];
    preskip = buf.readUInt16LE(i + 10);
    rate = buf.readUInt32LE(i + 12) || 48000;
  }
  const last = buf.lastIndexOf('OggS');
  const granule = Number(buf.readBigInt64LE(last + 6));
  const sampleRate = isOpus ? 48000 : (rate || 44100);
  const samples = isOpus ? granule - preskip : granule;
  return { codec: isOpus ? 'opus' : 'vorbis', rate: sampleRate, channels, dur: samples / sampleRate };
}

/**
 * 读 MP3 头（ID3v2 之后逐帧数）：返回 { codec:'mp3', rate, channels, dur }。
 *
 * 为什么现在需要它：终局升华用的整段朗诵是 mp3（外找的素材），而 qa:audio 原先只认 WAV/Ogg——
 * "只认两种容器"这条口径本来是为了防"扩展名与内容不一致"，mp3 没有那层歧义（浏览器普遍直接支持，
 * MIME 是 audio/mpeg），所以按需放开一种容器，而不是让素材迁就守卫（见 docs/HANDOFF-AUDIO 第六点五节）。
 */
export function mp3Info(buf) {
  if (buf.length < 4) return null;
  let off = 0;
  if (buf.slice(0, 3).toString('latin1') === 'ID3') {                 // 跳过 ID3v2 标签
    const sz = (buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f);
    off = 10 + sz;
  }
  const BR_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  let frames = 0;
  let dur = 0;
  let rate = 0;
  let channels = 0;
  let i = off;
  while (i + 4 <= buf.length) {
    if (buf[i] === 0xFF && (buf[i + 1] & 0xe0) === 0xe0) {
      const ver = (buf[i + 1] >> 3) & 3;                                // 3 = MPEG1
      const layer = (buf[i + 1] >> 1) & 3;                              // 1 = Layer III
      const bitrate = BR_V1L3[(buf[i + 2] >> 4) & 0xf];
      const srate = [44100, 48000, 32000][(buf[i + 2] >> 2) & 3];
      const pad = (buf[i + 2] >> 1) & 1;
      if (ver === 3 && layer === 1 && bitrate && srate) {
        channels = ((buf[i + 3] >> 6) & 3) === 3 ? 1 : 2;
        rate = srate;
        const len = Math.floor((1152 / 8) * bitrate * 1000 / srate) + pad;
        if (len > 4) { frames += 1; dur += 1152 / srate; i += len; continue; }
      }
    }
    i += 1;                                                            // 不是帧头就往后挪一格（含尾部的 ID3v1）
  }
  if (!frames) return null;
  return { codec: 'mp3', rate, channels, dur };
}

/** 自动识别容器 */
export function audioInfo(buf) {
  return wavInfo(buf) || oggInfo(buf) || mp3Info(buf);
}

export function bytesLabel(n) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';
}
