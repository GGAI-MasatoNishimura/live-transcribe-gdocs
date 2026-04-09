/**
 * マイクモード専用ページ: ポップアップが閉じても getUserMedia の許可が途切れにくい。
 */

const STORAGE_KEYS = {
  pendingMicSession: "pendingMicSession",
  recording: "recording",
};

const statusEl = document.getElementById("status");
const docIdHint = document.getElementById("docIdHint");
const btnAllowMic = document.getElementById("btnAllowMic");
const btnStop = document.getElementById("btnStop");

/** @type {WebSocket | null} */
let relaySocket = null;
let relayCloseRequested = false;
/** @type {MediaRecorder | null} */
let mediaRecorder = null;
/** @type {MediaStream | null} */
let captureStream = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function cleanupRecordingOnly() {
  if (mediaRecorder) {
    try {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch (_) {
      /* ignore */
    }
    mediaRecorder = null;
  }
  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
  }
  btnStop.disabled = true;
  if (btnAllowMic) {
    btnAllowMic.disabled = true;
  }
  void chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });
}

function closeSocketOnly() {
  if (relaySocket) {
    relaySocket.close();
    relaySocket = null;
  }
}

/** このページが拡張のタブで開かれているときだけ閉じる */
function closeThisMicTab() {
  try {
    chrome.tabs.getCurrent((tab) => {
      if (chrome.runtime.lastError) {
        try {
          window.close();
        } catch (_) {
          /* ignore */
        }
        return;
      }
      if (tab?.id != null) {
        chrome.tabs.remove(tab.id);
      } else {
        try {
          window.close();
        } catch (_) {
          /* ignore */
        }
      }
    });
  } catch (_) {
    try {
      window.close();
    } catch (__) {
      /* ignore */
    }
  }
}

function connectMicSession(documentId) {
  relayCloseRequested = false;
  const socket = new WebSocket(window.LTG_RELAY_WS_URL);
  relaySocket = socket;

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "hello",
        documentId,
      }),
    );
    setStatus("中継に接続しました。準備ができたら下の「マイクを許可して録音開始」を押してください。");
  });

  socket.addEventListener("message", async (event) => {
    const text = typeof event.data === "string" ? event.data : "";
    try {
      const msg = JSON.parse(text);
      if (msg && msg.type === "transcript" && typeof msg.text === "string") {
        const t = msg.text.trim();
        const short = t.length > 120 ? `${t.slice(0, 120)}…` : t;
        setStatus(`文字起こし: ${short}`);
        return;
      }
      if (msg && msg.type === "ack") {
        if (btnAllowMic) {
          btnAllowMic.disabled = false;
        }
        setStatus(
          "中継とつながりました。Meet 側のピクチャーインザピクチャー案内が出ていたら片付けてから、下のボタンでマイクを許可してください。",
        );
      }
    } catch {
      /* 非 JSON は無視 */
    }
  });

  socket.addEventListener("close", () => {
    relaySocket = null;
    cleanupRecordingOnly();
    if (!relayCloseRequested) {
      setStatus("中継との接続が切れました。relay で npm start しているか確認してください。");
    }
  });

  socket.addEventListener("error", () => {
    setStatus("WebSocket エラー。relay が起動しているか確認してください。");
  });
}

/**
 * ack 受信後にユーザーがボタンで明示したときだけ getUserMedia する（Meet の PiP 案内と同時に出さない）。
 */
async function startMicAfterUserGesture() {
  const socket = relaySocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setStatus("中継に接続していません。ページを開き直すか、relay を起動してください。");
    return;
  }
  if (btnAllowMic) {
    btnAllowMic.disabled = true;
  }
  setStatus("マイクの許可を求めています…");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    captureStream = stream;
    const r = await window.ltgStartMediaRecorder(socket, stream);
    if (!r.ok) {
      stream.getTracks().forEach((t) => t.stop());
      captureStream = null;
      setStatus(r.message);
      closeSocketOnly();
      cleanupRecordingOnly();
      if (btnAllowMic) {
        btnAllowMic.disabled = false;
      }
      return;
    }
    mediaRecorder = r.mediaRecorder;
    btnStop.disabled = false;
    setStatus(
      "録音中。relay が Google STT する場合は数秒ごとに文字がドキュメントへ届きます。このタブは閉じないでください。",
    );
  } catch (e) {
    const errMsg = window.ltgFormatMicAccessError(e);
    setStatus(errMsg);
    closeSocketOnly();
    cleanupRecordingOnly();
    if (btnAllowMic) {
      btnAllowMic.disabled = false;
    }
  }
}

if (btnAllowMic) {
  btnAllowMic.addEventListener("click", () => {
    void startMicAfterUserGesture();
  });
}

btnStop.addEventListener("click", () => {
  relayCloseRequested = true;
  closeSocketOnly();
  setStatus("録音を終了しました…");
  closeThisMicTab();
});

(async function init() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.pendingMicSession);
  const pending = data[STORAGE_KEYS.pendingMicSession];
  if (!pending || typeof pending.documentId !== "string" || !pending.documentId.length) {
    setStatus(
      "セッション情報がありません。拡張のポップアップで「マイク」を選び、記録開始からやり直してください。",
    );
    return;
  }

  await chrome.storage.local.remove(STORAGE_KEYS.pendingMicSession);

  docIdHint.hidden = false;
  docIdHint.textContent = `ドキュメント ID: ${pending.documentId}`;

  connectMicSession(pending.documentId);
})().catch((err) => {
  console.error(err);
  setStatus("初期化に失敗しました");
});
