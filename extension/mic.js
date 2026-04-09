/**
 * 録音ページ: Meet タブ音声 + マイクをミックスして relay へ送信。
 */

const STORAGE_KEYS = {
  pendingMixSession: "pendingMixSession",
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
/** ミックス後の MediaRecorder 入力（解放は mixDispose 側） */
let captureStream = null;
/** @type {(() => Promise<void>) | null} */
let mixDispose = null;
/** @type {number | null} */
let meetTabIdForMix = null;

function setStatus(message) {
  statusEl.textContent = message;
}

async function cleanupRecordingOnly() {
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
  if (mixDispose) {
    try {
      await mixDispose();
    } catch (_) {
      /* ignore */
    }
    mixDispose = null;
  }
  captureStream = null;
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

function connectMixSession(documentId, meetTabId) {
  meetTabIdForMix = meetTabId;
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
    setStatus("中継に接続しました。準備ができたら下のボタンで Meet 音声とマイクの許可を進めてください。");
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
          "中継とつながりました。Meet のピクチャーインザピクチャー案内が出ていたら片付けてから、下のボタンを押してください。",
        );
      }
    } catch {
      /* 非 JSON は無視 */
    }
  });

  socket.addEventListener("close", () => {
    relaySocket = null;
    if (!relayCloseRequested) {
      void cleanupRecordingOnly();
      setStatus("中継との接続が切れました。relay で npm start しているか確認してください。");
    }
  });

  socket.addEventListener("error", () => {
    setStatus("WebSocket エラー。relay が起動しているか確認してください。");
  });
}

/**
 * Meet タブ音声 + マイクをミックスして録音開始。
 */
async function startMixAfterUserGesture() {
  const socket = relaySocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setStatus("中継に接続していません。ページを開き直すか、relay を起動してください。");
    return;
  }
  if (meetTabIdForMix == null) {
    setStatus("Meet タブ ID がありません。ポップアップからやり直してください。");
    return;
  }
  if (btnAllowMic) {
    btnAllowMic.disabled = true;
  }
  setStatus("Meet のタブ音声を取得しています…");
  let tabStream;
  try {
    tabStream = await window.ltgGetMeetTabAudioStream(meetTabIdForMix);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    setStatus(`Meet のタブ音声を取得できませんでした: ${err.message}`);
    if (btnAllowMic) {
      btnAllowMic.disabled = false;
    }
    return;
  }

  setStatus("マイクの許可を求めています…");
  let micStream;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    tabStream.getTracks().forEach((t) => t.stop());
    const errMsg = window.ltgFormatMicAccessError(e);
    setStatus(errMsg);
    if (btnAllowMic) {
      btnAllowMic.disabled = false;
    }
    return;
  }

  setStatus("音声をミックスしています…");
  const mixed = window.ltgMixTwoAudioStreams(tabStream, micStream, {
    meetTabMonitorGain: 1,
  });
  mixDispose = mixed.dispose;
  captureStream = mixed.stream;

  const r = await window.ltgStartMediaRecorder(socket, mixed.stream);
  if (!r.ok) {
    await cleanupRecordingOnly();
    setStatus(r.message);
    closeSocketOnly();
    if (btnAllowMic) {
      btnAllowMic.disabled = false;
    }
    meetTabIdForMix = null;
    return;
  }
  mediaRecorder = r.mediaRecorder;
  btnStop.disabled = false;
  setStatus(
    "録音中（Meet + マイク）。relay が Google STT する場合は数秒ごとに文字がドキュメントへ届きます。このタブは閉じないでください。",
  );
}

if (btnAllowMic) {
  btnAllowMic.addEventListener("click", () => {
    void startMixAfterUserGesture();
  });
}

btnStop.addEventListener("click", () => {
  void (async () => {
    relayCloseRequested = true;
    await cleanupRecordingOnly();
    closeSocketOnly();
    setStatus("録音を終了しました…");
    closeThisMicTab();
  })();
});

(async function init() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.pendingMixSession);
  const pending = data[STORAGE_KEYS.pendingMixSession];
  if (
    !pending ||
    typeof pending.documentId !== "string" ||
    !pending.documentId.length ||
    pending.meetTabId == null
  ) {
    setStatus(
      "セッション情報がありません。拡張のポップアップで、記録開始の直前に Google Meet を手前に表示してからやり直してください。",
    );
    return;
  }

  await chrome.storage.local.remove(STORAGE_KEYS.pendingMixSession);

  docIdHint.hidden = false;
  docIdHint.textContent = `ドキュメント ID: ${pending.documentId}`;

  connectMixSession(pending.documentId, pending.meetTabId);
})().catch((err) => {
  console.error(err);
  setStatus("初期化に失敗しました");
});
