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

Phase 1 では拡張の骨格のみです。ポップアップ等は Phase 2 以降で追加します。
