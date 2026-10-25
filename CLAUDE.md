# CLAUDE.md

## GitHub の接続(プッシュできないとき)

ユーザーから「プッシュするための認証ページ」「接続認証の URL」などを聞かれたら、毎回次の 2 つをそのまま案内する。

- GitHub アカウントの接続・再接続: https://claude.ai/connect-github
- Claude GitHub App のインストール(リポジトリに App が入っていないとき。組織のオーナー権限が必要なことがある): https://github.com/apps/claude/installations/select_target

## このリポジトリ

- ゲーム名は「オフサイドトラップ」(英語: Offside Trap)。リポジトリ名は offside。ビルド不要のブラウザゲーム。`index.html` を開けば動く。質感・構成は techgymjp/corner-kick と同じ
- テスト用フックは `window.Offside`(README の「ファイル」を参照)
- JS・CSS を変えたら、`index.html` の読み込みの `?v=番号` を 1 つ上げる(ブラウザに古いファイルが残って、変更が反映されないのを防ぐ)

## 画面の作り(必ず守る)

- トップページ(タイトル画面)とは別に、操作説明の画面を用意する。トップページには細かい説明文を並べない(スマホでは文字が小さくなって読めない)
- トップページは、題名・キャッチコピー・ベスト記録・「タップでキックオフ」などを大きな文字で出し、下に「操作説明」(と「ルール」)のボタンを置く
- 操作説明の画面は大きな文字で書き、見出しの横に「プレイする」「タイトルに戻る」を置く(スクロールしなくても押せるように)
- このゲームでは、操作説明は `#howto`、オフサイドのルールは `#rules`(どちらも `index.html` の `.page`)
- Android アプリでは、操作説明の画面にもバナー広告を出し、そこから「タイトルに戻る」ときと「プレイする」ときは全画面広告を出す

## 英語対応(必ず守る)

ゲームは日本語と英語の両方に対応している。端末の言語が日本語なら日本語、それ以外は英語で表示し、タイトル画面左下のボタンで切り替えられる。

- 画面に出す文字(キャンバスの描画・HTML・シェア文・成績画像・ルールの説明)は、すべて `i18n.js` の `ja` と `en` の**両方**にキーを追加して `t('キー')` で出す。日本語や英語を直接コードに書かない
- HTML の要素は `data-i18n`(文字)/ `data-i18n-html`(太字つきの文)/ `data-i18n-href`(リンク先)で翻訳する
- `en` には日本語の文字(「・」などの記号も含む)を入れない。追加後に `ja` と `en` のキーがそろっているか確認する
- 英語は日本語より長くなりやすいので、英語に切り替えた画面でもはみ出さないか確認する
- README も日本語の説明に加えて、末尾の「English」の節を更新する

## English summary

This game supports Japanese and English (auto-selected from the device language, switchable on the title screen). Every user-facing string must be added to both `ja` and `en` in `i18n.js` and shown via `t('key')`; never hard-code text. Check the English layout for overflow, and keep the README's English section up to date.

## Android アプリ

- 構成は techgymjp/jet-fighter の `docs/ANDROID_PORTING.md` と techgymjp/corner-kick と同じ(Capacitor 8)。パッケージ名は `jp.techgym.offside`
- ビルドは GitHub Actions(`.github/workflows/android.yml`)。クラウドの Claude Code では Android SDK を入れられない
- 動作確認用 APK のリリース画面: https://github.com/techgymjp/offside/releases/tag/android-latest (QR: `docs/apk-qr.png`)
- 広告は `ads.js`(本番の広告ユニット ID は `UNITS.production`)、AdMob のアプリ ID は `android/app/src/main/res/values/strings.xml` の `admob_app_id`
- 広告を出す場面: バナーはタイトル(操作説明・ルールのページを含む)・ポーズ・結果画面だけ、全画面広告はプレイを始めるとき・「もう一度」「タイトルへ」・操作説明/ルールのページから「タイトルに戻る」・「再開」のたび、リワード広告は失点したプレーのやり直し(1 ゲーム 5 回)
- 署名鍵(upload.jks)やパスワードは、チャットに貼らない・コミットしない(GitHub Secrets に入れる)
