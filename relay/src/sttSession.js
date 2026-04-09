/**
 * WebSocket 接続ごとに、バッファした WebM を一定間隔で PCM 化して Google STT へ送る。
 */

import { webmBufferToLinear16Pcm } from "./pcmFromWebm.js";
import { isSttConfigured, transcribeLinear16Pcm } from "./googleStt.js";

/**
 * @param {{ readyState: number, send: (data: string) => void }} socket
 * @param {{ onFinalTranscript?: (text: string) => void }} [options]
 * @returns {{ pushBinary: (buf: Buffer) => void, dispose: () => void }}
 */
export function createSttSession(socket, options = {}) {
  const { onFinalTranscript } = options;

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
  // MediaRecorder が 1 秒ごとに送ると、8 秒で約 8 チャンク × 250B ≒ 2000B 未満になりがち。
  // 8192 や 2048 は実質届かず transcript が一生出ないことがあるため、既定は低めにする。
  const minWebmBytes = Number.parseInt(
    String(process.env.RELAY_STT_MIN_WEBM_BYTES ?? "1024"),
    10,
  );

  // Chrome の MediaRecorder は先頭チャンクにだけ WebM ヘッダが付く。区間ごとにバッファを捨てると
  // 2 回目以降はヘッダなしの断片だけになり ffmpeg が失敗するため、セッション中はチャンクを蓄積する。
  const pcmBytesPerSecond = 16000 * 2;

  /**
   * 蓄積済み PCM のうち、直近 intervalMs 秒分だけ STT に渡す（重複認識を抑える）。
   * @param {Buffer} pcm
   * @returns {Buffer}
   */
  function takeLastAudioWindow(pcm) {
    const maxBytes = Math.floor((pcmBytesPerSecond * intervalMs) / 1000);
    if (pcm.length <= maxBytes) {
      return pcm;
    }
    return Buffer.from(pcm.subarray(pcm.length - maxBytes));
  }

  /** LINEAR16 モノラル想定。32767 がフルスケール。 */
  function pcmMonoS16leMaxAbs(buf) {
    if (!buf?.length || buf.length < 2) {
      return 0;
    }
    let m = 0;
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const v = buf.readInt16LE(i);
      const a = v < 0 ? -v : v;
      if (a > m) {
        m = a;
      }
    }
    return m;
  }

  async function tick() {
    if (busy || socket.readyState !== 1) {
      return;
    }
    if (chunks.length === 0) {
      return;
    }
    const webm = Buffer.concat(chunks);
    if (webm.length < minWebmBytes) {
      console.log(
        `[relay] STT: まだデータが少ないためスキップ (${webm.length} bytes < ${minWebmBytes} bytes)。録音を続けてください。`,
      );
      return;
    }

    busy = true;
    try {
      const pcmFull = await webmBufferToLinear16Pcm(webm);
      if (!pcmFull) {
        console.warn(
          `[relay] STT: WebM→PCM 変換に失敗しました（蓄積 WebM ${webm.length} bytes）`,
        );
        return;
      }
      const pcm = takeLastAudioWindow(pcmFull);
      const text = await transcribeLinear16Pcm(pcm);
      if (!text) {
        const maxAbs = pcmMonoS16leMaxAbs(pcm);
        const pct = ((maxAbs / 32767) * 100).toFixed(1);
        const hint =
          maxAbs < 800
            ? "PCM がほぼ無音です。Meet を最前面にし、相手の声や共有音声がそのタブから聞こえているか確認してください（キャプチャはミュートや別タブでは無音になりがちです）。"
            : "PCM には音があります。話している言語に合わせて RELAY_STT_LANGUAGE（例: en-US）や RELAY_STT_MODEL=latest_long を試すか、マイクではなく「タブの出力」が取れているか確認してください。";
        console.log(
          `[relay] STT: 認識テキストなし。最大振幅 ${maxAbs}/32767（約 ${pct}%）。${hint} 直近 ${pcm.length} bytes / 蓄積デコード ${pcmFull.length} bytes`,
        );
        return;
      }
      if (text && socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: "transcript",
            text,
            final: true,
          }),
        );
        console.log(`[relay] transcript: ${text}`);
        if (typeof onFinalTranscript === "function") {
          onFinalTranscript(text);
        }
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
