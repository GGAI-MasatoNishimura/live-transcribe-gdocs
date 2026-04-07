/**
 * WebSocket 接続ごとに、バッファした WebM を一定間隔で PCM 化して Google STT へ送る。
 */

import { webmBufferToLinear16Pcm } from "./pcmFromWebm.js";
import { isSttConfigured, transcribeLinear16Pcm } from "./googleStt.js";

/**
 * @param {{ readyState: number, send: (data: string) => void }} socket
 * @returns {{ pushBinary: (buf: Buffer) => void, dispose: () => void }}
 */
export function createSttSession(socket) {
  if (!isSttConfigured()) {
    return {
      pushBinary() {},
      dispose() {},
    };
  }

  const chunks = [];
  let busy = false;
  let timer = null;

  const intervalMs = Number.parseInt(
    String(process.env.RELAY_STT_INTERVAL_MS ?? "8000"),
    10,
  );
  const minWebmBytes = Number.parseInt(
    String(process.env.RELAY_STT_MIN_WEBM_BYTES ?? "8192"),
    10,
  );

  async function tick() {
    if (busy || socket.readyState !== 1) {
      return;
    }
    if (chunks.length === 0) {
      return;
    }
    const webm = Buffer.concat(chunks);
    chunks.length = 0;
    if (webm.length < minWebmBytes) {
      return;
    }

    busy = true;
    try {
      const pcm = await webmBufferToLinear16Pcm(webm);
      if (!pcm) {
        return;
      }
      const text = await transcribeLinear16Pcm(pcm);
      if (text && socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: "transcript",
            text,
            final: true,
          }),
        );
        console.log(`[relay] transcript: ${text}`);
      }
    } finally {
      busy = false;
    }
  }

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  console.log(
    `[relay] STT セッション開始（間隔 ${intervalMs} ms、最小 WebM ${minWebmBytes} bytes）`,
  );

  return {
    pushBinary(buf) {
      chunks.push(buf);
    },
    dispose() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      chunks.length = 0;
    },
  };
}
