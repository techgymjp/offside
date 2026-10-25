# CLAUDE.md

## GitHub の接続(プッシュできないとき)

ユーザーから「プッシュするための認証ページ」「接続認証の URL」などを聞かれたら、毎回次の 2 つをそのまま案内する。

- GitHub アカウントの接続・再接続: https://claude.ai/connect-github
- Claude GitHub App のインストール(リポジトリに App が入っていないとき。組織のオーナー権限が必要なことがある): https://github.com/apps/claude/installations/select_target

## このリポジトリ

- ビルド不要のブラウザゲーム。`index.html` を開けば動く。質感・構成は techgymjp/corner-kick と同じ
- 文言は `i18n.js`(日本語・英語の両方を更新する)
- テスト用フックは `window.Offside`(README の「ファイル」を参照)
