# live-transcribe-gdocs

Google Meet の音声をリアルタイムで文字起こしし、Google ドキュメントへ追記する MVP をこのリポジトリで進めます。

## ドキュメント

- [システム要件](docs/system-requirements.md)
- [実装計画（フェーズ順）](docs/implementation-plan.md)

## コード配置（MVP）

| ディレクトリ | 役割 |
|--------------|------|
| [extension/](extension/) | Chrome 拡張機能（Manifest V3）。Meet タブ音声の取得とローカル中継への送信を担当する予定。 |
| [relay/](relay/) | ローカル中継アプリ（Node.js）。音声認識・Google Docs 追記などを担当する予定。 |

Phase 1 ではディレクトリと最小ファイルのみです。以降のフェーズで中身を足していきます。
