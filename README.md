# live-transcribe-gdocs

Google Meet の音声をリアルタイムで文字起こしし、Google ドキュメントへ追記する MVP をこのリポジトリで進めます。

## ドキュメント

- [システム要件](docs/system-requirements.md)
- [実装計画（フェーズ順）](docs/implementation-plan.md)
- [MVP 動作確認チェックリスト（Phase 10）](docs/mvp-operation-checklist.md)

## コード配置（MVP）

| ディレクトリ | 役割 |
|--------------|------|
| [extension/](extension/) | Chrome 拡張（MV3）。Meet タブの Tab Capture、ローカル relay への WebSocket、ドキュメント URL の指定。 |
| [relay/](relay/) | ローカル中継（Node.js）。WebSocket 受信、Speech-to-Text、Google Docs 末尾追記。 |

## ざっくり起動の流れ

1. [relay の README](relay/README.md) に従い `GOOGLE_APPLICATION_CREDENTIALS`（任意だが STT と Docs に必要）を設定できるようにする。
2. `relay` で `npm install` のあと `npm start`。
3. Chrome に `extension` フォルダを読み込み、Meet を手前にした状態でポップアップから記録開始。

細かい手順とエラー確認は [MVP 動作確認チェックリスト](docs/mvp-operation-checklist.md) を参照してください。
