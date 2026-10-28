# iOS 版をビルドして App Store に出す手順（Mac での作業）

オフサイドトラップの iOS 版は、Android 版と同じ Capacitor で作っています（`ios/` フォルダ）。
構成は techgymjp/jet-fighter（JET STRIKE）の iOS 版と同じです。
コードの準備はできているので、Mac では「ビルドして App Store Connect にアップロードする」作業だけを行います。

- Bundle ID：`jp.techgym.offside`（Android と同じ）
- アプリ名（App Store）：日本語「オフサイドトラップ 〜ラインを上げて罠にかけろ〜」／英語「Offside Trap: Hold the Line」
- ホーム画面の名前：日本語「オフサイドトラップ」／英語「Offside Trap」
- チーム：Team ID `GNM3VTX9YG`（Xcode の設定に入れてあります）。Apple Developer には**個人で登録**しています（App Store の販売元は個人名になります）
- 対応端末：iPhone（横画面固定）。iPad では iPhone 用の画面で動きます
- 広告：AdMob（iOS 用のアプリと広告ユニット。バナー・インタースティシャル・リワード）。起動時に「トラッキングの許可」の確認画面が出ます

---

## 0. ブラウザで先にやること（Mac でなくてもよい）

1. **Apple Developer**（developer.apple.com）→「Certificates, Identifiers & Profiles」→「Identifiers」→「＋」→「App IDs」→「App」
   - Description：`Offside Trap`（記号や「〜」は使えないことがある）
   - Bundle ID：「Explicit」で `jp.techgym.offside`
   - Capabilities：何もチェックしない
2. **App Store Connect**（appstoreconnect.apple.com）→「アプリ」→「＋」→「新規 App」
   - プラットフォーム：iOS ／ 名前：`オフサイドトラップ 〜ラインを上げて罠にかけろ〜` ／ プライマリ言語：日本語
   - バンドル ID：1 で登録したもの ／ SKU：`offsidetrap`（あとから変更不可）／ ユーザアクセス：アクセス制限なし
3. **AdMob**
   - 「アプリを追加」→ **iOS** →「ストアに掲載されていない」で登録し、**バナー・インタースティシャル・リワード**の広告ユニットを作る
   - アプリ ID（`ca-app-pub-…~…`）と広告ユニット ID 3 つを Claude Code に渡す（`ios/App/App/Info.plist` の `GADApplicationIdentifier` と `ads.js` の `UNITS.ios.production` に入ります。届くまでは Google のテスト用 ID です）
   - 「プライバシーとメッセージ」→「欧州の規制」のメッセージに iOS アプリも追加する

---

## 1. Mac の準備（最初の1回だけ）

1. **Xcode** を App Store からインストールする（数十 GB あるので時間がかかります）。インストール後に一度起動し、追加コンポーネントのインストールを済ませる
2. Xcode の「Settings…」→「Accounts」→「＋」で、Apple Developer に登録している Apple ID でサインインする（チームが個人名で表示されれば OK）
3. **Node.js**（LTS 版）を https://nodejs.org/ からインストールする
4. ターミナルでリポジトリを取得する
   ```bash
   cd ~/Desktop   # 置きたい場所（どこでもよい）
   git clone https://github.com/techgymjp/offside.git
   cd offside
   npm ci
   ```
   `git` がないと言われたら、表示に従って「コマンドライン・デベロッパツール」をインストールしてから、もう一度実行します。

2回目以降は、`cd offside` のあと `git pull` と `npm ci` で最新にします。

---

## 2. 自分の iPhone で動作確認する（テスト広告）

```bash
npm run ios:sync    # ゲームのファイルを iOS のプロジェクトにコピー（テスト広告）
npm run ios:open    # Xcode で開く
```

1. iPhone を USB ケーブルで Mac につなぎ、iPhone で「このコンピュータを信頼」を許可する
2. iPhone の「設定」→「プライバシーとセキュリティ」→「デベロッパモード」をオンにする（再起動を求められます。項目がない場合は、Xcode で一度 iPhone を選ぶと表示されます）
3. Xcode の上部で、実行先に自分の iPhone を選ぶ
4. 左の「App」→「Signing & Capabilities」で、「Automatically manage signing」がオン、Team に自分（個人名）のチームが選ばれていることを確認する
5. ▶（Run）を押すと、iPhone にアプリが入って起動する

確認すること:
- 横画面で全画面表示になる。ホーム画面の名前が「オフサイドトラップ」（英語の iPhone では「Offside Trap」）
- 起動時にトラッキングの確認画面が出る（日本語の説明文）
- DF のバッジのタップ・「マーク」ボタンで操作できる。音が鳴る（マナーモードでも鳴る）
- **テスト広告**が出る場面
  - バナー：タイトル画面・操作説明／ルールのページ・ポーズ画面・結果画面（画面の下）
  - 全画面広告：プレイを始めるとき、結果画面の「もう一度」「タイトルへ」、操作説明／ルールのページから「タイトルに戻る」、ポーズからの「再開」
  - リワード広告：失点したあとの「広告を見てこのプレーをやり直す」
- 結果画面の「結果をシェア」で、iPhone の共有メニューが出る

---

## 3. App Store 用にビルドしてアップロードする（本番広告）

```bash
git pull && npm ci
npm run ios:release   # 本番の広告 ID でコピーする（ここが ios:sync と違う）
npm run ios:open
```

1. Xcode の左で「App」→「General」→「Identity」を開き、**Build の番号を前回より大きくする**（初回は 1。アップロードのたびに 2、3…と上げる。同じ番号は二度アップロードできない）。Version は 1.0.0
2. 上部の実行先を「**Any iOS Device (arm64)**」にする
3. メニューの「Product」→「**Archive**」（「Product」は画面最上部のメニューバー。全画面表示だと隠れるので、マウスを画面の上端に動かす）
4. 終わると Organizer が開くので、「**Distribute App**」→「**App Store Connect**」→「Upload」で進める（途中の確認は既定のまま「Next」でよい。「Xcode Cloud can automate…」は「Remind Me Later」で閉じてよい）
5. 10〜30 分ほどで、App Store Connect の「TestFlight」タブにビルドが表示される

輸出コンプライアンス（暗号化）の質問は、Info.plist で「独自の暗号化は使っていない」と設定済みなので、聞かれません。

**注意**：`ios:release` でビルドしたアプリは本番の広告が出ます。TestFlight で確認するときも、**本番の広告はタップしない**でください（AdMob のアカウント停止の対象）。Xcode から iPhone に直接入れて試すときは、`npm run ios:sync` でテスト広告に戻してから実行します。

---

## 4. TestFlight で確認し、審査用の画面録画を撮る

1. App Store Connect の「TestFlight」→「内部テスト」でグループを作り、自分を追加する
2. iPhone に「TestFlight」アプリを App Store から入れ、届いた招待からオフサイドトラップをインストールする
3. **審査用の画面録画を撮る**（新しいアカウントの初回の審査では、実機での操作の録画を求められます。提出前に用意しておくと早い）
   - iPhone を最新の iOS にしておく
   - コントロールセンターに「画面収録」がなければ、「設定」→「コントロールセンター」で追加する
   - 画面収録を始めてから、**アプリの起動**から撮る。2〜3 分でよいので、次を一続きで見せる
     1. 起動 → トラッキングの確認画面（「許可しない」でも可）→ タイトル画面
     2. 「操作説明」「オフサイドのルール」のページを開いて戻る
     3. プレイ：DF をタップしてオフサイドを取る場面と、「マーク」で守る場面を 1 つずつ
     4. 失点したあとの「広告を見てやり直す」（広告が出るところまで。**本番の広告はタップしない**）
     5. 結果画面とシェアの共有メニュー
   - 録画は「写真」アプリに保存される。Mac に AirDrop で送る
   - 大きすぎると App Review への返信に添付できない（400MB でも失敗した例あり）。Mac の Finder で右クリック →「選択したビデオファイルをエンコード」→ **720p** で小さくする。それでも大きければ Google ドライブの共有リンクを返信文に貼る

---

## 5. App Store Connect で審査に出す

「配信」タブ（iOS App のバージョン 1.0.0）で入力します。**バージョンが「1.0」になっていたら「1.0.0」に直して保存**します（違うとアップロードしたビルドを選べない）。

| 項目 | 入力内容 |
| --- | --- |
| スクリーンショット | 「Dynamic Island 搭載 iPhone（中型ディスプレイ）」の欄に、`docs/store/ios/6.3inch/` の 2622 × 1206（横向き）を入れる。日本語版（ja-）と英語版（en-）各 4 枚。6.9 インチ（2868 × 1320）は受け付けられない |
| ヘッダ・検索結果 | 「ヘッダと検索結果」タブに `docs/store/ios/appstore-header-3840x1646.png` と `appstore-search-3840x2560.png`（ヘッダを入れたら検索結果も入れる。片方だけだと赤枠になる） |
| プロモーション用テキスト・概要・キーワード | Google Play 用の文章（`docs/store/listing.md`、英語は `docs/store/listing-en.txt`）を流用 |
| サポート URL | https://techgym.jp/ |
| マーケティング URL（任意） | https://techgym.jp/column/claude-code-game-offside/ |
| プライバシーポリシー URL（App 情報・App のプライバシー） | https://techgym.jp/privacy-policy/ |
| カテゴリ（App 情報） | ゲーム（サブカテゴリ「スポーツ」） |
| コンテンツの配信権（App 情報） | 第三者のコンテンツ「いいえ」（絵も音も自前） |
| 著作権 | 2026 TECH GYM K.K. |
| ビルド | TestFlight で確認したビルドを選ぶ |
| 年齢制限 | 質問に答える（サッカーのゲーム。暴力・流血・ギャンブルなどの表現なし） |
| App のプライバシー | AdMob が収集するデータを申告する（下記） |
| App Review に関する情報 | ログイン不要。連絡先を入力。メモに下の文を入れる |

**App のプライバシー（AdMob を使うアプリの目安）**
Google の「Apple の App Store のデータ開示要件への準備」（AdMob のヘルプ）に、AdMob が収集するデータの一覧があります。必ずそちらを見て最終確認してください。目安は次のとおりです。

- 収集する：ID（デバイス ID）、使用状況データ（広告データ、製品の操作）、診断（クラッシュデータ、パフォーマンスデータ、その他の診断データ）、位置情報（おおよその場所）
- 目的：サードパーティ広告、アナリティクス
- ユーザーに関連付け：しない
- トラッキングに使用：デバイス ID と広告データは「する」

**App Review のメモ（日英。返信で同じ内容を求められることが多い）**

```
This is a single-player football (soccer) game for teenagers and adults who want to learn the offside rule.
No login or account is required. All features are available immediately after launch.
How to use: tap the number badge above a defender to step him up as the pass is played (offside trap),
or press MARK when offside cannot apply (throw-ins, goal kicks, corners). The title screen has "How to play" and "Offside rules" pages.
External services: Google AdMob (banner, interstitial and rewarded ads) with Google's consent form (UMP) and App Tracking Transparency.
The app works the same in all regions. It is not in a regulated industry and contains no third-party content.
A screen recording on a physical iPhone is attached.

オフサイドのルールを学べる、1人用のサッカーゲームです(対象: 中学生以上)。ログインやアカウントは不要で、起動後すぐにすべての機能を使えます。
遊び方: パスの瞬間に DF の上の番号をタップしてラインを上げる(オフサイドトラップ)、オフサイドにならない場面では「マーク」を押す。タイトル画面に「操作説明」「オフサイドのルール」のページがあります。
外部サービス: Google AdMob(バナー・全画面・リワード広告)と、同意確認(UMP)・App Tracking Transparency。地域による違いはありません。規制業種ではなく、第三者の素材も使っていません。
実機(iPhone)での操作の録画を添付します。
```

入力が終わったら「審査用に追加」→「審査へ提出」。

---

## 6. 公開後にやること

- AdMob で iOS アプリを App Store のアプリに紐づける（「アプリ」→ iOS のオフサイドトラップ →「アプリの設定」）
- App Store からインストールして、起動・同意画面・トラッキングの確認・広告を確認する

---

## 7. 自動化（GitHub Actions で TestFlight にアップロード）

`.github/workflows/ios-release.yml` が、既定のブランチへの push のたびに（または Actions →「iOS TestFlight upload」→「Run workflow」で）、
**本番の広告の設定**でビルドして App Store Connect（TestFlight）にアップロードします。Mac での 3 章の作業の代わりになります。審査への提出は、これまでどおり App Store Connect で行います。

- 必要な Secrets（登録済み）：`IOS_DIST_CERT_P12_BASE64` / `IOS_DIST_CERT_PASSWORD` / `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_P8_BASE64`
  （作り方は techgymjp/jet-fighter の `docs/IOS_BUILD.md` の 7 章。API キーと証明書はチーム共通なので、JET STRIKE と同じものでよい）
- ビルド番号は **101 から**自動で増える（Actions の実行回数 + 100）。Mac の Xcode から手で上げるビルド（1、2、3…）とは重ならない
- 署名用のプロファイル（「offside App Store (GitHub Actions)」）は、API キーで自動的に作られる（`scripts/ios-profile.py`）
- 終わると、実行のページに「ビルド ◯ を App Store Connect にアップロードしました」と出る。10〜30 分ほどで TestFlight に表示される
- 失敗したら、実行のページの赤いステップのログを Claude Code に見せる

いまの `.github/workflows/ios.yml` は、push のたびに「署名なしでビルドできるか」だけを確かめるものです。

**注意**：証明書（.p12）、そのパスワード、API キー（.p8）は、チャット・AI へのアップロード・リポジトリへのコミットで**絶対に共有しない**でください。誤って共有したら、App Store Connect で API キーを取り消し、証明書も取り消して作り直します。

---

## つまずきやすいところ

| 症状 | 対処 |
| --- | --- |
| アップロードで「同じビルド番号がすでにある」 | General の Build の番号を上げてから Archive し直す |
| Signing でエラー（チームが選べない、証明書がない） | Xcode の Accounts で Apple ID にサインインし直し、Team に自分のチームを選ぶ。「Automatically manage signing」をオンにする |
| 実行先に iPhone が出ない | ケーブルをつなぎ直し、iPhone で「信頼」を許可。デベロッパモードをオンにする |
| 実行先に「iOS 26.x Not Installed」と出る | 「Get」で iOS のシミュレーターと部品をダウンロードする（8 GB ほど。Archive にも必要） |
| ビルドが古いゲームのまま | `npm run ios:sync`（または `ios:release`）を実行し忘れている。`git pull` してから実行し直す |
| アップロードしたビルドが選べない | App Store Connect のバージョンが「1.0」のまま。「1.0.0」に直して保存する |
| 「審査用に追加できません」 | 「App 情報」のコンテンツの配信権、「App のプライバシー」のプライバシーポリシー URL を入れたか確認する |
| 審査で「Guideline 2.1 - Information Needed」 | 4 章の画面録画と、5 章の App Review のメモの内容を返信する。同じ文をバージョンのページの「メモ」にも入れる |
| 返信に動画を添付すると「エラーが発生しました」 | 動画が大きすぎる。720p にエンコードするか、Google ドライブの共有リンクを貼る |
| 本番広告とテスト広告の取り違え | App Store 用は必ず `npm run ios:release`。Xcode から実機で試すときは `npm run ios:sync` に戻す |
| App Store の審査で「Xcode が古い」と言われる | Xcode を最新版に更新してから Archive し直す |
