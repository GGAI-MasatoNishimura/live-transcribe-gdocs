# システム要件定義：リアルタイム議事録共同編集システム

## 1. 全体アーキテクチャ（Googleエコシステム完結）

- 実装形態：Google Chrome拡張機能 (Manifest V3)
- 対象ツール：Google Meet (ブラウザ版)
- 出力先：Google ドキュメント
- インフラ：サーバーレス (拡張機能内で処理を完結)

## 2. 使用技術・API

- 音声取得：Chrome TabCapture API / Web Audio API
- 音声認識(STT)：Google Cloud Speech-to-Text API (StreamingRecognize)
- 文書操作：Google Docs API (`documents.batchUpdate`)
- ユーザー認証：Google OAuth 2.0 (`chrome.identity` APIを利用)

## 3. 処理フロー（データパイプライン）

### [Phase 1: キャプチャ]

拡張機能のポップアップから「記録開始」を実行。TabCapture APIが対象タブ（Google Meet）の音声をストリームとして取得する。

### [Phase 2: ストリーミング文字起こし]

取得した音声ストリームをGoogle Cloud Speech-to-Text APIへ連続的に送信。APIからリアルタイムに返ってくる「確定済みのテキスト（isFinal: true）」を受信する。

### [Phase 3: バッファリング処理（重要）]

Google Docs APIの利用制限（Rate Limit）によるエラーを防ぐため、受信したテキストを即座に書き込まず、拡張機能内の変数（バッファ）に一時ストックする。

### [Phase 4: ドキュメント更新（3秒バッチ）]

非同期のタイマー処理により、3秒（3000ms）ごとに以下の処理を実行する。

1. バッファにテキストが存在するか確認。
2. 存在する場合、Google Docs APIの `batchUpdate` (InsertTextRequest) を実行し、指定されたドキュメントの末尾にテキストを追記（改行含む）。
3. 書き込み成功後、バッファをクリアする。

## 4. ユーザー体験（UX）

- ホスト（拡張機能利用者）：会議開始時に拡張機能をONにし、出力先ドキュメントのIDを指定するだけ。
- 参加者（共同編集者）：アカウント不要でURLからドキュメントに参加。上部から3秒ごとに文字起こしが降ってくるため、その下部で自由にメモや要約を共同編集する。
