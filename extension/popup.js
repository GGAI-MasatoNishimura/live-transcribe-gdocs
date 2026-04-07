/**
 * Phase 2: ポップアップ UI と URL 検証。
 * Phase 5: ローカル中継へ WebSocket。
 * Phase 6: Google Meet タブの Tab Capture 音声を MediaRecorder でチャンク化し relay へ送信。
 */

const RELAY_WS_URL = "ws://127.0.0.1:8765";

const STORAGE_KEYS = {
  lastDocUrl: "lastDocUrl",
  recording: "recording",
};

const docUrlInput = document.getElementById("docUrl");
const docIdHint = document.getElementById("docIdHint");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const statusEl = document.getElementById("status");

/** @type {WebSocket | null} */
let relaySocket = null;
/** ユーザーが「記録停止」を押して閉じたとき true（異常切断と区別） */
let relayCloseRequested = false;
/** 接続切断時に表示するメッセージ（Meet 未取得など）。通常の停止より優先 */
let closeStatusOverride = null;

/** @type {MediaRecorder | null} */
let mediaRecorder = null;
/** @type {MediaStream | null} */
let captureStream = null;

function extractDocumentId(url) {
  const s = String(url).trim();
  const m = s.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function updateDocIdHint(url) {
  const id = extractDocumentId(url);
  if (id) {
    docIdHint.hidden = false;
    docIdHint.textContent = `ドキュメント ID: ${id}`;
  } else if (String(url).trim()) {
    docIdHint.hidden = false;
    docIdHint.textContent = "この文字列からはドキュメント ID を取り出せません";
  } else {
    docIdHint.hidden = true;
    docIdHint.textContent = "";
  }
}

function applyRecordingUi(isRecording) {
  btnStart.disabled = isRecording;
  btnStop.disabled = !isRecording;
  if (!isRecording) {
    setStatus("待機中");
  }
}

function stopTabCapture() {
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
}

/**
 * @param {number} tabId
 * @returns {Promise<string>}
 */
function getTabCaptureStreamId(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!streamId) {
        reject(new Error("ストリーム ID を取得できませんでした"));
        return;
      }
      resolve(streamId);
    });
  });
}

/**
 * 前面（アクティブ）のタブが Meet のときだけその tabId を返す。
 * 別タブでドキュメントを開いたままバックグラウンドの Meet を取ろうとすると、
 * Chrome が「activeTab / 起動コンテキスト」との整合で getMediaStreamId を拒否することがある。
 *
 * @returns {Promise<number | null>}
 */
async function getMeetTargetTabId() {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id == null || typeof active.url !== "string") {
    return null;
  }
  const url = active.url;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("devtools://")) {
    return null;
  }
  if (url.startsWith("https://meet.google.com/")) {
    return active.id;
  }
  return null;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function startMeetAudioCapture() {
  const tabId = await getMeetTargetTabId();
  if (tabId == null) {
    return {
      ok: false,
      message:
        "タブ音声の取得には、Google Meet に参加している画面を「手前のタブ」にしてから「記録開始」してください。Google ドキュメントだけを前面にしたままだと、ブラウザが拒否することがあります（chrome:// の画面で開いているときも不可）。",
    };
  }

  let streamId;
  try {
    streamId = await getTabCaptureStreamId(tabId);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      ok: false,
      message: `タブ音声の許可に失敗しました: ${err.message}`,
    };
  }

  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  };

  try {
    captureStream = await navigator.mediaDevices.getUserMedia(
      /** @type {MediaStreamConstraints} */ (constraints),
    );
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      ok: false,
      message: `タブ音声ストリームを取得できませんでした: ${err.message}`,
    };
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";

  const recorderOptions = mimeType ? { mimeType } : {};
  try {
    mediaRecorder = new MediaRecorder(captureStream, recorderOptions);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
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
    console.error("[popup] MediaRecorder error", ev);
  });

  const sliceMs = 1000;
  try {
    mediaRecorder.start(sliceMs);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    stopTabCapture();
    return {
      ok: false,
      message: `録音の開始に失敗しました: ${err.message}`,
    };
  }
  return { ok: true };
}

/**
 * 中継へ接続できたあと Meet 取得に失敗したときなど、セッションを打ち切る。
 * @param {string} message
 */
function failSession(message) {
  closeStatusOverride = message;
  relayCloseRequested = true;
  stopTabCapture();
  if (relaySocket) {
    relaySocket.close();
  }
}

function disconnectRelay() {
  stopTabCapture();
  if (!relaySocket) {
    return;
  }
  relayCloseRequested = true;
  relaySocket.close();
  relaySocket = null;
}

function connectRelay(documentId) {
  relayCloseRequested = false;
  const socket = new WebSocket(RELAY_WS_URL);
  relaySocket = socket;

  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "hello",
        documentId,
      }),
    );
    setStatus("記録中（中継と接続済み。Meet 音声の準備を待っています）");
  });

  socket.addEventListener("message", async (event) => {
    const text = typeof event.data === "string" ? event.data : "";
    try {
      const msg = JSON.parse(text);
      if (msg && msg.type === "ack") {
        setStatus("記録中（Meet のタブ音声を準備しています）");
        try {
          const result = await startMeetAudioCapture();
          if (!result.ok) {
            failSession(result.message);
            return;
          }
          setStatus("記録中（Meet のタブ音声を中継へ送信中。文字起こしは未接続）");
        } catch (e) {
          console.error(e);
          const err = e instanceof Error ? e : new Error(String(e));
          failSession(`タブ音声の取得に失敗しました: ${err.message}`);
        }
      }
    } catch {
      /* 非 JSON は無視 */
    }
  });

  socket.addEventListener("close", () => {
    relaySocket = null;
    const override = closeStatusOverride;
    closeStatusOverride = null;
    const userStopped = relayCloseRequested;
    relayCloseRequested = false;

    void chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });

    if (override) {
      applyRecordingUi(false);
      setStatus(override);
      return;
    }

    if (userStopped) {
      applyRecordingUi(false);
      setStatus("待機中");
      return;
    }

    applyRecordingUi(false);
    setStatus(
      "中継に接続できないか、接続が切れました。relay フォルダで npm start を実行しているか確認してください。",
    );
  });
}

async function loadState() {
  await chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });

  const data = await chrome.storage.local.get([STORAGE_KEYS.lastDocUrl]);
  if (data[STORAGE_KEYS.lastDocUrl]) {
    docUrlInput.value = data[STORAGE_KEYS.lastDocUrl];
  }
  updateDocIdHint(docUrlInput.value);
  applyRecordingUi(false);
}

docUrlInput.addEventListener("input", () => {
  updateDocIdHint(docUrlInput.value);
});

btnStart.addEventListener("click", async () => {
  const url = docUrlInput.value.trim();
  if (!url) {
    setStatus("Google ドキュメントの URL を入力してください");
    return;
  }
  const documentId = extractDocumentId(url);
  if (!documentId) {
    setStatus("Google ドキュメントの URL 形式ではありません（/document/d/ の後に ID がある必要があります）");
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastDocUrl]: url,
    [STORAGE_KEYS.recording]: true,
  });
  applyRecordingUi(true);
  setStatus("中継に接続しています…");
  connectRelay(documentId);
});

btnStop.addEventListener("click", async () => {
  await chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });
  disconnectRelay();
  applyRecordingUi(false);
});

loadState().catch((err) => {
  console.error(err);
  setStatus("状態の読み込みに失敗しました");
});
