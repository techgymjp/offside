// Android アプリに同梱する Web ファイルを www/ にコピーする
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of [
  'index.html', 'style.css', 'manifest.json',
  'game.js', 'scene3d.js', 'sound.js', 'ads.js', 'i18n.js', 'vendor',
]) {
  const src = path.join(root, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(out, item), { recursive: true });
}
// ブラウザ版だけの部分(Google Play へのリンクなど)を取り除く。
// アプリに「ほかのストアへのリンク」や「アプリでだけ隠すコード」が入っていると、
// iOS の審査で「審査中に隠した機能」(Guideline 5.6)と見られることがあるため。
//   HTML: <!-- web-only --> … <!-- /web-only -->   JS: // web-only:start … // web-only:end
const stripWebOnly = (text) => text
  .replace(/[ \t]*<!-- web-only -->[\s\S]*?<!-- \/web-only -->[ \t]*\n?/g, '')
  .replace(/[ \t]*\/\/ web-only:start[\s\S]*?\/\/ web-only:end[^\n]*\n?/g, '')
  .replace(/\/\* web-only:start \*\/[\s\S]*?\/\* web-only:end \*\/\n?/g, '');
for (const file of ['index.html', 'style.css', 'game.js', 'i18n.js']) {
  const p = path.join(out, file);
  fs.writeFileSync(p, stripWebOnly(fs.readFileSync(p, 'utf8')));
}
for (const file of fs.readdirSync(out)) {
  if (!/\.(html|js|css)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(out, file), 'utf8');
  if (/play\.google\.com|storeBtn|web-only/.test(text)) {
    console.error(`www/${file} にブラウザ版だけの部分が残っています(web-only の目印を確認)`);
    process.exit(1);
  }
}
// Google Play 用のビルドでは本番の広告を使う
const mode = process.env.ADMOB_MODE === 'production' ? 'production' : 'test';
fs.writeFileSync(path.join(out, 'ads-config.js'), `// ビルド時に生成\nwindow.AD_MODE = '${mode}';\n`);
// タイトル画面に出すバージョン（CI では VERSION_NAME / VERSION_CODE を使う）
const version = process.env.VERSION_CODE
  ? `v${process.env.VERSION_NAME || require('../package.json').version} (build ${process.env.VERSION_CODE})`
  : 'dev';
fs.writeFileSync(path.join(out, 'build-info.js'), `// ビルド時に生成\nwindow.APP_VERSION = '${version}';\n`);
console.log(`built web assets into www/ (ads: ${mode}, version: ${version})`);
