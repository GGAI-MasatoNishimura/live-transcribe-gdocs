# live-transcribe-gdocs

Google Meet の音声とマイクをミックスしてリアルタイムで文字起こしし、Google ドキュメントへ追記する MVP をこのリポジトリで進めます。

## ドキュメント

- [システム要件](docs/system-requirements.md)
- [実装計画（フェーズ順）](docs/implementation-plan.md)
- [MVP 動作確認チェックリスト（Phase 10）](docs/mvp-operation-checklist.md)
- [GCP 開発メモ（サービスアカウントのメール）](docs/developer-memo-gcp.md)

## コード配置（MVP）

| ディレクトリ | 役割 |
|--------------|------|
| [extension/](extension/) | Chrome 拡張（MV3）。Meet タブ ID の記録、タブ音声とマイクのミックス、ローカル relay への WebSocket。 |
| [relay/](relay/) | ローカル中継（Node.js）。WebSocket 受信、Speech-to-Text、Google Docs 末尾追記。 |

---

## 起動方法（まずはここから）

以下は **WSL や Linux のターミナル（bash）** を想定したコマンドです。パスは自分の環境に合わせて読み替えてください。

### 必要なもの

- **Node.js** 20 以上（`relay/package.json` の `engines` に準拠）
- **Google Chrome**（拡張機能を読み込む）
- 文字起こしとドキュメント追記を行う場合は **GCP のサービスアカウント JSON キー** と、有効化済みの **Speech-to-Text API**・**Google Docs API**（詳細は [relay/README.md](relay/README.md)）

### 初回だけ行うこと

#### 1. リポジトリのディレクトリへ移動

クローン済みのパスに合わせてください。

```bash
cd /path/to/live-transcribe-gdocs
```

#### 2. relay の依存パッケージを入れる

```bash
cd relay
npm install
cd ..
```

#### 3. GCP の JSON キーを置く

リポジトリの **`secrets/`** に、ダウンロードしたサービスアカウントの JSON を置きます（ファイル名は分かりやすい名前でよいです）。`secrets/*.json` は Git にコミットされません。

例:

```bash
# 例: ホームからコピーした場合（パスは実際のファイル名に合わせる）
cp ~/Downloads/your-service-account.json ./secrets/live-transcribe-gdocs-sa.json
```

#### 4. 出力先の Google ドキュメントを共有する

[docs/developer-memo-gcp.md](docs/developer-memo-gcp.md) にある **サービスアカウントのメールアドレス**を、文字起こし結果を書き込みたいドキュメントに **編集者** として追加します。

---

### 起動のたびにやること（relay）

**ターミナル 1** で、リポジトリの **ルート**から次を順に実行します。  
`GOOGLE_APPLICATION_CREDENTIALS` は **JSON ファイルの絶対パス** が入るようにしてください（下ではルートの `secrets` を指す例です）。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/secrets/live-transcribe-gdocs-sa.json"
```

```bash
cd relay
npm start
```

次のようなログが出ていれば、中継は待ち受けています。

- `[relay] WebSocket listening on ws://127.0.0.1:8765`
- `GOOGLE_APPLICATION_CREDENTIALS` がある場合は STT と Docs 用のログも出ます

**止め方:** そのターミナルで `Ctrl+C` します。

**補足:** `export` は **そのターミナルにだけ** 効きます。ターミナルを閉じたり新しく開いたあとは、もう一度 `export` してから `npm start` してください。

---

### Chrome 拡張機能の読み込み（初回または更新後）

1. Chrome のアドレスバーに `chrome://extensions` と入力して開く
2. 右上の **デベロッパーモード** をオンにする
3. **パッケージ化されていない拡張機能を読み込む** を押す
4. このリポジトリの **`extension`** フォルダを選ぶ（中身を開いた先ではなく、`extension` フォルダそのものを指定）

コードや `manifest.json` を変えたあとは、同じ画面で当該拡張の **再読み込み** を押します。

---

### 会議で使うときの操作順（ざっくり）

1. あらかじめ **relay** を `npm start` したターミナルを動かしたままにする
2. **Google Meet** に参加し、Meet のタブを **手前（アクティブ）** にする
3. ツールバーの **拡張アイコン**からポップアップを開く
4. **出力先の Google ドキュメントの URL** を入力する
5. **記録開始** を押す（この時点で Meet が手前でないとエラーになります）
6. 開いた **録音タブ**（タイトルに「録音（Meet + マイク）」など）を選ぶ
7. **Meet とマイクを許可して録音開始** を押し、ブラウザの許可に従う
8. 必要なら **Google ドキュメントのタブに切り替えて** 共同編集してよい（音声ははじめに選んだ Meet タブから取り続けます）
9. 終了するときは **録音タブ** の **録音停止** を押す（タブが閉じます）

詳細とトラブル時の確認項目は [docs/mvp-operation-checklist.md](docs/mvp-operation-checklist.md) を参照してください。

---

## 認証なしで動かす場合

`GOOGLE_APPLICATION_CREDENTIALS` を設定せずに `npm start` しても **WebSocket の待ち受け**は動きますが、**文字起こしとドキュメント追記は行われません**（受信した音声はログに出る程度です）。動作確認だけなら拡張から接続して `binary audio chunk` のログを見る、という使い方もできます。

---

## 環境変数の一覧（relay）

よく触るもの以外は [relay/README.md](relay/README.md) の表を参照してください。STT のしきい値などを変えたいときに使います。
