# ローカル中継アプリ（Node.js）

## このディレクトリの責務

- Chrome 拡張機能からの音声データ受信
- 音声認識 API への送信と確定テキストの取得
- Google Docs API による末尾追記
- 再試行・ログ

UI は持たず、[extension/](../extension/) から接続される前提です。

## 実行方法

```bash
cd relay
npm install
npm start
```

Phase 4 以降、`npm start` は **終了せず** `127.0.0.1:8765`（既定）で WebSocket を待ち受けます。別ターミナルで拡張機能から接続するか、`wscat` などで `ws://127.0.0.1:8765` に接続して動作を確認できます。

### 環境変数（任意）

| 変数名 | 既定値 | 説明 |
|--------|--------|------|
| `RELAY_HOST` | `127.0.0.1` | 待ち受けアドレス |
| `RELAY_PORT` | `8765` | 待ち受けポート |
| `GOOGLE_APPLICATION_CREDENTIALS` | なし | **文字起こしを使うとき**、GCP サービスアカウント JSON のパス（例: `/path/to/key.json`）。未設定なら音声は受信ログのみで STT は行わない |
| `RELAY_STT_INTERVAL_MS` | `8000` | 受信した WebM をまとめて認識する間隔（ミリ秒） |
| `RELAY_STT_MIN_WEBM_BYTES` | `8192` | これ未満のバッファは認識に回さない |

### Phase 7: Google Cloud Speech-to-Text

1. GCP で **Cloud Speech-to-Text API** を有効にする。
2. サービスアカウントを作り、**JSON キー**をダウンロードする。
3. このマシンで `GOOGLE_APPLICATION_CREDENTIALS` にその JSON ファイルの**絶対パス**を設定してから `npm start` する。

例（Linux / WSL の bash）:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/home/you/keys/speech-sa.json
cd relay
npm start
```

音声は拡張から WebM 断片で届くため、relay 内で **ffmpeg**（`ffmpeg-static` 同梱）で 16 kHz の PCM に直してから同期 `recognize` します。認識結果はクライアントへ `{"type":"transcript","text":"…","final":true}` で返し、コンソールにも出します。
