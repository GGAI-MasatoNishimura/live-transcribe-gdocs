/**
 * Phase 4: localhost で WebSocket を待ち受け、接続・切断・メッセージをログする。
 * STT・Docs API は後続フェーズ。
 */

import { WebSocketServer } from "ws";

const HOST = process.env.RELAY_HOST ?? "127.0.0.1";
const PORT = Number.parseInt(String(process.env.RELAY_PORT ?? "8765"), 10);

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on("listening", () => {
  console.log(`[relay] WebSocket listening on ws://${HOST}:${PORT}`);
});

wss.on("connection", (socket, req) => {
  const remote = req.socket?.remoteAddress ?? "?";
  console.log(`[relay] client connected from ${remote}`);

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      console.log(`[relay] binary message (${data.length} bytes)`);
      return;
    }
    const text = data.toString();
    const preview = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    console.log(`[relay] text message: ${preview}`);
  });

  socket.on("close", (code, reason) => {
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
