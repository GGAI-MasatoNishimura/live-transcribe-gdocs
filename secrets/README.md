# secrets フォルダ

ここに **GCP サービスアカウントの JSON キー** を置く（ファイル名は任意。例: `live-transcribe-gdocs-sa.json`）。

- `*.json` は `.gitignore` で無視される。誤ってコミットしない。
- ダウンロードしたキーをこのフォルダにコピーする。

## 環境変数（relay を起動する前）

プロジェクトのルートで次のように **絶対パス** を指定する。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/secrets/あなたが置いたファイル名.json"
```

`relay/` で起動するときも、上の `export` は **ルートで実行したあと** `cd relay` するか、または JSON のフルパスを直接書く。

## Google ドキュメント

対象ドキュメントを、サービスアカウントのメール（`docs/developer-memo-gcp.md` に記載）に **編集者** で共有する。
