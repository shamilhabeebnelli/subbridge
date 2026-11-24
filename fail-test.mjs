import { chromium } from '@playwright/test';
import http from 'node:http'; import { readFileSync } from 'node:fs';
const mode = process.argv[2];
const srv = http.createServer((q, r) => { const f = /^\/[a-z0-9-]+\.js$/.test(q.url) ? q.url.slice(1) : 'index.html'; r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); r.end(readFileSync(f)); }).listen(8125);
const ctx = await chromium.launchPersistentContext('/tmp/chrome-prof-fail' + mode, { ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--no-sandbox'] });
const page = ctx.pages()[0] || await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(e.message)); 
if (mode === 'blocked') await page.route(/huggingface\.co|hf\.co|jsdelivr/, (r) => r.abort());
await page.goto(mode === 'file' ? 'file://' + process.cwd() + '/index.html' : 'http://localhost:8125/');
await page.getByRole('button', { name: 'Try demo subtitles' }).click();
await page.getByLabel('Engine').selectOption('local'); await page.getByLabel('From language').selectOption('english'); await page.getByLabel('To language').selectOption('french');
await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Translate', exact: true }).click();
let last = ''; for (let i = 0; i < 40; i++) { await page.waitForTimeout(1500); last = (await page.locator('.status').allInnerTexts()).join(' | ').slice(0, 300); if (/Finished|Stopped/.test(last)) break; }
console.log(mode, '=>', last, '| busy button disabled:', await page.getByRole('button', { name: /Translate/ }).first().isDisabled(), '| cue text:', (await page.locator('.cue').first().innerText()).replace(/\n/g, ' / ').slice(0, 120), '| errors', JSON.stringify(errs.slice(0, 2)));
await ctx.close(); srv.close(); if (!/Offline engine said/.test(last) || errs.length) { console.log('FAIL'); process.exit(1); } console.log('PASS ' + mode);
