import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errors = [], hosts = [];
let calls = 0, quotaAfter = Infinity;
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (/^https?:/.test(r.url())) hosts.push(new URL(r.url()).host); });
await page.route('https://api.mymemory.translated.net/**', async (route) => {
  calls++;
  const u = new URL(route.request().url());
  const q = u.searchParams.get('q');
  if (calls > quotaAfter) return route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.' } } });
  route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: `[${u.searchParams.get('langpair')}] ${q}` } } });
});
await page.route('http://localhost:5000/**', async (route) => {
  const url = route.request().url();
  if (url.endsWith('/languages')) return route.fulfill({ json: [{ code: 'en' }, { code: 'es' }] });
  const b = JSON.parse(route.request().postData());
  route.fulfill({ json: { translatedText: `LT:${b.q}` } });
});
let n = 0;
const ok = (x, s) => { assert.ok(x, s); console.log('PASS', s); n++; };
await page.goto('file://' + process.cwd() + '/index.html');

ok(await page.getByRole('heading', { name: /SubBridge/ }).count() === 1, 'opens locally');
ok(await page.getByRole('button', { name: 'Translate', exact: true }).isDisabled(), 'translate disabled without file');
await page.getByRole('button', { name: 'Try demo subtitles' }).click();
ok(await page.locator('.cue').count() === 4, 'demo shows four cues');
ok(await page.getByRole('button', { name: 'Translate', exact: true }).isDisabled(), 'translate disabled until consent');
const opts = await page.getByLabel('To language').evaluate((s) => [...s.options].map((o) => o.text));
ok(opts.length === 16, 'target list has 16 entries, got ' + opts.length + ' ' + opts.slice(0,3));
await page.getByLabel('To language').selectOption('tulu');
await page.getByRole('checkbox').check();
ok(await page.getByRole('button', { name: 'Translate', exact: true }).isDisabled(), 'Tulu cannot be translated');
ok((await page.locator('.support').innerText()).includes('Tulu: no engine'), 'Tulu stated as unsupported');
await page.getByLabel('To language').selectOption('malayalam');
await page.getByLabel('From language').selectOption('english');
await page.getByRole('checkbox').check();
ok(await page.getByRole('button', { name: 'Translate', exact: true }).isDisabled() === false, 'Malayalam can be translated after consent');
await page.getByRole('button', { name: 'Translate', exact: true }).click();
await page.getByText(/Finished\./).waitFor();
ok(calls === 4, 'one request per distinct segment (4 incl. two dialogue lines, symbol-only cue skipped)');
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download translated SRT' }).click();
const f = await dl; await f.saveAs('/tmp/sb-out.srt');
ok(f.suggestedFilename() === 'translated.ml.srt', 'translated filename uses language code');
const srt = readFileSync('/tmp/sb-out.srt', 'utf8');
ok(srt.includes('00:00:03,500 --> 00:00:06,000') && srt.includes('♪ ♪'), 'timings and symbol cue preserved');
for (const p of ['© Copyright owned by team denelli.in', 'Check subtranslator.denelli.in for more subs', 'follow denelli.in for more projects', 'Thanks for watching', 'Denelli Projects by shamilhabeebnelli']) ok(srt.includes('\n' + p + '\n'), 'download contains promo line: ' + p);
ok(srt.trim().split(/\n\n/).length === 9, 'four real cues plus five promo cues');
ok((await page.locator('footer').innerText()).includes('five short credit lines'), 'footer discloses credit lines');
ok(srt.includes('[en|ml] Where are you going tomorrow morning?'), 'request used en|ml pair');
ok(/<i>\[en\|ml\]/.test(srt) === false && /\[en\|ml\] <i>I have to meet the/.test(srt), 'multi-line italic tag restored');
const dl2 = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download bilingual SRT' }).click();
await (await dl2).saveAs('/tmp/sb-bi.srt');
ok(readFileSync('/tmp/sb-bi.srt', 'utf8').startsWith('1\n00:00:01,000 --> 00:00:03,200\nWhere are you going tomorrow morning?\n[en|ml]'), 'bilingual keeps original first');
await page.getByLabel('Translation of cue 1').fill('Manual edit');
const dl3 = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download translated SRT' }).click();
await (await dl3).saveAs('/tmp/sb-edit.srt');
ok(readFileSync('/tmp/sb-edit.srt', 'utf8').includes('Manual edit'), 'edited cell is exported');
await page.screenshot({ path: '/tmp/subbridge-desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '/tmp/subbridge-mobile.png', fullPage: true });
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile no horizontal overflow');
await page.setViewportSize({ width: 1280, height: 1000 });

// Quota mid-run then resume
await page.getByRole('button', { name: 'Clear' }).click();
ok(await page.locator('.cue').count() === 0, 'clear removes cues');
calls = 0; quotaAfter = 1;
await page.getByRole('button', { name: 'Try demo subtitles' }).click();
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Translate', exact: true }).click();
await page.getByText(/daily limit was reached/).waitFor();
ok(true, 'quota message shown');
ok(await page.getByText(/not translated and will keep the original text/).count() === 1, 'untranslated count warning');
const dl4 = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download translated SRT' }).click();
await (await dl4).saveAs('/tmp/sb-partial.srt');
ok(readFileSync('/tmp/sb-partial.srt', 'utf8').includes('I have to meet the'), 'partial export keeps original for untranslated cues');
quotaAfter = Infinity; calls = 0;
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Continue translating' }).click();
await page.getByText(/Finished\./).waitFor();
ok(calls === 3, 'resume requests only the remaining three segments');

// Literal markup safety
await page.getByRole('button', { name: 'Clear' }).click();
await page.locator('input[type=file]').setInputFiles({ name: 'x.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\n<img src=x onerror=alert(1)> hello\n') });
ok(await page.locator('.orig img').count() === 0 && (await page.locator('.orig').innerText()).includes('<img'), 'subtitle markup shown as text, not run');
await page.locator('input[type=file]').setInputFiles({ name: 'bad.srt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
ok(await page.getByRole('alert').innerText().then((s) => s.includes('No subtitle cues')), 'non-SRT gives clear error');

// LibreTranslate path (mocked local server)
await page.getByRole('button', { name: 'Try demo subtitles' }).click();
await page.getByLabel('Engine').selectOption('libre');
await page.getByLabel('LibreTranslate URL').fill('http://localhost:5000');
await page.getByRole('button', { name: 'Check languages' }).click();
await page.getByLabel('To language').selectOption('tamil');
await page.getByText(/not available on this engine/).waitFor();
ok(await page.getByRole('button', { name: 'Translate', exact: true }).isDisabled(), 'language missing on server is blocked');
await page.getByLabel('To language').selectOption('spanish');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Translate', exact: true }).click();
await page.getByText(/Finished\./).waitFor();
ok((await page.getByLabel('Translation of cue 1').inputValue()).startsWith('LT:'), 'LibreTranslate path translates');

// custom language
await page.locator('summary', { hasText: 'Add a language code' }).click();
await page.getByLabel('Language name').fill('German');
await page.getByLabel('Language code').fill('de');
await page.getByRole('button', { name: 'Add', exact: true }).click();
ok((await page.getByLabel('To language').inputValue()) === 'custom-de', 'custom language can be added');
ok(hosts.every((h) => ['api.mymemory.translated.net', 'localhost:5000'].includes(h)), 'only the chosen engines were contacted: ' + [...new Set(hosts)].join());
ok(errors.length === 0, 'no runtime errors');
console.log(n, 'browser checks passed');
await browser.close();
