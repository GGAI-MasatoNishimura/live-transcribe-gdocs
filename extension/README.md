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
- 記録開始 / 記録停止（UI と `chrome.storage` の状態のみ。実際の音声・中継は未接続）

以降のフェーズで TabCapture・ローカル中継・STT を接続する。
