/**
 * Phase 4: localhost WebSocket。
 * Phase 7: WebM → PCM → Google Speech-to-Text。
 * Phase 8: 確定テキストをバッファし Google Docs 末尾へ追記。
 */

import { WebSocketServer } from "ws";
import { createTranscriptBuffer, isDocsApiConfigured } from "./docsAppend.js";
import { isSttConfigured } from "./googleStt.js";
import { createSttSession } from "./sttSession.js";

const HOST = process.env.RELAY_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(String(process.env.RELAY_PORT ?? "8765"), 10);

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on("listening", () => {
  console.log(`[relay] WebSocket listening on ws://${HOST}:${PORT}`);
  if (isSttConfigured()) {
    console.log("[relay] STT: GOOGLE_APPLICATION_CREDENTIALS を検出しました");
  } else {
    console.log(
      "[relay] STT: GOOGLE_APPLICATION_CREDENTIALS が無いため、音声はログのみ（文字起こしはスキップ）",
    );
  }
  if (isDocsApiConfigured()) {
    console.log(
      "[relay] Docs API: 同じ認証情報でドキュメント末尾追記を試みます（ドキュメントをサービスアカウントに共有してください）",
    );
  } else {
    console.log(
      "[relay] Docs API: 認証情報が無いため追記しません",
    );
  }
});

wss.on("connection", (socket, req) => {
  const remote = req.socket?.remoteAddress ?? "?";
  console.log(`[relay] client connected from ${remote}`);

  const sessionDoc = { id: null };
  const sessionClosed = { current: false };
  const docBuffer = createTranscriptBuffer(sessionDoc);

  const stt = createSttSession(socket, {
    onFinalTranscript: (text) => {
      if (sessionClosed.current) {
        return;
      }
      docBuffer.enqueue(text);
    },
  });

  let binaryChunkCount = 0;

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      binaryChunkCount += 1;
      stt.pushBinary(Buffer.from(data));
      if (binaryChunkCount <= 3 || binaryChunkCount % 20 === 0) {
        console.log(
          `[relay] binary audio chunk #${binaryChunkCount} (${data.length} bytes)`,
        );
      }
      return;
    }
    const text = data.toString();
    const preview = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    console.log(`[relay] text message: ${preview}`);
    try {
      const msg = JSON.parse(text);
      if (msg && msg.type === "hello") {
        if (typeof msg.documentId === "string" && msg.documentId.length > 0) {
          sessionDoc.id = msg.documentId;
        }
        socket.send(
          JSON.stringify({
            type: "ack",
            documentId: sessionDoc.id,
          }),
        );
        console.log("[relay] sent ack for hello");
      }
    } catch {
      /* 非 JSON はログのみ */
    }
  });

  socket.on("close", (code, reason) => {
    sessionClosed.current = true;
    stt.dispose();
    void docBuffer.dispose();
    const r = reason?.length ? reason.toString() : "";
    console.log(`[relay] client closed code=${code}${r ? ` reason=${r}` : ""}`);
  });

  socket.on("error", (err) => {
    console.error("[relay] socket error:", err.message);
  });
});

wss.on("error", (err) => {
  console.error("[relay] server error:", err.message);
  process.exitCode = 1;
});
