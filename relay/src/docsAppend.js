/**
 * Google Docs API で本文末尾へ追記（batchUpdate insertText）。
 * Phase 8: バッファをデバウンスしてフラッシュ、失敗時はリトライしキューを戻す。
 */

import { google } from "googleapis";

/** @type {ReturnType<typeof google.docs> | null} */
let cachedDocs = null;

export function isDocsApiConfigured() {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

async function getDocsApi() {
  if (!isDocsApiConfigured()) {
    return null;
  }
  if (!cachedDocs) {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/documents"],
    });
    const authClient = await auth.getClient();
    cachedDocs = google.docs({ version: "v1", auth: authClient });
  }
  return cachedDocs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ content?: { endIndex?: number | null }[] }} [body]
 * @returns {number}
 */
function getInsertIndex(body) {
  const content = body?.content;
  if (!content || content.length === 0) {
    return 1;
  }
  const last = content[content.length - 1];
  if (last?.endIndex == null) {
    return 1;
  }
  return Math.max(1, last.endIndex - 1);
}

/**
 * @param {string[]} strings
 * @returns {string[]}
 */
function dedupeConsecutive(strings) {
  const out = [];
  for (const s of strings) {
    const t = String(s).trim();
    if (!t) {
      continue;
    }
    if (out[out.length - 1] === t) {
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * @param {string} documentId
 * @param {string} text
 */
async function appendToDocumentEndOnce(documentId, text) {
  const docs = await getDocsApi();
  if (!docs) {
    throw new Error("Docs API クライアントがありません");
  }
  const { data } = await docs.documents.get({ documentId });
  const index = getInsertIndex(data.body);
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index },
            text,
          },
        },
      ],
    },
  });
}

/**
 * @param {string} documentId
 * @param {string} text
 */
export async function appendToDocumentEnd(documentId, text) {
  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await appendToDocumentEndOnce(documentId, text);
      return;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[relay] Docs 追記 試行 ${attempt}/${maxAttempts}: ${msg}`);
      if (attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  }
  throw lastErr;
}

/**
 * @param {{ id: string | null }} sessionDoc
 */
export function createTranscriptBuffer(sessionDoc) {
  const queue = [];
  let debounceTimer = null;
  let flushing = false;
  let warnedNoAuth = false;

  const debounceMs = Number.parseInt(
    String(process.env.RELAY_DOCS_FLUSH_MS ?? "5000"),
    10,
  );

  async function flushNow() {
    if (flushing) {
      return;
    }
    const docId = sessionDoc.id;
    if (!docId || queue.length === 0) {
      return;
    }
    if (!isDocsApiConfigured()) {
      if (!warnedNoAuth) {
        warnedNoAuth = true;
        console.log(
          "[relay] Docs: GOOGLE_APPLICATION_CREDENTIALS が無いため追記しません",
        );
      }
      queue.length = 0;
      return;
    }

    const snapshot = [...queue];
    queue.length = 0;

    const lines = dedupeConsecutive(snapshot);
    if (lines.length === 0) {
      return;
    }

    const payload = `${lines.join("\n")}\n`;

    flushing = true;
    try {
      await appendToDocumentEnd(docId, payload);
      console.log(
        `[relay] Docs に追記（${lines.length} 行相当、${payload.length} 文字）`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[relay] Docs 追記が最終失敗。キューを戻します:", msg);
      queue.unshift(...snapshot);
    } finally {
      flushing = false;
    }
  }

  function scheduleFlush() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flushNow();
    }, debounceMs);
  }

  return {
    /**
     * @param {string} text
     */
    enqueue(text) {
      if (!sessionDoc.id) {
        return;
      }
      const t = String(text).trim();
      if (!t) {
        return;
      }
      queue.push(t);
      scheduleFlush();
    },
    async dispose() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      await flushNow();
    },
  };
}
