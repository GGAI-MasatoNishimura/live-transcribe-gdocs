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

- `tabCapture` と `tabs`、および `https://meet.google.com/*` の権限
- アクティブなタブが Meet のときはそのタブ、そうでなければ開いている Meet タブのいずれかから Tab Capture で音声を取得
- `MediaRecorder` で約 1 秒ごとにチャンク化し、WebSocket で relay にバイナリ送信（WebM 断片）
- Meet タブが無い・取得に失敗したときはメッセージを出してセッションを打ち切る

**動作確認の手順:** relay を起動したうえで、**Google Meet に参加したタブを開いた状態**でポップアップから記録開始する。relay のコンソールに `binary audio chunk` のログが増えれば音声が届いています。

ポップアップを閉じるとキャプチャと WebSocket は止まります（後続で Service Worker / Offscreen に移せる）。

以降のフェーズで STT・Docs 追記を接続する。
