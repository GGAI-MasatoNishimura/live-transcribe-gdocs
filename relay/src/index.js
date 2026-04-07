/**
 * Phase 4: localhost WebSocket。
 * Phase 7: バッファした WebM を ffmpeg で PCM 化し、Google Cloud Speech-to-Text で文字起こし。
 */

import { WebSocketServer } from "ws";
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
});

wss.on("connection", (socket, req) => {
  const remote = req.socket?.remoteAddress ?? "?";
  console.log(`[relay] client connected from ${remote}`);

  const stt = createSttSession(socket);

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
        socket.send(
          JSON.stringify({
            type: "ack",
            documentId: typeof msg.documentId === "string" ? msg.documentId : null,
          }),
        );
        console.log("[relay] sent ack for hello");
      }
    } catch {
      /* 非 JSON はログのみ */
    }
  });

  socket.on("close", (code, reason) => {
    stt.dispose();
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
