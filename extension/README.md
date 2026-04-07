# Chrome 拡張機能（Manifest V3）

## このディレクトリの責務

- Google Meet タブの音声取得（TabCapture 等）
- 記録開始・停止の UI
- ローカル中継アプリへの音声・制御メッセージの送信

音声認識や Google ドキュメント API への書き込みは **ここでは行わず**、[relay/](../relay/) に任せる想定です。

## 開発時の読み込み方

1. Chrome で `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」で、この `extension` フォルダを指定する

## Phase 2 までに含まれるもの

- ツールバーアイコンから開くポップアップ
- Google ドキュメント URL 入力
- URL からドキュメント ID を表示（正しい形式のとき）
- 記録開始 / 記録停止

## Phase 5 までに含まれるもの

- 記録開始時に `ws://127.0.0.1:8765`（既定）へ WebSocket でローカル中継に接続し、`hello` メッセージでドキュメント ID を送る
- 中継が応答するまでのステータス表示、接続失敗時の案内
- ポップアップを閉じると WebSocket は切れるため、再び開いたときは記録状態を待機に戻す

**動作確認の手順:** 先に [relay/](../relay/) で `npm start` を起動してから、拡張機能を再読み込みし、記録開始を押す。

## Phase 6 までに含まれるもの

- `tabCapture` と `tabs` と `activeTab`、および `https://meet.google.com/*` の権限
- **前面（アクティブ）のタブが `https://meet.google.com/` のときだけ** そのタブから Tab Capture で音声を取得する（Google ドキュメントを前面にしたままバックグラウンドの Meet を取ると、Chrome が `getMediaStreamId` を拒否することがある）
- `MediaRecorder` で約 1 秒ごとにチャンク化し、WebSocket で relay にバイナリ送信（WebM 断片）
- Meet が前面でない・取得に失敗したときはメッセージを出してセッションを打ち切る

**動作確認の手順:** relay を起動したうえで、**Meet に参加しているタブをクリックして手前に出した状態**で拡張のポップアップを開き、URL を入れて記録開始する。relay のコンソールに `binary audio chunk` のログが増えれば音声が届いています。

ポップアップを閉じるとキャプチャと WebSocket は止まります（後続で Service Worker / Offscreen に移せる）。

## Phase 7 までに含まれるもの（relay 側）

- `GOOGLE_APPLICATION_CREDENTIALS` を設定したとき、relay が受け取った WebM を ffmpeg で PCM 化し、**Google Cloud Speech-to-Text** で文字起こし（同期 recognize、確定テキストのみ扱う）
- 結果は WebSocket で `transcript` メッセージとして拡張へ送り、ポップアップのステータスに短く表示する

認証キーが無い環境では従来どおりバイナリ受信ログのみです。

## Phase 8 までに含まれるもの（relay 側）

- 同じ `GOOGLE_APPLICATION_CREDENTIALS` で **Google Docs API** を呼び、確定テキストを **指定ドキュメントの末尾**へ追記する（詳細は [relay/README.md](../relay/README.md)）
- 出力先ドキュメントは、サービスアカウントのメールに **編集権限で共有**しておく必要がある

## Phase 9 までに含まれるもの

- ポップアップに、共有設定の目安（リンクで編集可）と「システムは末尾追記のみで既存行を上書きしない」旨の短い案内
- relay 側では追記行に既定で `[自動] ` プレフィックスを付け、人間の `[補足]` など（要件の書き方）と区別しやすくする（環境変数で変更可）

以降は Phase 10 の総合動作確認など。
