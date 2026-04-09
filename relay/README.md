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
| `GOOGLE_APPLICATION_CREDENTIALS` | なし | GCP サービスアカウント JSON のパス。**Speech-to-Text と Docs API の両方**に同じキーを使う想定。未設定なら STT も Docs 追記も行わない |
| `RELAY_STT_INTERVAL_MS` | `8000` | 受信した WebM をまとめて認識する間隔（ミリ秒） |
| `RELAY_STT_MIN_WEBM_BYTES` | `8192` | これ未満のバッファは認識に回さない |
| `RELAY_DOCS_FLUSH_MS` | `5000` | 確定テキストをドキュメントへ追記するまでのデバウンス（ミリ秒）。直前の追記からこの時間だけ待ってからまとめて書く |
| `RELAY_DOCS_LINE_PREFIX` | `[Gemini] ` | 追記する各行の先頭に付ける文字列。人間の `[補足]` などと区別する。空文字 `""` にするとプレフィックスなし |

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

### Phase 8: Google ドキュメント末尾追記

1. GCP で **Google Docs API** を有効にする（Speech と同じプロジェクトでよい）。
2. 上記と同じサービスアカウントのメールアドレス（`…@….iam.gserviceaccount.com`）を、出力先の Google ドキュメントに **編集者として共有**する。共有しないと API は書き込めません。
3. `GOOGLE_APPLICATION_CREDENTIALS` を設定した状態で `npm start` すると、確定した文字起こしが **デバウンス後**に `documents.batchUpdate`（`insertText`）で **本文末尾**へ追記されます。失敗時はリトライし、直前のキューは戻します。連続で同じ文が来た場合は 1 回にまとめて重複を避けます。

### Phase 9: 人間の修正と共存

- 追記は **常に `insertText` のみ**（既存インデックス範囲の置換 API は使わない）ため、人間が上の行を編集しても、システムがその行を後から上書きすることはない。
- 各行の先頭に **`RELAY_DOCS_LINE_PREFIX`（既定 `[Gemini] `）** を付け、要件にある人間向けの `[補足]` などと見分けやすくする。
