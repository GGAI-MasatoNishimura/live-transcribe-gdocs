/**
 * ポップアップ: ドキュメント URL の検証と、録音タブ（Meet + マイクミックス）の起動。
 */

const STORAGE_KEYS = {
  lastDocUrl: "lastDocUrl",
  recording: "recording",
  /** mic.html が読み取る。documentId と記録開始時点の Meet タブ ID */
  pendingMixSession: "pendingMixSession",
};

const docUrlInput = document.getElementById("docUrl");
const docIdHint = document.getElementById("docIdHint");
const btnStart = document.getElementById("btnStart");
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

  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.id == null || typeof active.url !== "string") {
    setStatus("アクティブなタブを取得できませんでした。もう一度お試しください。");
    return;
  }
  if (!active.url.startsWith("https://meet.google.com/")) {
    setStatus(
      "記録開始の直前に、Google Meet に参加しているタブを手前に表示してください（URL が meet.google.com である必要があります）。",
    );
    return;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.lastDocUrl]: url,
    [STORAGE_KEYS.recording]: true,
    [STORAGE_KEYS.pendingMixSession]: {
      documentId,
      meetTabId: active.id,
    },
  });

  setStatus("録音タブを開いています…");
  try {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("mic.html"),
      active: false,
    });
  } catch (e) {
    console.error(e);
    await chrome.storage.local.remove(STORAGE_KEYS.pendingMixSession);
    await chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });
    setStatus("タブを開けませんでした。もう一度お試しください。");
    return;
  }

  setStatus(
    "録音タブを開きました。タブバーから選び、手順どおりに進めてください（このポップアップは閉じてかまいません）。録音の停止は録音タブで行います。",
  );
});

async function loadState() {
  await chrome.storage.local.set({ [STORAGE_KEYS.recording]: false });

  const data = await chrome.storage.local.get([STORAGE_KEYS.lastDocUrl]);
  if (data[STORAGE_KEYS.lastDocUrl]) {
    docUrlInput.value = data[STORAGE_KEYS.lastDocUrl];
  }
  updateDocIdHint(docUrlInput.value);
  setStatus("待機中");
}

loadState().catch((err) => {
  console.error(err);
  setStatus("状態の読み込みに失敗しました");
});
