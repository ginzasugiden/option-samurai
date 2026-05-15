# TASK: オプション項目修正侍 - セットアップ作業

## このTASK.mdについて

このファイルは **Claude Code への指示書** です。ユーザーは既に以下を完了しています:

- ローカルディレクトリ作成済み(あなたが今このTASK.mdを読んでいる場所)
- 必要なファイル一式を配置済み(`frontend/`, `gas/`, `.gitignore`, `README.md` など)

あなた(Claude Code)の仕事は、**配置済みのファイルを使って、GitHub と GAS にデプロイすることです**。
新しくコードを書く必要はありません(設定値の書き換えだけ)。

---

## 目的

楽天店舗のオプション項目を一括メンテするWebツール「オプション項目修正侍」をデプロイする。

- **フロントエンド**: GitHub Pages(Publicリポジトリ、静的ホスティング)
- **バックエンド**: Google Apps Script (Web App)
- **データストア**: Google Spreadsheet(認証情報 + 楽天APIキー)

## ゴール

1. GitHub に Public リポジトリが作られ、`main` ブランチが push されている
2. GitHub Pages が有効化されていて、フロントエンドが公開URLでアクセス可能
3. GAS プロジェクトが既存スプレッドシートにバインドされ、`clasp push` で同期している
4. GAS が Web App としてデプロイされ、URL が `frontend/config.js` に書き込まれている
5. GAS の `ALLOWED_ORIGINS` に GitHub Pages のオリジンが追加されている
6. ブラウザで GitHub Pages のURLを開くと、ログイン画面が表示される
7. `api_key` シートに登録済みのid/pwでログインできる

---

## Step 0: ユーザーへの確認(作業開始前に必ず聞く)

以下の情報を、ユーザーに **まとめて一度に** 確認してください:

1. **GitHubユーザー名**(例: `taro-yamada`)
   - 確認方法: `gh api user --jq .login` で取得可能
2. **スプレッドシートID**(`api_key` シートが入っているスプレッドシートのID)
   - URLの `/d/{ここ}/edit` の部分
3. **リポジトリ名**(デフォルト: `option-samurai`、変えたければ指定)

これらを聞いてから、まとめて作業開始。

## Step 1: 前提条件の確認

以下が揃っているか自動チェックして、不足があればユーザーに伝えて中断:

```bash
node -v        # v18以上推奨
git --version
gh --version
gh auth status # 認証済みであること
clasp -v       # なければ npm install -g @google/clasp を案内
```

`clasp login` が必要な場合もある(`~/.clasprc.json` が無ければ):

```bash
ls ~/.clasprc.json 2>/dev/null || echo "clasp loginが必要です"
```

## Step 2: 配置済みファイルの確認

現在のディレクトリで以下のファイルが揃っているか確認:

```bash
ls -la
# 期待: TASK.md, README.md, .gitignore, frontend/, gas/

ls frontend/
# 期待: index.html, app.js, style.css, config.js

ls gas/
# 期待: appsscript.json, Code.js
```

不足があればユーザーに伝えて中断。

## Step 3: git 初期化 & 初回コミット

```bash
# 既に git init 済みかチェック
if [ ! -d .git ]; then
  git init
  git branch -M main
fi

git add .
git commit -m "feat: initial commit - option-samurai skeleton"
```

## Step 4: GitHub Public リポジトリ作成 & push

```bash
gh repo create {リポジトリ名} --public --source=. --remote=origin --push
```

成功したら、リポジトリURLを取得して表示:

```bash
gh repo view --json url --jq .url
```

## Step 5: GitHub Pages 有効化

```bash
# 自分のGitHubユーザー名取得
OWNER=$(gh api user --jq .login)

# Pages を /frontend ディレクトリで有効化
gh api repos/$OWNER/{リポジトリ名}/pages \
  --method POST \
  --field "source[branch]=main" \
  --field "source[path]=/frontend"
```

失敗した場合(既に設定あり等)は PUT で上書き:

```bash
gh api repos/$OWNER/{リポジトリ名}/pages \
  --method PUT \
  --field "source[branch]=main" \
  --field "source[path]=/frontend"
```

GitHub Pages URL を取得:

```bash
gh api repos/$OWNER/{リポジトリ名}/pages --jq .html_url
```

→ 通常 `https://{owner}.github.io/{リポジトリ名}/frontend/` の形になる。
このURLを記録(後でGAS側に登録するため)。

## Step 6: GAS プロジェクト作成

```bash
cd gas/

# 既存スプレッドシートにバインドして GAS プロジェクト作成
clasp create --type sheets --title "オプション項目修正侍" --parentId "{SPREADSHEET_ID}"
```

**注意**:
- `clasp create` は対話的に挙動する場合がある
- 既に `.clasp.json` が存在する場合はスキップ
- 成功すると `.clasp.json` と `appsscript.json` が生成される
  - **既に配置済みの `appsscript.json` を上書きされないよう注意**
  - もし上書きされたら、リポジトリ配置済みの内容で復元

## Step 7: GAS コードを push

```bash
# まだ gas/ にいる前提
clasp push --force
```

確認:
```bash
clasp open  # ブラウザでGASエディタが開く、Code.js が見えればOK
```

## Step 8: GAS Web App としてデプロイ

```bash
clasp deploy --description "v1.0 initial deploy"
```

デプロイメントID取得:
```bash
clasp deployments
# → デプロイメントIDの一覧が出る。最新の "@HEAD" ではない方のIDをメモ
```

### Web App URL の取得 - 重要

`clasp deploy` 直後の出力には Web App URL は含まれていません。
GASエディタを開いてURLを確認してもらう必要があります:

```bash
clasp open
```

ユーザーに以下の手順を案内してください:

> GASエディタが開いたら、右上の「デプロイ」→「デプロイを管理」を開いてください。
> 表示されたWeb App URL(`https://script.google.com/macros/s/AKfycby.../exec` の形式)を
> コピーして、ここに貼り付けてください。
>
> ※ アクセス権設定もここで確認してください:
> - 「次のユーザーとして実行」: 自分
> - 「アクセスできるユーザー」: 全員(匿名アクセス)
>
> もしアクセス権が違ったら、鉛筆アイコンで編集して「全員」に変更し、
> 「デプロイ」を再度押してください。

ユーザーがURLを返してくれるまで待つ。

## Step 9: フロント config.js に GAS URL を埋め込み

ユーザーから受け取った Web App URL で `frontend/config.js` を更新:

```bash
cd ..  # プロジェクトルートに戻る
```

`frontend/config.js` の `GAS_URL` の値(現在は `'https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID_HERE/exec'`)を、ユーザーから受け取ったURL全体で置き換える。

文字列置換のヒント:
```bash
# macOS / BSD系のsed
sed -i.bak "s|https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID_HERE/exec|{ユーザーから貰ったURL}|" frontend/config.js
rm frontend/config.js.bak

# Linux系のsed
sed -i "s|https://script.google.com/macros/s/PASTE_YOUR_DEPLOYMENT_ID_HERE/exec|{ユーザーから貰ったURL}|" frontend/config.js
```

確認:
```bash
grep GAS_URL frontend/config.js
# → 正しいURLが入っていればOK
```

## Step 10: GAS の ALLOWED_ORIGINS に GitHub Pages オリジン追加

Step 5 で取得した GitHub Pages URL のオリジン部分(例: `https://taro-yamada.github.io`)を
`gas/Code.js` の `ALLOWED_ORIGINS` 配列に追加。

現状 `Code.js` には以下のようにコメントアウトされた行があります:
```javascript
const ALLOWED_ORIGINS = [
  // 'https://YOUR_GITHUB_USERNAME.github.io',
  // 'http://localhost:8000',
];
```

これを以下に編集:
```javascript
const ALLOWED_ORIGINS = [
  'https://{owner}.github.io',
  'http://localhost:8000',  // ローカル開発用
];
```

## Step 11: GAS を再 push & 再デプロイ

```bash
cd gas/
clasp push --force

# 既存デプロイメントを更新(URLを変えないため -i フラグで既存IDを指定)
clasp deployments
# → 既存のデプロイメントIDをメモ

clasp deploy -i {DEPLOYMENT_ID} --description "v1.1 add origins"
```

## Step 12: GitHub に push

```bash
cd ..  # プロジェクトルートに戻る
git add .
git commit -m "feat: configure GAS URL and allowed origins"
git push
```

## Step 13: 動作確認

1〜2分待ってから(GitHub Pagesの反映待ち)、ユーザーに以下を案内:

```
セットアップ完了です。

【GitHub Pages URL】
https://{owner}.github.io/{リポジトリ名}/frontend/

【GAS Web App URL】
{ユーザーから貰ったURL}

【リポジトリ】
https://github.com/{owner}/{リポジトリ名}

ブラウザで GitHub Pages URL を開いて、api_keyシートのid/pwで
ログインできるか試してください。

うまく動かない場合は、ブラウザのDevToolsのコンソール / ネットワークタブで
エラーを確認してください。
```

---

## トラブルシューティング

### `gh repo create` でエラー

- 同名のリポジトリが既にある → 別の名前を提案、または手動削除
- 認証エラー → `gh auth login` を案内

### `clasp create` でエラー

- 既に `.clasp.json` がある → スキップ
- 認証エラー → `clasp login` を案内
- スプレッドシートIDが間違っている → ユーザーに確認

### CORS エラーが出る

- `gas/Code.js` の `ALLOWED_ORIGINS` を再確認
- 再デプロイができているか確認(`clasp deploy -i {ID}` で既存に上書き)
- ブラウザのDevTools → Network → リクエストヘッダーの Origin を確認

### "Script function not found: doPost" エラー

- `clasp push` が成功しているか確認
- `gas/Code.js` に `doPost` 関数が定義されているか確認

### ログインしても画面遷移しない

- ブラウザDevTools → Network → fetchリクエストのレスポンスを確認
- 200だが ok:false → エラーメッセージを確認
- スプレッドシートに正しく id/pw のレコードが入っているか確認

### `gh api ... pages` で 404

- リポジトリのPushが完了しているか確認
- 1〜2分待ってから再実行

---

## 開発フロー(セットアップ後にユーザーに案内)

### フロント修正時

```bash
# frontend/ 配下を編集
git add frontend/
git commit -m "fix: ..."
git push
# → 1〜2分でGitHub Pagesに反映
```

### GAS修正時

```bash
cd gas/
# Code.js を編集
clasp push --force
clasp deployments  # 既存のデプロイメントIDを確認
clasp deploy -i {DEPLOYMENT_ID} --description "..."
# → 即座にWeb Appに反映、URLは変わらない
```

### ローカル動作確認

```bash
cd frontend/
python3 -m http.server 8000
# → http://localhost:8000 で確認
# (GAS側の ALLOWED_ORIGINS に http://localhost:8000 を入れてあれば動く)
```
