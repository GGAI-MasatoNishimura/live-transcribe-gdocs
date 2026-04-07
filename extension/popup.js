/**
 * Phase 2: ポップアップ UI と URL 検証。
 * Phase 5: 記録中はローカル中継へ WebSocket 接続（音声・STT は未接続）。
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

function disconnectRelay() {
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
    setStatus("記録中（中継と接続済み。音声・文字起こしは未接続）");
  });

  socket.addEventListener("message", (event) => {
    const text = typeof event.data === "string" ? event.data : "";
    try {
      const msg = JSON.parse(text);
      if (msg && msg.type === "ack") {
        setStatus("記録中（中継がドキュメント ID を受け取りました）");
      }
    } catch {
      /* 非 JSON は無視 */
    }
  });

  socket.addEventListener("close", () => {
    relaySocket = null;
    const userStopped = relayCloseRequested;
    relayCloseRequested = false;

    void chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });

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
