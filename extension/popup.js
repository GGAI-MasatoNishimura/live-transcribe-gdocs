/**
 * Phase 2: ポップアップ UI と URL 検証。
 * Phase 5: ローカル中継へ WebSocket。
 * Phase 6: Tab Capture またはマイクを MediaRecorder でチャンク化し relay へ送信。
 */

const STORAGE_KEYS = {
  lastDocUrl: "lastDocUrl",
  recording: "recording",
  /** `"tab"` | `"mic"` */
  audioSource: "audioSource",
  /** マイクモードで mic.html が読み取る一時セッション */
  pendingMicSession: "pendingMicSession",
};

const docUrlInput = document.getElementById("docUrl");
const docIdHint = document.getElementById("docIdHint");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const statusEl = document.getElementById("status");
const audioSourceField = document.getElementById("audioSourceField");

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
  if (audioSourceField) {
    audioSourceField.disabled = isRecording;
  }
  if (!isRecording) {
    setStatus("待機中");
  }
}

/** @returns {"tab" | "mic"} */
function getAudioSource() {
  const el = document.querySelector('input[name="audioSource"]:checked');
  return el?.value === "mic" ? "mic" : "tab";
}

function stopAudioCapture() {
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
 * MediaRecorder を組み立てて relay へバイナリ送信する（Meet タブキャプチャ用）。
 * @param {MediaStream} stream
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function startMediaRecorderOnStream(stream) {
  captureStream = stream;
  const socket = relaySocket;
  if (!socket) {
    stream.getTracks().forEach((t) => t.stop());
    captureStream = null;
    return { ok: false, message: "中継に接続していません" };
  }
  const r = await window.ltgStartMediaRecorder(socket, stream);
  if (!r.ok) {
    stream.getTracks().forEach((t) => t.stop());
    captureStream = null;
    return r;
  }
  mediaRecorder = r.mediaRecorder;
  return { ok: true };
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
 * Google Meet タブの出力音（タブキャプチャ）。
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function startMeetTabAudioCapture() {
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

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      /** @type {MediaStreamConstraints} */ (constraints),
    );
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      ok: false,
      message: `タブ音声ストリームを取得できませんでした: ${err.message}`,
    };
  }

  return startMediaRecorderOnStream(stream);
}

/**
 * Meet タブの音声のみ（マイクは mic.html で扱う）。
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
async function startRelayAudioCapture() {
  return startMeetTabAudioCapture();
}

/**
 * 中継へ接続できたあと Meet 取得に失敗したときなど、セッションを打ち切る。
 * @param {string} message
 */
function failSession(message) {
  closeStatusOverride = message;
  relayCloseRequested = true;
  stopAudioCapture();
  if (relaySocket) {
    relaySocket.close();
  }
}

function disconnectRelay() {
  stopAudioCapture();
  if (!relaySocket) {
    return;
  }
  relayCloseRequested = true;
  relaySocket.close();
  relaySocket = null;
}

function connectRelay(documentId) {
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
    setStatus("記録中（中継と接続済み。音声の準備を待っています）");
  });

  socket.addEventListener("message", async (event) => {
    const text = typeof event.data === "string" ? event.data : "";
    try {
      const msg = JSON.parse(text);
      if (msg && msg.type === "transcript" && typeof msg.text === "string") {
        const t = msg.text.trim();
        const short = t.length > 120 ? `${t.slice(0, 120)}…` : t;
        setStatus(`記録中（文字起こし） ${short}`);
        return;
      }
      if (msg && msg.type === "ack") {
        setStatus("記録中（Meet のタブ音声を準備しています）");
        try {
          const result = await startRelayAudioCapture();
          if (!result.ok) {
            failSession(result.message);
            return;
          }
          setStatus(
            "記録中（Meet 音声を中継へ送信中。relay が Google STT する場合は数秒ごとに文字が届きます）",
          );
        } catch (e) {
          console.error(e);
          const err = e instanceof Error ? e : new Error(String(e));
          failSession(`音声の取得に失敗しました: ${err.message}`);
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

  const data = await chrome.storage.local.get([
    STORAGE_KEYS.lastDocUrl,
    STORAGE_KEYS.audioSource,
  ]);
  if (data[STORAGE_KEYS.lastDocUrl]) {
    docUrlInput.value = data[STORAGE_KEYS.lastDocUrl];
  }
  const srcMic = document.getElementById("srcMic");
  const srcTab = document.getElementById("srcTab");
  if (data[STORAGE_KEYS.audioSource] === "mic" && srcMic && srcTab) {
    srcMic.checked = true;
    srcTab.checked = false;
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

  if (getAudioSource() === "mic") {
    await chrome.storage.local.set({
      [STORAGE_KEYS.lastDocUrl]: url,
      [STORAGE_KEYS.audioSource]: "mic",
      [STORAGE_KEYS.pendingMicSession]: { documentId },
      [STORAGE_KEYS.recording]: true,
    });
    setStatus("マイク録音用のタブを開いています…");
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL("mic.html"),
        active: false,
      });
    } catch (e) {
      console.error(e);
      await chrome.storage.local.remove(STORAGE_KEYS.pendingMicSession);
      await chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });
      setStatus("タブを開けませんでした。もう一度お試しください。");
      return;
    }
    setStatus(
      "マイク録音用のタブを開きました。タブバーで「マイク録音」と出たタブを選び、表示された手順どおりに進んでください（このポップアップは閉じてかまいません）。",
    );
    applyRecordingUi(false);
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastDocUrl]: url,
    [STORAGE_KEYS.recording]: true,
    [STORAGE_KEYS.audioSource]: "tab",
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
