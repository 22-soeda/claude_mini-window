# Claude Mini-Window

`Alt+Space` で呼び出せる Electron 製ミニウィンドウ型 AI アシスタント。  
Claude と会話しながら **Notion・Google Calendar** をキーボードだけで操作できます。

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 特徴

- **ホットキー呼び出し** — `Alt+Space` でどこからでも即座に呼び出し・非表示
- **MCP 連携** — Notion / Google Calendar を Claude が直接操作
- **ストリーミング表示** — レスポンスをリアルタイムで流す
- **カスタマイズ可能なシステムプロンプト** — `system_prompt.txt` を編集するだけ（再起動不要）
- **常時最前面** — 作業を邪魔しないコンパクトなウィンドウ

---

## スクリーンショット

```
┌─────────────────────────────────────┐
│  🤖 Claude          🗑 — ✕          │  ← ドラッグで移動
├─────────────────────────────────────┤
│  あなた                              │
│                    今日の予定は？   │
│                                     │
│  Claude                             │
│  📅 ツール実行中: list events       │
│  今日は 14:00 に MTG があります。   │
│                                     │
├─────────────────────────────────────┤
│  メッセージを入力…          [送信]  │
└─────────────────────────────────────┘
```

---

## 必要環境

| 項目 | バージョン |
|------|-----------|
| Node.js | 18 以上 |
| npm | 9 以上 |
| OS | Windows / macOS / Linux |

---

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/YOUR_USERNAME/claude_mini-window.git
cd claude_mini-window
```

### 2. 依存パッケージをインストール

```bash
npm install
```

### 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env` を編集して各キーを入力します。

```bash
# 必須
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Notion を使う場合
NOTION_API_KEY=secret_xxxxx

# Google Calendar を使う場合
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REFRESH_TOKEN=xxxxx
```

### 4. システムプロンプトを設定（任意）

```bash
cp system_prompt.example.txt system_prompt.txt
```

`system_prompt.txt` を自分の好みに合わせて編集します。ファイルは **API リクエスト毎に再読み込み** されるため、アプリの再起動は不要です。

### 5. 起動

```bash
npm start
```

起動後はタスクトレイ常駐状態になります。`Alt+Space` でウィンドウを呼び出してください。

---

## 操作方法

| 操作 | 動作 |
|------|------|
| `Alt+Space` | ウィンドウ 表示 / 非表示 トグル |
| `Esc` | ウィンドウを非表示 |
| `Enter` | メッセージ送信 |
| `Shift+Enter` | 改行 |
| ウィンドウ外クリック | 自動的に非表示 |
| 🗑 ボタン | 会話履歴をクリア（新しい会話を開始） |
| — ボタン | ウィンドウを最小化 |
| ✕ ボタン | ウィンドウを非表示（アプリは終了しない） |

---

## MCP サーバー設定

### Notion

Notion [インテグレーション](https://www.notion.so/my-integrations) でトークンを発行し、`.env` の `NOTION_API_KEY` に設定します。

```bash
# .env
NOTION_API_KEY=secret_xxxxx
```

初回起動時に `npx @notionhq/notion-mcp-server` が自動ダウンロードされます。

### Google Calendar

[Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアント ID を作成し、リフレッシュトークンを取得して設定します。

```bash
# .env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REFRESH_TOKEN=xxxxx
```

### カスタム MCP コマンド

デフォルトとは異なる MCP サーバーを使う場合は `.env` でコマンドを上書きできます。

```bash
# Notion 用コマンドを差し替える場合
NOTION_MCP_COMMAND=npx
NOTION_MCP_ARGS=-y @notionhq/notion-mcp-server

# Google Calendar 用コマンドを差し替える場合
GCAL_MCP_COMMAND=npx
GCAL_MCP_ARGS=-y @google-labs/calendar-mcp
```

> **注意:** API キーが設定されていない場合、対応する MCP サーバーはスキップされます。  
> どちらかが起動に失敗しても、ツールなしのチャットとして動作し続けます。

---

## システムプロンプトのカスタマイズ

`system_prompt.txt` を編集することで Claude の振る舞いを変更できます。

```
system_prompt.txt を直接編集してください（アプリの再起動不要）
```

テンプレートとして `system_prompt.example.txt` を用意しています。個人の作業ルールや好みに合わせて自由に書き換えてください。

> `system_prompt.txt` は個人情報を含む場合があるため `.gitignore` に含まれています。

---

## 技術仕様

| 項目 | 内容 |
|------|------|
| フレームワーク | Electron |
| LLM | `claude-sonnet-4-6`（`.env` の `CLAUDE_MODEL` で変更可） |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Anthropic SDK | `@anthropic-ai/sdk` |
| ウィンドウサイズ | 600 × 500 px（固定） |
| ウィンドウ位置 | 画面中央上部（y=80px） |
| 常時最前面 | 有効 |
| ストリーミング | 有効（レスポンスをリアルタイムで表示） |
| 会話履歴 | セッション中のみ保持（アプリ終了でリセット） |

### ディレクトリ構成

```
claude_mini-window/
├── main.js                  # メインプロセス（MCP・API・ウィンドウ管理）
├── preload.js               # セキュアな IPC ブリッジ
├── renderer/
│   ├── index.html           # UI
│   ├── style.css            # ダークテーマ
│   └── renderer.js          # UI ロジック
├── logos/                   # アプリアイコン候補（SVG）
├── system_prompt.example.txt  # システムプロンプトのテンプレート
├── .env.example             # 環境変数のテンプレート
├── .gitignore
└── package.json
```

### セキュリティ設定

- `nodeIntegration: false` — レンダラー側で Node.js API を無効化
- `contextIsolation: true` — レンダラーとメインプロセスのコンテキストを分離
- API キー・MCP 通信はすべてメインプロセスで処理
- `preload.js` の `contextBridge` 経由でチャット送受信のみ公開

---

## トラブルシューティング

### ウィンドウが表示されない

`Alt+Space` が他のアプリに占有されている可能性があります。  
タスクマネージャーで `electron` プロセスが起動しているか確認してください。

### MCP サーバーが接続できない

- `npx` が PATH に通っているか確認: `npx --version`
- 初回実行時はパッケージのダウンロードに時間がかかります
- API キーや OAuth トークンが正しいか再確認してください

### `ANTHROPIC_API_KEY` エラー

`.env` ファイルが存在するか、正しい場所（プロジェクトルート）にあるか確認してください。

```bash
# Windows (PowerShell)
ls .env

# macOS / Linux
ls -la .env
```

---

## ライセンス

[MIT](LICENSE)
