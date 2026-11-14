'use strict';
// ブラウザ検証の共通設定：対象のHTML（環境変数 WOH_HTML。既定は開発版）と、画像などの出力先（WOH_OUT。既定は一時フォルダ）
const path = require('path'), os = require('os'), fs = require('fs');
const HTML = path.resolve(process.env.WOH_HTML || path.join(__dirname, '..', 'World-of-History-v30-development.html'));
const OUTDIR = process.env.WOH_OUT || path.join(os.tmpdir(), 'woh-test-out'); fs.mkdirSync(OUTDIR, { recursive: true });
if (!fs.existsSync(HTML)) throw new Error('対象のHTMLがありません：' + HTML);
module.exports = { HTML, url: (q) => 'file://' + HTML + (q || ''), out: (f) => (f ? path.join(OUTDIR, f) : OUTDIR + '/'), OUTDIR };
