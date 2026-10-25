# CLAUDE.md

## GitHub の接続(プッシュできないとき)

ユーザーから「プッシュするための認証ページ」「接続認証の URL」などを聞かれたら、毎回次の 2 つをそのまま案内する。

- GitHub アカウントの接続・再接続: https://claude.ai/connect-github
- Claude GitHub App のインストール(リポジトリに App が入っていないとき。組織のオーナー権限が必要なことがある): https://github.com/apps/claude/installations/select_target

## このリポジトリ

- ゲーム名は「オフサイドトラップ」(英語: Offside Trap)。リポジトリ名は offside。ビルド不要のブラウザゲーム。`index.html` を開けば動く。質感・構成は techgymjp/corner-kick と同じ
- テスト用フックは `window.Offside`(README の「ファイル」を参照)
- JS・CSS を変えたら、`index.html` の読み込みの `?v=番号` を 1 つ上げる(ブラウザに古いファイルが残って、変更が反映されないのを防ぐ)

## 英語対応(必ず守る)

ゲームは日本語と英語の両方に対応している。端末の言語が日本語なら日本語、それ以外は英語で表示し、タイトル画面左下のボタンで切り替えられる。

- 画面に出す文字(キャンバスの描画・HTML・シェア文・成績画像・ルールの説明)は、すべて `i18n.js` の `ja` と `en` の**両方**にキーを追加して `t('キー')` で出す。日本語や英語を直接コードに書かない
- HTML の要素は `data-i18n`(文字)/ `data-i18n-html`(太字つきの文)/ `data-i18n-href`(リンク先)で翻訳する
- `en` には日本語の文字(「・」などの記号も含む)を入れない。追加後に `ja` と `en` のキーがそろっているか確認する
- 英語は日本語より長くなりやすいので、英語に切り替えた画面でもはみ出さないか確認する
- README も日本語の説明に加えて、末尾の「English」の節を更新する

## English summary

This game supports Japanese and English (auto-selected from the device language, switchable on the title screen). Every user-facing string must be added to both `ja` and `en` in `i18n.js` and shown via `t('key')`; never hard-code text. Check the English layout for overflow, and keep the README's English section up to date.
