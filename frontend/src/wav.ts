const rate = 16000;
export function encodeWav(samples: Float32Array, sourceRate: number): Blob {
  const length = Math.min(
    rate * 30,
    Math.floor((samples.length * rate) / sourceRate),
  );
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  function label(at: number, s: string) {
    [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  }
  label(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  label(8, "WAVE");
  label(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const start = Math.floor((i * sourceRate) / rate);
    const end = Math.max(start + 1, Math.floor(((i + 1) * sourceRate) / rate));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(
      44 + 2 * i,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}
