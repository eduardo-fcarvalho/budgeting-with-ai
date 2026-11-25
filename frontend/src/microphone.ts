import { encodeWav } from "./wav";

export async function record(onLimit: () => void, signal: AbortSignal) {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
    throw new Error("Microfone indisponível. Você pode digitar o gasto.");
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let node: AudioWorkletNode | undefined;
  const chunks: Float32Array[] = [];
  let size = 0;
  let closed = false;
  function release() {
    closed = true;
    clearTimeout(timer);
    node?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    if (context.state !== "closed") void context.close().catch(() => {});
    signal.removeEventListener("abort", release);
  }
  signal.addEventListener("abort", release, { once: true });
  try {
    const resumed = context.resume();
    // Wait for permission in parallel with the user-gesture resume.
    await Promise.all([
      resumed,
      navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1 } })
        .then((s) => {
          stream = s;
          if (closed) s.getTracks().forEach((track) => track.stop());
        }),
    ]);
    signal.throwIfAborted();
    await context.audioWorklet.addModule("/recorder.js");
    signal.throwIfAborted();
    node = new AudioWorkletNode(context, "microphone-capture");
    const mute = context.createGain();
    mute.gain.value = 0;
    context
      .createMediaStreamSource(stream!)
      .connect(node)
      .connect(mute)
      .connect(context.destination);
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (closed || size >= context.sampleRate * 30) return;
      chunks.push(event.data);
      size += event.data.length;
    };
    timer = setTimeout(onLimit, 30000);
    return () => {
      release();
      if (size === 0)
        throw new Error(
          "Nenhum áudio recebido. Tente novamente ou digite o gasto.",
        );
      const samples = new Float32Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      return encodeWav(samples, context.sampleRate);
    };
  } catch (error) {
    release();
    throw error;
  }
}
