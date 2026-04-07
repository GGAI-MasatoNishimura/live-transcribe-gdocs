# ローカル中継アプリ（Node.js）

## このディレクトリの責務

- Chrome 拡張機能からの音声データ受信
- 音声認識 API への送信と確定テキストの取得
- Google Docs API による末尾追記
- 再試行・ログ

UI は持たず、[extension/](../extension/) から接続される前提です。

## 実行方法（Phase 1）

```bash
cd relay
npm install
npm start
```

Phase 1 の `npm start` はスキャフォールド用のメッセージを出して終了します。WebSocket 待受などは Phase 4 以降で追加します。
