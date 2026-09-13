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

/** 自动识别容器 */
export function audioInfo(buf) {
  return wavInfo(buf) || oggInfo(buf);
}

export function bytesLabel(n) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';
}
