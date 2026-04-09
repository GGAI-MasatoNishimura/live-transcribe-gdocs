/**
 * popup / mic タブ共通: relay 向け MediaRecorder とマイクエラー文言。
 * @file
 */

(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : window;

  g.LTG_RELAY_WS_URL = "ws://127.0.0.1:8765";

  /**
   * @param {WebSocket} relaySocket
   * @param {MediaStream} stream
   * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
   */
  g.ltgStartMediaRecorder = async function (relaySocket, stream) {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    const recorderOptions = mimeType ? { mimeType } : {};
    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, recorderOptions);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      stream.getTracks().forEach((t) => t.stop());
      return {
        ok: false,
        message: `MediaRecorder を開始できませんでした: ${err.message}`,
      };
    }

    mediaRecorder.addEventListener("dataavailable", async (ev) => {
      if (!ev.data || ev.data.size === 0) {
        return;
      }
      const socket = relaySocket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const buf = await ev.data.arrayBuffer();
      socket.send(buf);
    });

    mediaRecorder.addEventListener("error", (ev) => {
      console.error("[ltg] MediaRecorder error", ev);
    });

    const sliceMs = 1000;
    try {
      mediaRecorder.start(sliceMs);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      stream.getTracks().forEach((t) => t.stop());
      return {
        ok: false,
        message: `録音の開始に失敗しました: ${err.message}`,
      };
    }

    return { ok: true, mediaRecorder };
  };

  /**
   * @param {unknown} e
   * @returns {string}
   */
  g.ltgFormatMicAccessError = function (e) {
    const name =
      typeof e === "object" && e !== null && "name" in e
        ? String(/** @type {{ name?: string }} */ (e).name)
        : "";
    const msg = e instanceof Error ? e.message : String(e);
    if (name === "NotAllowedError" || /Permission dismissed|not allowed|denied/i.test(msg)) {
      return [
        "マイクが使えませんでした（許可が完了していません）。",
        "1) このタブ表示のマイク許可で「許可」を選ぶ（×で閉じると失敗します）。",
        "2) Chrome の設定 → プライバシーとセキュリティ → サイトの設定 → マイク で、ブロックされていないか確認。",
      ].join(" ");
    }
    if (name === "NotFoundError") {
      return "マイクが見つかりません（デバイス接続・既定のマイクの設定を確認してください）。";
    }
    if (name === "NotReadableError") {
      return "マイクが他のアプリで使用中の可能性があります。ほかの録音アプリを閉じてから再度お試しください。";
    }
    return `マイクを取得できませんでした: ${msg}`;
  };
})();
