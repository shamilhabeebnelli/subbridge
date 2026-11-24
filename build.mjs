import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const r = await build({ entryPoints: ['App.jsx'], bundle: true, write: false, minify: true, format: 'iife', jsx: 'automatic', jsxImportSource: 'preact', platform: 'browser', target: 'es2020' });
await build({ entryPoints: ['localworker.js'], bundle: true, minify: true, format: 'esm', platform: 'browser', outfile: '4-worker.js' });
writeFileSync('worker.js', "// Loader. The engine bundle is 4-worker.js (the 4- is an accident of how it was uploaded to GitHub).\nimport './4-worker.js';\n");
const notice = '<!--\n' + readFileSync('LICENSE', 'utf8') + '\n' + readFileSync('THIRD_PARTY.md', 'utf8').replaceAll('--', '- -') + '\n-->\n';
const csp = "default-src 'none'; script-src 'unsafe-inline'; worker-src 'self'; style-src 'unsafe-inline'; img-src data:; connect-src http: https:; base-uri 'none'; form-action 'none'";
writeFileSync('index.html', notice + `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>SubBridge | SRT subtitle translator (beta)</title><style>${readFileSync('style.css', 'utf8')}</style></head><body><div id="app"></div><script>${r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
console.log('Built index.html', readFileSync('index.html').length, 'bytes');
