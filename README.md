# オプション項目修正侍 ⚔

楽天店舗のオプション項目を一括検索・削除するWebツール。

## アーキテクチャ

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  GitHub Pages           │  fetch  │  GAS Web App             │
│  (静的フロントエンド)    │ ──────▶ │  - 認証(id/pw照合)       │
│                         │  CORS   │  - 楽天RMS API中継        │
│  frontend/              │         │  - 操作ログ記録            │
└─────────────────────────┘         └──────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────────┐
                                    │  Google Spreadsheet  │
                                    │  - api_key シート     │
                                    │  - operation_log     │
                                    └──────────────────────┘
```

## ディレクトリ構造

```
option-samurai/
├── TASK.md              # Claude Code セットアップ手順書
├── README.md            # このファイル
├── .gitignore
├── frontend/            # GitHub Pages デプロイ対象
│   ├── index.html       # ログイン画面 + メイン画面
│   ├── app.js           # フロントロジック
│   ├── style.css        # 和風UI
│   └── config.js        # GAS Web App URL
└── gas/                 # clasp デプロイ対象
    ├── appsscript.json
    └── Code.js          # 認証 + 楽天API中継
```

## セキュリティ設計

公開リポジトリ + 公開GitHub Pages という構成だが、以下の多層防御で守る:

1. **楽天APIキーは絶対にフロントに出さない**
   - `licenseKey` / `serviceSecret` はスプレッドシートに保存、GAS側でのみ使用
   - フロントは GAS Web App 越しに楽天APIを叩く

2. **真の認証関門は id/pw**
   - GAS URL が公開リポジトリで見えても、id/pw がなければ何もできない
   - `api_key` シートに登録済みのユーザーのみログイン可能

3. **CORS による Origin 制限**
   - GAS 側で `ALLOWED_ORIGINS` を定義し、指定オリジン以外からのリクエストは拒否
   - GitHub Pages のオリジン以外は CORS ヘッダーを返さない

4. **セッション管理**
   - UUID トークンを発行、PropertiesService に12時間保存
   - フロントは sessionStorage で保持(ブラウザ閉じるまで)

5. **操作ログ**
   - 全更新操作を `operation_log` シートに記録(誰が・いつ・何を)

## セットアップ

`TASK.md` を Claude Code に渡して、ガイドに従ってセットアップしてください。

簡単な流れ:

1. ローカルでプロジェクト初期化
2. GitHub に Public リポジトリ作成 (`gh repo create`)
3. GitHub Pages 有効化
4. `clasp create` で GAS プロジェクト作成
5. `clasp push` でコードを GAS にアップロード
6. `clasp deploy` で Web App デプロイ
7. デプロイURLを `frontend/config.js` に記載
8. GAS の `ALLOWED_ORIGINS` に GitHub Pages のオリジン追加
9. 再デプロイ → 完了

## 開発フロー

### フロント変更

```bash
# frontend/ を編集
git add frontend/
git commit -m "..."
git push
# → 1〜2分でGitHub Pagesに反映
```

### GAS変更

```bash
cd gas/
# Code.js を編集
clasp push --force
clasp deploy -i {DEPLOYMENT_ID} --description "..."
# → 即座にWeb Appに反映、URLは変わらない
```

## ライセンス

MIT(または運用に応じて変更)
