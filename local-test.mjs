import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require_ps = () => Math.round(+execSync("ps -eo rss,comm | awk '/chrome/{s+=$1} END{print s/1024}'").toString());
const tgt = process.argv[2] || 'french', N = +(process.argv[3] || 300);
const srv = http.createServer((q, r) => { const f = /^\/[a-z0-9-]+\.js$/.test(q.url) ? q.url.slice(1) : 'index.html'; r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); r.end(readFileSync(f)); }).listen(8123);
const S = ["Okay, I will.","She said she would call me after the meeting.","Where were you last night?","We need to leave before they find us.","I don't know what you're talking about.","Please sit down and tell me everything.","It was the happiest day of my life.","Don't touch that, it's dangerous!","Do you really think he will come back?","The train leaves at six, so we have to hurry.","I've been waiting for you for two hours.","Let me explain what happened at the bank.","<i>Nobody</i> knows where the money is.","- Who are you?\n- A friend.","You should have told me the truth.","We'll talk about it in the morning.","How much did they pay you?","That's the last time I trust him.","Open the door, please.","I'm sorry, I didn't mean to hurt you."];
const NAMES = ['Anna','Peter','Maria','John','Sara','David','Laura','Mark','Julia','Tom','Nina','Paul','Eva','Lucas','Mia','Ben','Zoe','Adam','Ella','Max','Ivy','Leo','Amy','Sam','Kate','Jack','Rose','Noah','Lily','Dan','Ruth','Carl','Joan','Phil','Gina','Hugo','Iris','Ken','Lena','Omar','Pia','Quinn','Rita','Stan','Tina','Uma','Vic','Walt','Xena','Yan','Zack','Abe','Bea','Cy','Dot','Ed','Fay','Gus','Hal','Ida'];
let srt = '', t = 1000; for (let i = 0; i < N; i++) { const f = (ms) => new Date(ms).toISOString().substr(11, 12).replace('.', ','); srt += `${i + 1}\n${f(t)} --> ${f(t + 2500)}\n${NAMES[Math.floor(i / S.length) % NAMES.length]}${i < S.length ? '' : ', '}${S[i % S.length].replace(/^- /, '')}\n\n`; t += 2500 + (i % 7 === 0 ? 4500 : 800); }
const ctx = await chromium.launchPersistentContext('/tmp/chrome-prof', { ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--no-sandbox'], viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const page = ctx.pages()[0] || await ctx.newPage();
const errs = [], bytes = {}; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('response', async (r) => { try { const h = new URL(r.url()).host; const len = +(r.headers()['content-length'] || 0); bytes[h] = (bytes[h] || 0) + len; } catch {} });
await page.goto('http://localhost:8123/');
await page.getByLabel('Open SRT file').setInputFiles({ name: 'film.srt', mimeType: 'text/plain', buffer: Buffer.from(srt) });
await page.getByLabel('Engine').selectOption('local');
await page.getByLabel('From language').selectOption('english');
await page.getByLabel('To language').selectOption(tgt);
await page.getByRole('checkbox').check();
console.log('support text:', await page.locator('.support').innerText());
const t0 = Date.now();
await page.getByRole('button', { name: 'Translate', exact: true }).click();
let last = ''; let firstProgress = null;
for (let i = 0; i < 1800; i++) { await page.waitForTimeout(1000); const pv = await page.locator('progress').first().evaluate((e) => e.value + '/' + e.max).catch(() => '-'); const txt = pv + ' ' + (await page.locator('.status, .eta').allInnerTexts()).join(' | ').slice(0, 260); if (i === 20) await page.screenshot({ path: '/downloads/subbridge-eta.png' }); if (i % 15 === 0) { console.log(Math.round((Date.now() - t0) / 1000) + 's', txt); last = txt; } if (/Finished|Stopped/.test(txt)) { console.log('END', Math.round((Date.now() - t0) / 1000) + 's', txt); break; } }
const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download translated SRT' }).click(); const d = await dl; const p = await d.path(); const out = readFileSync(p, 'utf8'); writeFileSync('local-out-' + tgt + '.srt', out);
console.log('out cues approx', out.split('\n\n').length, 'errors', JSON.stringify(errs.slice(0, 3)), 'bytes by host', JSON.stringify(bytes));
console.log(out.split('\n\n').slice(0, 6).join('\n\n'));
console.log('RSS MB chrome total', require_ps()); await ctx.close(); srv.close();
