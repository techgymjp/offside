'use strict';
// 表示言語(日本語 / 英語)。端末の言語が日本語なら日本語、それ以外は英語。タイトル画面で切り替えも可能
// 構成は techgymjp/corner-kick(コーナーキック)の i18n.js と同じ
window.I18N = (() => {
  const dict = {
    ja: {
      'doc.title': 'オフサイド',
      'rotate.msg': 'スマホを横向きにしてください',
      'rotate.sub': 'オフサイドは横画面で遊ぶゲームです',
      'legal.privacy': 'プライバシーポリシー',
      'url.privacy': 'https://techgym.jp/privacy-policy/',
      'rules.btn': '📘 オフサイドのルール',
      'rules.close': '閉じる',
      'nav.btn': 'ナビ {s}',

      'title.name': 'オフサイド',
      'title.sub': 'ラインを上げろ!パスの瞬間に、相手を置き去りにせよ',
      'help.touch.1': '相手がドリブルで攻めてくる。あなたは赤の守備ライン。パスが出る瞬間に、ラインから遅れているDFをタップ',
      'help.touch.2': 'タップしたDFは自動で前に出て、オフサイドラインを上げる',
      'help.touch.3': 'パスが出た瞬間に、受け手が「後ろから2人目の相手(GKも数える)」とボールより前ならオフサイド',
      'help.touch.4': '早すぎると相手に戻られる。パスの後では遅い(判定はボールを蹴った瞬間)',
      'help.touch.5': 'スローイン・ゴールキックや、ボールより後ろ・自陣からの抜け出しはオフサイドにならない。そのときは上げずに守れ',
      'help.touch.6': 'ナビ ON: オフサイドライン(赤い線)・ラインを決めているDF(黄色の輪)・パスの合図(オレンジ)が出る',
      'help.key.1': '相手がドリブルで攻めてくる。あなたは赤の守備ライン。パスが出る瞬間に、遅れているDFを 1〜4 キーで上げる',
      'help.key.2': 'キー(またはクリック)で選んだDFは自動で前に出て、オフサイドラインを上げる',
      'help.key.3': 'パスが出た瞬間に、受け手が「後ろから2人目の相手(GKも数える)」とボールより前ならオフサイド',
      'help.key.4': '早すぎると相手に戻られる。パスの後では遅い(判定はボールを蹴った瞬間)',
      'help.key.5': 'スローイン・ゴールキックや、ボールより後ろ・自陣からの抜け出しはオフサイドにならない。そのときは上げずに守れ',
      'help.key.6': 'N : ナビのオン/オフ   M : 音のオン/オフ   P : 一時停止',
      'title.best': 'ベスト: {c} / {t} 成功  (SCORE {s})',
      'title.start.touch': 'タップでキックオフ',
      'title.start.key': 'SPACE / タップでキックオフ',
      'title.sound': '音が鳴ります(M キー / 上のボタンで消音)。iPhone はマナーモードを解除してください',

      'hud.play': 'プレー {n} / {t}',
      'hud.ok': '成功 {n}', 'hud.trap': 'オフサイド {n}', 'hud.streak': '連続 {n}',
      'hud.me': '守備ライン',
      'ready.play': '{n} プレー目',
      'call.through': '中央突破', 'call.through2': 'ラインがそろっていない', 'call.long': 'ロングボール', 'call.throw': 'スローイン',
      'call.two': '2人が裏を狙う', 'call.cutback': 'サイドをえぐられた', 'call.gkout': 'キーパーが前に',
      'call.ownhalf': '高いライン', 'call.goalkick': 'ゴールキック', 'call.fk': 'フリーキック',
      'ready.sub': 'パスの瞬間に、遅れているDFを上げろ!',
      'msg.build': 'パスが出る瞬間に、ラインから遅れているDFをタップ!',
      'msg.build.key': 'パスが出る瞬間に、遅れているDFを 1〜4 キーで上げろ!',
      'nav.trap': 'ナビ: 黄色の輪のDFがラインを決めている。オレンジの合図で上げろ',
      'nav.trap2': 'ナビ: 遅れているDFが2人。両方上げないとオフサイドにならない',
      'nav.gk': 'ナビ: キーパーも「後ろから2人目」に数える。キーパーの後ろのDFを上げろ',
      'nav.throw': 'ナビ: スローインからはオフサイドにならない!ラインを上げずにマークしろ',
      'nav.goalkick': 'ナビ: ゴールキックからはオフサイドにならない!ラインを上げずに競り合え',
      'nav.behind': 'ナビ: ボールより後ろの選手はオフサイドにならない!ラインを上げずに戻せ',
      'nav.ownHalf': 'ナビ: 自陣から走る選手はオフサイドにならない!ラインを上げずにカバーしろ',
      'nav.pass': 'パスが来る!',
      'badge.up': '上げる', 'badge.going': 'UP!',
      'pause.resume': 'P / Esc で再開',
      'sound.tap': '音が出ないときはタップ',
      'skip': 'タップで次へ', 'skip.key': 'SPACE / タップで次へ',

      'var.title': 'パスの瞬間',
      'var.off': 'オフサイドポジション  {g} 前',
      'var.on': 'オンサイド  {g} 後ろ',
      'var.level': '同じ高さ → オンサイド',
      'var.exempt': 'オフサイドなし',
      'lbl.def': '後ろから2人目 ({d})', 'lbl.atk': '受け手 {n}番',

      'res.offside': 'オフサイド!!', 'res.clear': '守り切った!', 'res.catch': 'キーパーがキャッチ!',
      'res.goal': '失点…', 'res.just': 'ジャストタイミング!', 'res.read': 'ナイス判断!',
      'streak': '{n} 連続成功!',
      'who.gk': 'GK', 'who.num': '{n}番', 'who.off': '{n}番(場外)',
      'why.offside': 'パスの瞬間、{n}番は後ろから2人目の相手({d})より {g} 前 → オフサイド',
      'why.flag': '旗が上がるのは、オフサイドポジションの選手がプレーに関わった(ボールに触った)とき',
      'why.fk': 'フリーキックからはオフサイドがある。息をそろえてラインを上げれば罠にかかる',
      'why.long': 'ロングパスでも判定はキックの瞬間。その後に飛び出しても関係ない',
      'why.gkCounted': 'キーパーも「後ろから2人目」に数える。キーパーの後ろのDFを上げたのが正解',
      'why.stayed': '{d}がラインに残っていたので、{n}番はオンサイド。{d}を上げればオフサイドだった',
      'why.stayedGk': 'キーパーが前に出ていたので、後ろから2人目はキーパーだった。キーパーの後ろの{d}を上げればオフサイドだった',
      'why.late': 'ラインを上げるのが遅かった。判定はパスが出た瞬間',
      'why.afterPass': 'パスの後に上げても遅い。判定はボールを蹴った瞬間',
      'why.early': 'ラインを上げるのが早すぎて、{n}番にオンサイドの位置まで戻られた',
      'why.level': '同じ高さはオンサイド。もう一歩上げていれば…',
      'why.throw': 'スローインからはオフサイドにならない',
      'why.goalkick': 'ゴールキックからはオフサイドにならない',
      'why.behind': '{n}番はパスの瞬間にボールより後ろにいた。ボールより後ろならオフサイドにならない',
      'why.ownHalf': '{n}番はパスの瞬間に自陣にいた。自陣ではオフサイドにならない',
      'why.passive': '{n}番はオフサイドポジションにいたが、プレーに関わっていないので反則ではない',
      'why.markOk': 'ラインを上げずにマークしたのが正解',
      'why.markNg': 'ラインを上げたのでマークが外れてしまった',
      'why.cleared': 'DFが先にボールに触ってクリアした',

      'rank.0': 'ザル守備', 'rank.1': '控えDF', 'rank.2': 'レギュラーDF',
      'rank.3': 'ラインコントロールの職人', 'rank.4': '代表の最終ライン', 'rank.5': 'オフサイドトラップの支配者',

      'over.title': '試合終了',
      'over.goals': '{c} / {t} 成功',
      'over.perfect': '★ パーフェクト!! 全部のピンチを止めた ★',
      'over.rank': '称号: {r}',
      'over.line1': 'SCORE {s}   オフサイド {h}   最大連続 {m}   {nav}',
      'over.new': 'NEW RECORD!',
      'over.best': 'ベスト: {c} 成功 (SCORE {s})',
      'nav.on': 'ナビあり', 'nav.off': 'ナビなし',
      'over.retryBtn': 'もう一度',
      'menu.resume': '再開', 'menu.title': 'タイトルへ',

      'share.btn': '📤 結果をシェア', 'share.post': '𝕏 ポスト', 'share.copy': 'コピー',
      'share.title': 'オフサイド', 'share.dialog': '結果をシェア',
      'share.msg.image': '成績画像つきでシェアできます',
      'share.msg.links': 'X・LINE・コピーからシェアしてください',
      'share.copied': '結果をコピーしました!SNSに貼り付けてください',
      'share.copyFail': 'コピーできませんでした。X・LINEボタンを使ってください',
      'share.perfect': '【パーフェクト!】',
      'share.text': '🚩オフサイドで{c}/{t}回ピンチを止めた!{p}\n称号:{r} SCORE {s}({nav})\nオフサイド{h}回・最大{m}連続\n#オフサイド #サッカー #ClaudeCode',
      'card.head': 'オフサイド({nav})',
      'card.goals': '{c}/{t} 成功',
      'card.rank': '称号:{r}',
      'card.line1': 'SCORE {s} ・ オフサイド{h}回 ・ 最大{m}連続',
      'card.tags': '#オフサイド  #サッカー  #ClaudeCode',

      'rules.title': 'オフサイドのルール(サッカー競技規則 第11条)',
      'rules.1': '<b>オフサイドポジション</b>: 頭・胴体・足のどこかが相手陣内にあり、<b>ボール</b>と<b>後ろから2人目の相手</b>の両方より相手のゴールラインに近いこと(腕と手は含まない)',
      'rules.2': '<b>同じ高さ</b>はオフサイドではない。<b>自陣</b>(ハーフウェーラインの上を含む)にいればオフサイドにならない',
      'rules.3': '判定は<b>味方がボールをプレーした(蹴った・触った)瞬間</b>。ロングパスでも、その後に飛び出したのは関係ない',
      'rules.4': 'オフサイドポジションにいる<b>だけでは反則ではない</b>。ボールをプレーする・相手の邪魔をする・跳ね返りで利益を得るなど<b>プレーに関わったとき</b>に反則になる(副審はそこで旗を上げる)',
      'rules.5': '<b>ゴールキック・スローイン・コーナーキック</b>から直接ボールを受けたときはオフサイドにならない(フリーキックはなる)',
      'rules.6': '「後ろから2人目」は<b>ゴールキーパーも数える</b>。キーパーが前に出ていれば、キーパーが2人目になることもある',
      'rules.7': '<b>ボールより後ろ</b>にいる選手(バックパス・カットバックを受ける選手)はオフサイドにならない',
      'rules.8': '許可なくピッチの外に出た守備側の選手は、<b>ゴールラインかタッチラインの上にいる</b>とみなす',
      'rules.9': '相手が<b>意図的にプレーした</b>ボール(セーブを除く)を受けたときはオフサイドにならない',
      'rules.10': 'GK が手で投げたボールは、最後に触れた地点で判定する(2025/26 の改正)。罰則は反則の地点から相手の<b>間接フリーキック</b>',
      'rules.src': '出典: IFAB サッカー競技規則 2025/26 第11条',
    },
    en: {
      'doc.title': 'Offside',
      'rotate.msg': 'Please rotate your phone to landscape',
      'rotate.sub': 'Offside is played in landscape mode',
      'legal.privacy': 'Privacy Policy',
      'url.privacy': 'https://techgym.jp/privacy-policy-en/',
      'rules.btn': '📘 Offside rules',
      'rules.close': 'Close',
      'nav.btn': 'NAV {s}',

      'title.name': 'OFFSIDE',
      'title.sub': 'Step up at the pass. Leave them stranded!',
      'help.touch.1': 'The opponents dribble at you. You are the red back line. Tap the defender who is lagging behind — right as the pass is played',
      'help.touch.2': 'A tapped defender steps up by himself and raises the offside line',
      'help.touch.3': 'If, when the ball is played, the receiver is beyond the ball and the second-last opponent (keeper counts), he is offside',
      'help.touch.4': 'Too early and the runner drops back. After the pass is too late — offside is judged at the moment of the pass',
      'help.touch.5': 'No offside from throw-ins and goal kicks, or for a player behind the ball or starting in his own half. Then don\'t step up — defend',
      'help.touch.6': 'NAV on: shows the offside line (red), the defender holding it (yellow) and the pass cue (orange)',
      'help.key.1': 'The opponents dribble at you. You are the red back line. Press 1–4 to step up the lagging defender as the pass is played',
      'help.key.2': 'The chosen defender (key or click) steps up by himself and raises the offside line',
      'help.key.3': 'If, when the ball is played, the receiver is beyond the ball and the second-last opponent (keeper counts), he is offside',
      'help.key.4': 'Too early and the runner drops back. After the pass is too late — offside is judged at the moment of the pass',
      'help.key.5': 'No offside from throw-ins and goal kicks, or for a player behind the ball or starting in his own half. Then don\'t step up — defend',
      'help.key.6': 'N: NAV on/off   M: sound on/off   P: pause',
      'title.best': 'Best: {c} / {t} stops  (SCORE {s})',
      'title.start.touch': 'Tap to kick off',
      'title.start.key': 'SPACE / Tap to kick off',
      'title.sound': 'This game has sound (M key / top button to mute). On iPhone, turn off silent mode.',

      'hud.play': 'Play {n} / {t}',
      'hud.ok': 'Stops {n}', 'hud.trap': 'Offsides {n}', 'hud.streak': 'Streak {n}',
      'hud.me': 'BACK LINE',
      'ready.play': 'Play {n}',
      'call.through': 'THROUGH THE MIDDLE', 'call.through2': 'BROKEN BACK LINE', 'call.long': 'LONG BALL', 'call.throw': 'THROW-IN',
      'call.two': 'TWO RUNNERS', 'call.cutback': 'DOWN THE WING', 'call.gkout': 'KEEPER OFF HIS LINE',
      'call.ownhalf': 'HIGH LINE', 'call.goalkick': 'GOAL KICK', 'call.fk': 'FREE KICK',
      'ready.sub': 'Step up the lagging defender as the pass is played!',
      'msg.build': 'Tap the lagging defender right as the pass is played!',
      'msg.build.key': 'Press 1–4 to step up the lagging defender as the pass is played!',
      'nav.trap': 'NAV: the defender on the yellow ring holds the line. Step him up on the orange cue',
      'nav.trap2': 'NAV: two defenders are lagging. Step up both to catch him offside',
      'nav.gk': 'NAV: the keeper counts as an opponent. Step up the defender behind the keeper',
      'nav.throw': 'NAV: no offside from a throw-in! Don\'t step up — mark him',
      'nav.goalkick': 'NAV: no offside from a goal kick! Don\'t step up — challenge him',
      'nav.behind': 'NAV: a player behind the ball can\'t be offside! Don\'t step up — get back',
      'nav.ownHalf': 'NAV: a runner from his own half can\'t be offside! Don\'t step up — cover',
      'nav.pass': 'PASS COMING!',
      'badge.up': 'STEP', 'badge.going': 'UP!',
      'pause.resume': 'P / Esc to resume',
      'sound.tap': 'No sound? Tap here',
      'skip': 'Tap for next', 'skip.key': 'SPACE / Tap for next',

      'var.title': 'AT THE PASS',
      'var.off': 'OFFSIDE POSITION  {g} beyond',
      'var.on': 'ONSIDE  {g} behind',
      'var.level': 'LEVEL → ONSIDE',
      'var.exempt': 'NO OFFSIDE',
      'lbl.def': '2nd-last opponent ({d})', 'lbl.atk': 'Receiver #{n}',

      'res.offside': 'OFFSIDE!!', 'res.clear': 'Defended!', 'res.catch': 'Keeper claims it!',
      'res.goal': 'Goal conceded...', 'res.just': 'Perfect timing!', 'res.read': 'Great read!',
      'streak': '{n} stops in a row!',
      'who.gk': 'GK', 'who.num': '#{n}', 'who.off': '#{n} (off the pitch)',
      'why.offside': 'At the pass, #{n} was {g} beyond the second-last opponent ({d}) → offside',
      'why.flag': 'The flag goes up when the player in an offside position gets involved (touches the ball)',
      'why.fk': 'Offside applies from free kicks. Step up together and they walk into the trap',
      'why.long': 'Even for a long ball, offside is judged when it is kicked. Running in behind afterwards is fine',
      'why.gkCounted': 'The keeper counts too. Stepping up the defender behind the keeper was right',
      'why.stayed': '{d} stayed back, so #{n} was onside. Step {d} up and he would have been offside',
      'why.stayedGk': 'The keeper was out, so the keeper was the second-last opponent. Step up {d} behind him and it would have been offside',
      'why.late': 'You stepped up too late. Offside is judged at the moment of the pass',
      'why.afterPass': 'Stepping up after the pass is too late. It is judged when the ball is kicked',
      'why.early': 'You stepped up too early and #{n} dropped back onside',
      'why.level': 'Level is onside. One more step...',
      'why.throw': 'There is no offside from a throw-in',
      'why.goalkick': 'There is no offside from a goal kick',
      'why.behind': '#{n} was behind the ball when it was played. Behind the ball is never offside',
      'why.ownHalf': '#{n} was in his own half when it was played. You can\'t be offside in your own half',
      'why.passive': '#{n} was in an offside position but not involved in play, so no offence',
      'why.markOk': 'Holding your position and marking was right',
      'why.markNg': 'Stepping up left the attacker unmarked',
      'why.cleared': 'A defender got there first and cleared it',

      'rank.0': 'Leaky Defence', 'rank.1': 'Bench Defender', 'rank.2': 'First-team Defender',
      'rank.3': 'Line Commander', 'rank.4': 'International Back Line', 'rank.5': 'Master of the Offside Trap',

      'over.title': 'FULL TIME',
      'over.goals': '{c} / {t} stops',
      'over.perfect': '★ PERFECT!! You stopped every attack ★',
      'over.rank': 'Rank: {r}',
      'over.line1': 'SCORE {s}   Offsides {h}   Best streak {m}   {nav}',
      'over.new': 'NEW RECORD!',
      'over.best': 'Best: {c} stops (SCORE {s})',
      'nav.on': 'NAV on', 'nav.off': 'NAV off',
      'over.retryBtn': 'Play again',
      'menu.resume': 'Resume', 'menu.title': 'Title',

      'share.btn': '📤 Share result', 'share.post': '𝕏 Post', 'share.copy': 'Copy',
      'share.title': 'Offside', 'share.dialog': 'Share result',
      'share.msg.image': 'Share with a result card image',
      'share.msg.links': 'Share via X, LINE or copy',
      'share.copied': 'Copied! Paste it into your social media',
      'share.copyFail': 'Could not copy. Please use the X or LINE button',
      'share.perfect': ' PERFECT!',
      'share.text': '🚩I stopped {c}/{t} attacks in Offside!{p}\nRank: {r}  SCORE {s} ({nav})\n{h} offsides, best streak {m}\n#Offside #Football #ClaudeCode',
      'card.head': 'OFFSIDE ({nav})',
      'card.goals': '{c}/{t} stops',
      'card.rank': 'Rank: {r}',
      'card.line1': 'SCORE {s}  ·  Offsides {h}  ·  Best streak {m}',
      'card.tags': '#Offside  #Football  #ClaudeCode',

      'rules.title': 'The offside law (Laws of the Game, Law 11)',
      'rules.1': '<b>Offside position</b>: any part of the head, body or feet is in the opponents\' half and nearer to their goal line than both <b>the ball</b> and <b>the second-last opponent</b> (arms and hands don\'t count)',
      'rules.2': '<b>Level</b> is onside. A player in his <b>own half</b> (including the halfway line) can\'t be offside',
      'rules.3': 'It is judged <b>the moment a team-mate plays or touches the ball</b>. Running in behind afterwards doesn\'t matter, even for a long ball',
      'rules.4': 'Being in an offside position is <b>not an offence by itself</b>. It becomes one when the player <b>gets involved</b>: plays the ball, interferes with an opponent, or gains an advantage from a rebound (that is when the flag goes up)',
      'rules.5': 'No offside when receiving the ball directly from a <b>goal kick, throw-in or corner kick</b> (free kicks do count)',
      'rules.6': 'The <b>goalkeeper counts</b> as an opponent. If the keeper comes out, he can be the second-last opponent',
      'rules.7': 'A player <b>behind the ball</b> (receiving a back pass or cut-back) can\'t be offside',
      'rules.8': 'A defender who leaves the pitch without permission is treated as being <b>on the goal line or touchline</b>',
      'rules.9': 'No offside when receiving a ball an opponent <b>deliberately played</b> (except a save)',
      'rules.10': 'A goalkeeper\'s throw is judged from the point of last contact (2025/26 change). The sanction is an <b>indirect free kick</b> where the offence happened',
      'rules.src': 'Source: IFAB Laws of the Game 2025/26, Law 11',
    },
  };

  const STORE_KEY = 'offside.lang';
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* 保存不可 */ }
  const deviceLang = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
  let lang = dict[saved] ? saved : (/^ja\b/i.test(deviceLang) ? 'ja' : 'en');
  const listeners = [];

  // t('hud.play', { n: 3, t: 10 }) → 'プレー 3 / 10'
  function t(key, vars) {
    let s = dict[lang][key];
    if (s === undefined) s = dict.ja[key];
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m)) : s;
  }

  // data-i18n(文字)/ data-i18n-html(太字つきの文)/ data-i18n-href(リンク先)の付いた要素を書き換える
  function apply() {
    document.documentElement.lang = lang;
    document.title = t('doc.title');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-href]').forEach((el) => { el.href = t(el.dataset.i18nHref); });
    document.querySelectorAll('[data-lang]').forEach((el) => el.classList.toggle('on', el.dataset.lang === lang));
  }

  function setLang(l) {
    if (!dict[l] || l === lang) return;
    lang = l;
    try { localStorage.setItem(STORE_KEY, l); } catch (e) { /* 保存不可 */ }
    apply();
    listeners.forEach((f) => f(l));
  }

  return {
    t, apply, setLang,
    get lang() { return lang; },
    onChange(f) { listeners.push(f); },
  };
})();
