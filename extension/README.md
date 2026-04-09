# Chrome 拡張機能（Manifest V3）

## このディレクトリの責務

- Google Meet タブの音声取得（TabCapture）とマイク取得を **AudioContext でミックス**し、1ストリームとして relay へ送る
- ポップアップではドキュメント URL と記録開始のみ（**記録開始の直前に Meet を手前にしてタブ ID を保存**）
- 録音・停止は **`mic.html` 録音タブ**で行う

音声認識や Google ドキュメント API への書き込みは **ここでは行わず**、[relay/](../relay/) に任せる想定です。

## 開発時の読み込み方

1. Chrome で `chrome://extensions` を開く
2. 「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」で、この `extension` フォルダを指定する

## Phase 2 までに含まれるもの

- ツールバーアイコンから開くポップアップ
- Google ドキュメント URL 入力
- URL からドキュメント ID を表示（正しい形式のとき）
- 記録開始（録音停止は録音タブ側）

## Phase 5 までに含まれるもの

- 録音タブ（`mic.html`）が `ws://127.0.0.1:8765`（既定）へ WebSocket でローカル中継に接続し、`hello` メッセージでドキュメント ID を送る
- 中継が応答するまでのステータス表示、接続失敗時の案内

**動作確認の手順:** 先に [relay/](../relay/) で `npm start` を起動してから、拡張機能を再読み込みし、手順どおりに録音タブで接続する。

## Phase 6 までに含まれるもの

- `tabCapture` と `tabs` と `activeTab`、および `https://meet.google.com/*` の権限
- **記録開始を押した瞬間**にアクティブなタブが `https://meet.google.com/` であることを要求し、その **タブ ID を `pendingMixSession` に保存**する。録音タブでは **保存したタブ ID** に対して Tab Capture するため、**録音開始後はドキュメントなど別タブに切り替えても、同じ Meet から音声を取り続けられる**
- マイクは `getUserMedia({ audio: true })`。両ストリームを `audioMix.js`（`AudioContext` + `MediaStreamDestination`）でミックスしてから `MediaRecorder` に渡す。**タブキャプチャで Meet の音がスピーカーに出なくなる挙動への対策として、ミックス前の Meet タブ音声だけを `AudioContext.destination` へモニター出力する**（マイクはモニターしない。既定ゲイン 1、オプション `meetTabMonitorGain` で 0 に無効化可能）
- `MediaRecorder` で約 1 秒ごとにチャンク化し、WebSocket で relay にバイナリ送信（WebM 断片）
- Meet が記録開始時に前面でない場合はポップアップでメッセージを出し、録音タブを開かない

**動作確認の手順:** relay を起動したうえで、**Meet を手前にした状態**でポップアップから URL を入れて記録開始 → 開いた録音タブで「Meet とマイクを許可して録音開始」→ relay のコンソールに `binary audio chunk` が増えればよい。

**録音タブ（`mic.html`）:** バックグラウンドで開き、**「Meet とマイクを許可して録音開始」**を押したタイミングでタブ音声取得とマイク許可を順に行う（Meet のピクチャーインザピクチャー案内と重なりにくくするため）。**録音停止**で録音を終了し、タブを閉じる。

## Phase 7 までに含まれるもの（relay 側）

- `GOOGLE_APPLICATION_CREDENTIALS` を設定したとき、relay が受け取った WebM を ffmpeg で PCM 化し、**Google Cloud Speech-to-Text** で文字起こし（同期 recognize、確定テキストのみ扱う）
- 結果は WebSocket で `transcript` メッセージとして拡張へ送り、**録音タブ**のステータスに短く表示する

認証キーが無い環境では従来どおりバイナリ受信ログのみです。

## Phase 8 までに含まれるもの（relay 側）

- 同じ `GOOGLE_APPLICATION_CREDENTIALS` で **Google Docs API** を呼び、確定テキストを **指定ドキュメントの末尾**へ追記する（詳細は [relay/README.md](../relay/README.md)）
- 出力先ドキュメントは、サービスアカウントのメールに **編集権限で共有**しておく必要がある

## Phase 9 までに含まれるもの

- ポップアップに、共有設定の目安（リンクで編集可）と「システムは末尾追記のみで既存行を上書きしない」旨の短い案内
- relay 側では追記行に既定で `[Gemini] ` プレフィックスを付け、人間の `[補足]` など（要件の書き方）と区別しやすくする（環境変数で変更可）

以降は Phase 10 の総合動作確認など。
