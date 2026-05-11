# Claude Desktop Mini-Window App 仕様書

## 概要

`Alt+Space` のショートカットキーで呼び出せるElectronベースのミニウィンドウアプリ。  
Anthropic API（Tool use）とローカルMCPサーバーを連携させ、Claudeと会話しながらNotion・Google Calendarの操作を行う。

---

## 技術スタック

| 項目 | 採用技術 |
|------|----------|
| フレームワーク | Electron (Node.js) |
| UI | HTML / CSS / Vanilla JS |
| LLM API | Anthropic API (`claude-sonnet-4-6`) / Tool use機能 |
| MCP連携 | `@modelcontextprotocol/sdk` (Electronメインプロセス内で実行) |
| Notion連携 | Notion向けMCPサーバー（ローカルプロセスとしてstdio実行） |
| Google Calendar連携 | Google Calendar向けMCPサーバー（ローカルプロセスとしてstdio実行） |
| 設定管理 | `.env` ファイル |
| システムプロンプト | `system_prompt.txt`（ユーザーが編集） |

---

## ディレクトリ構成

```text
claude-desktop/
├── main.js                  # Electronメインプロセス（MCPクライアント・API通信も担う）
├── preload.js               # セキュアなIPC bridge
├── renderer/
│   ├── index.html           # ミニウィンドウUI
│   ├── style.css            # スタイル
│   └── renderer.js          # UIロジック・IPC通信
├── system_prompt.txt        # ユーザープロファイル指示（ユーザーが編集する）
├── .env                     # APIキー・トークン類（git管理外）
├── .env.example             # 設定テンプレート
├── .gitignore
└── package.json
```

---

## ウィンドウ仕様

| 項目 | 値 |
|------|----|
| サイズ | 幅 600px × 高さ 500px |
| 位置 | 画面中央上部 |
| 常時最前面 | `alwaysOnTop: true` |
| フレーム | なし（`frame: false`）、角丸デザイン |
| 透過 | `transparent: true` |
| タスクバー表示 | なし（`skipTaskbar: true`） |
| 表示トリガー | `Alt+Space`（グローバルショートカット） |
| 非表示トリガー | `Esc` キー or ウィンドウ外クリック |

---

## UI仕様

```plaintext
┌─────────────────────────────────────┐
│  🤖 Claude          [最小化] [×]   │  ← タイトルバー（ドラッグで移動可）
├─────────────────────────────────────┤
│                                     │
│  [会話履歴エリア]                   │  ← スクロール可能
│  User: ○○○                         │
│  Claude: △△△                       │
│  (🔧 ツール実行中: Notion...)       │  ← Tool useのステータス表示
│                                     │
├─────────────────────────────────────┤
│  [入力テキストエリア]    [送信]     │  ← Enter で送信 / Shift+Enter で改行
└─────────────────────────────────────┘
```

- ダークテーマ（背景 `#1e1e2e`、テキスト `#cdd6f4`）
- メッセージはバブル形式
- ストリーミング表示対応（レスポンスをリアルタイムで流す）
- ツール呼び出し（Tool use）のステータスをUIに表示

---

## システム連携フロー（MCP & Anthropic API）

1. **初期化**: ElectronメインプロセスがNotionとGoogle CalendarのローカルMCPサーバーを子プロセスとして起動。
2. **ツール取得**: MCPサーバーから利用可能なツール一覧（JSON Schema）を取得。
3. **APIリクエスト**: ユーザーの入力、システムプロンプト、取得したツール一覧（`tools`）をAnthropic APIに送信。
4. **ツール実行**: Claudeがツール使用を決定した場合（`tool_use` ストップ理由）、Electron側で該当するMCPサーバーに実行要求を送り、結果（`tool_result`）を再度Claudeに返す。

### APIリクエストボディ（イメージ）

```jsonc
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "system": "<リクエスト時にsystem_prompt.txtから都度読み込んだ内容>",
  "tools": [
    // MCPサーバーから取得したツール定義を動的にマッピング
    {
      "name": "notion_append_block",
      "description": "Notionページにブロックを追加する",
      "input_schema": { }
    }
  ],
  "messages": [
    { "role": "user", "content": "明日の10時にカレンダーに予定を入れて" }
  ]
}
```

---

## 会話履歴

- セッション中は会話履歴を保持し、毎回 `messages` 配列に全履歴を含める。
- アプリ終了で履歴はリセット（永続化なし）。

---

## システムプロンプト（system_prompt.txt）

ユーザーがClaude.aiに設定しているユーザープリファレンスをそのままコピーして記載するファイル。

**仕様変更**: アプリ起動時ではなく、APIリクエストを送信する直前に都度ファイルを読み込む。これにより、ユーザーがファイルを編集した際にアプリの再起動が不要になる。

---

## 環境変数（.env）

```bash
# Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Notion (MCPサーバーに渡す用)
NOTION_API_KEY=secret_xxxxx

# Google Calendar (MCPサーバーに渡す用 / OAuth関連)
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REFRESH_TOKEN=xxxxx
```

---

## グローバルショートカット

| キー | 動作 |
|------|------|
| `Alt+Space` | ウィンドウ表示 / 非表示トグル |
| `Esc` | ウィンドウを非表示 |
| `Enter` | メッセージ送信 |
| `Shift+Enter` | 改行 |

---

## セキュリティ設定（Electron）

```javascript
// main.js の BrowserWindow 設定
webPreferences: {
  nodeIntegration: false,       // nodeIntegrationは無効
  contextIsolation: true,       // コンテキスト分離を有効
  preload: path.join(__dirname, 'preload.js')  // preload経由でIPC
}
```

- APIキー・MCPの通信ロジック・ファイル読み込み（`fs`）はすべてメインプロセスで行い、レンダラーには渡さない。
- `preload.js` の `contextBridge` 経由でチャットの送受信とステータス更新のみを公開。