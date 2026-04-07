/**
 * Phase 2: ポップアップ UI と URL 検証のみ。
 * ローカル中継・TabCapture・STT は後続フェーズ。
 */

const STORAGE_KEYS = {
  lastDocUrl: "lastDocUrl",
  recording: "recording",
};

const docUrlInput = document.getElementById("docUrl");
const docIdHint = document.getElementById("docIdHint");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const statusEl = document.getElementById("status");

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
  if (isRecording) {
    setStatus("記録中（MVP Phase2: 中継・音声は未接続）");
  } else {
    setStatus("待機中");
  }
}

async function loadState() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.lastDocUrl,
    STORAGE_KEYS.recording,
  ]);
  if (data[STORAGE_KEYS.lastDocUrl]) {
    docUrlInput.value = data[STORAGE_KEYS.lastDocUrl];
  }
  updateDocIdHint(docUrlInput.value);
  const rec = Boolean(data[STORAGE_KEYS.recording]);
  applyRecordingUi(rec);
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
  if (!extractDocumentId(url)) {
    setStatus("Google ドキュメントの URL 形式ではありません（/document/d/ の後に ID がある必要があります）");
    return;
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastDocUrl]: url,
    [STORAGE_KEYS.recording]: true,
  });
  applyRecordingUi(true);
});

btnStop.addEventListener("click", async () => {
  await chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });
  applyRecordingUi(false);
});

loadState().catch((err) => {
  console.error(err);
  setStatus("状態の読み込みに失敗しました");
});
