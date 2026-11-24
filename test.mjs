import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from './core.js';

const fake = (map = (t) => `T(${t})`) => async (t) => map(t);

test('target list counts: 16 total, 15 non-English, 14 non-English supported by MyMemory', () => {
  assert.equal(C.LANGUAGES.length, 16);
  assert.equal(C.LANGUAGES.filter((l) => l.name !== 'English').length, 15);
  const ok = C.LANGUAGES.filter((l) => l.name !== 'English' && C.support('mymemory', l) === 'yes');
  assert.equal(ok.length, 14);
  assert.equal(C.support('mymemory', C.LANGUAGES.find((l) => l.id === 'tulu')), 'no');
  assert.equal(C.support('libre', C.LANGUAGES.find((l) => l.id === 'tulu')), 'no');
});

test('parseSrt keeps index, timing, lines; handles BOM, CRLF, missing index, skips junk', () => {
  const r = C.parseSrt('\ufeff1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\nthere\r\n\r\n00:00:03,000 --> 00:00:04,500\r\nNo index\r\n\r\nnot a cue\r\n');
  assert.equal(r.cues.length, 2);
  assert.deepEqual(r.cues[0].lines, ['Hi', 'there']);
  assert.equal(r.cues[0].timing, '00:00:01,000 --> 00:00:02,000');
  assert.equal(r.cues[1].index, '2');
  assert.deepEqual(r.skipped, [3]);
});

test('parseSrt rejects oversize input', () => {
  assert.throws(() => C.parseSrt('x'.repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
});

test('protect/restore: leading and trailing tags stay, inner tags use tokens', () => {
  const p = C.protect('<i>Hello <b>big</b> world</i>');
  assert.equal(p.lead, '<i>');
  assert.equal(p.trail, '</i>');
  assert.equal(p.text, 'Hello §1§big§2§ world');
  assert.equal(C.restore(p, 'Hola §1§gran§2§ mundo').text, '<i>Hola <b>gran</b> mundo</i>');
  const lost = C.restore(p, 'Hola gran mundo');
  assert.equal(lost.text, '<i>Hola gran mundo</i>');
  assert.equal(lost.simplified, true);
});

test('protect handles ASS-style positioning tags', () => {
  const p = C.protect('{\\an8}Top line');
  assert.equal(p.lead, '{\\an8}');
  assert.equal(C.restore(p, 'Linea superior').text, '{\\an8}Linea superior');
});

test('dash dialogue is segmented per line, normal cue is joined', () => {
  const dlg = C.cueSegments({ lines: ['- Did you eat?', '- Not yet.'] });
  assert.equal(dlg.length, 2);
  const one = C.cueSegments({ lines: ['I have to go,', 'then we talk.'] });
  assert.equal(one.length, 1);
  assert.equal(one[0].text, 'I have to go, then we talk.');
  assert.equal(one[0].lineCount, 2);
});

test('splitLong keeps pieces under the limit and loses no words', () => {
  const t = 'One two three four. Five six seven eight, nine ten eleven twelve thirteen fourteen fifteen.';
  const parts = C.splitLong(t, 30);
  assert.ok(parts.every((p) => p.length <= 30), JSON.stringify(parts));
  assert.equal(parts.join(' '), t);
});

test('rebalance: two lines near equal; unspaced scripts split by characters', () => {
  const l = C.rebalance('Vou ao médico amanhã de manhã cedo', 2);
  assert.equal(l.length, 2);
  assert.equal(l.join(' '), 'Vou ao médico amanhã de manhã cedo');
  assert.ok(Math.abs(l[0].length - l[1].length) <= 8);
  const z = C.rebalance('我明天得去看医生然后回家', 2);
  assert.equal(z.length, 2);
  assert.equal(z.join(''), '我明天得去看医生然后回家');
  assert.deepEqual(C.rebalance('one line', 1), ['one line']);
});

test('plan skips symbol-only cues and dedupes requests', () => {
  const { cues } = C.parseSrt(C.DEMO);
  const p = C.plan(cues, 'mymemory');
  assert.equal(p.jobs.some((j) => j.ci === 3), false);
  assert.equal(p.requests, new Set(p.jobs.flatMap((j) => j.parts)).size);
});

test('run translates, rebuilds SRT with identical timings and numbering', async () => {
  const { cues } = C.parseSrt(C.DEMO);
  const res = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: fake((t) => `ES:${t}`), wait: async () => {} });
  assert.equal(res.stopped, null);
  const edits = cues.map((c, i) => C.cueTranslation(c, res.out, i).lines);
  const srt = C.buildSrt(cues, edits);
  const back = C.parseSrt(srt).cues;
  assert.equal(back.length, cues.length);
  back.forEach((c, i) => { assert.equal(c.timing, cues[i].timing); assert.equal(c.index, cues[i].index); });
  assert.match(srt, /ES:<i>I have to meet the\s+doctor,<\/i> then we can talk\./);
  assert.match(srt, /- ES:Did you eat\?\n- ES:Not yet\./);
  assert.match(srt, /♪ ♪/); // symbol-only cue untouched
});

test('bilingual output keeps original then translation', () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\nHello\n');
  assert.equal(C.buildSrt(cues, [['Hola']], 'bilingual', {}), '1\n00:00:01,000 --> 00:00:02,000\nHello\nHola\n');
});

test('quota stops the run and returns partial work; untranslated cues keep original text', async () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo\n\n3\n00:00:05,000 --> 00:00:06,000\nThree\n');
  let n = 0;
  const tr = async (t) => { if (++n > 1) throw new C.QuotaError('limit'); return 'UNO'; };
  const res = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: tr, wait: async () => {} });
  assert.equal(res.stopped, 'quota');
  assert.equal(C.cueTranslation(cues[0], res.out, 0).translated, true);
  const c2 = C.cueTranslation(cues[1], res.out, 1);
  assert.equal(c2.translated, false);
  assert.deepEqual(c2.lines, ['Two']);
});

test('transient failures retry then are recorded; run continues', async () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo\n');
  let calls = 0;
  const tr = async (t) => { calls++; if (t === 'One') throw new Error('net'); return 'DOS'; };
  const res = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: tr, wait: async () => {}, retries: 1 });
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].ci, 0);
  assert.equal(calls, 3); // One twice, Two once
  assert.equal(C.cueTranslation(cues[1], res.out, 1).translated, true);
});

test('duplicate lines are translated once', async () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\nYes\n\n2\n00:00:03,000 --> 00:00:04,000\nYes\n');
  let calls = 0;
  await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: async () => { calls++; return 'Si'; }, wait: async () => {} });
  assert.equal(calls, 1);
});

test('abort signal stops the run', async () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo\n');
  const ac = new AbortController();
  const res = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: async () => { ac.abort(); return 'X'; }, signal: ac.signal, wait: async () => {} });
  assert.equal(res.stopped, 'stopped');
});

// ---- provider adapters with fake fetch ----
const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('MyMemory adapter: URL, autodetect, email, success', async () => {
  let url;
  const p = C.makeProvider('mymemory', { email: 'a@b.c' }, async (u) => { url = u; return resp(200, { responseStatus: 200, responseData: { translatedText: 'Hola' } }); });
  assert.equal(await p('Hello world', 'auto', 'es'), 'Hola');
  assert.match(url, /langpair=Autodetect%7Ces/);
  assert.match(url, /de=a%40b.c/);
  assert.match(url, /q=Hello\+world/);
});

test('MyMemory adapter: quota text and 429 become QuotaError, 403 becomes ConfigError', async () => {
  const mk = (r) => C.makeProvider('mymemory', {}, async () => r);
  await assert.rejects(mk(resp(200, { responseStatus: 200, responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' } }))('x', 'en', 'es'), C.QuotaError);
  await assert.rejects(mk(resp(429, {}))('x', 'en', 'es'), C.QuotaError);
  await assert.rejects(mk(resp(200, { responseStatus: 403, responseDetails: "'TCY' IS AN INVALID TARGET LANGUAGE" }))('x', 'en', 'tcy'), C.ConfigError);
});

test('LibreTranslate adapter: needs URL, posts JSON without a key field', async () => {
  await assert.rejects(C.makeProvider('libre', {}, async () => resp(200, {}))('x', 'en', 'es'), C.ConfigError);
  let init;
  const p = C.makeProvider('libre', { url: 'http://localhost:5000/' }, async (u, i) => { init = { u, i }; return resp(200, { translatedText: 'Hola' }); });
  assert.equal(await p('Hello', 'en', 'es'), 'Hola');
  assert.equal(init.u, 'http://localhost:5000/translate');
  assert.equal(JSON.parse(init.i.body).api_key, undefined);
});

test('libreLanguages marks support from the instance list', async () => {
  const codes = await C.libreLanguages('http://x', async () => resp(200, [{ code: 'en' }, { code: 'ml' }]));
  const ml = C.LANGUAGES.find((l) => l.id === 'malayalam');
  const ta = C.LANGUAGES.find((l) => l.id === 'tamil');
  assert.equal(C.support('libre', ml, codes), 'yes');
  assert.equal(C.support('libre', ta, codes), 'no');
  assert.equal(C.support('libre', ta), 'unknown');
});

test('customLanguage validates code', () => {
  assert.equal(C.customLanguage('German', 'de').mm, 'de');
  assert.throws(() => C.customLanguage('x', 'not a code!'), /invalid/);
});

test('resume: already translated segments are not requested again', async () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\nOne\n\n2\n00:00:03,000 --> 00:00:04,000\nTwo\n');
  const have = new Map([['0:0', { text: 'UNO', simplified: false, lineCount: 1 }]]);
  const seen = [];
  const res = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: async (t) => { seen.push(t); return 'DOS'; }, wait: async () => {}, have });
  assert.deepEqual(seen, ['Two']);
  assert.equal(res.out.size, 2);
});

test('dialogue dash is restored even when the engine drops it or adds its own', async () => {
  const { cues } = C.parseSrt('1\n00:00:01,000 --> 00:00:02,000\n- Yes.\n- No.\n');
  const r = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: async (t) => (t === 'Yes.' ? 'Si.' : '- No.'), wait: async () => {} });
  assert.deepEqual(C.cueTranslation(cues[0], r.out, 0).lines, ['- Si.', '- No.']);
});

test('symbol-only cue counts as done and keeps its text', async () => {
  const { cues } = C.parseSrt(C.DEMO);
  const r = await C.run({ cues, provider: 'mymemory', src: 'en', tgt: 'es', translate: async (t) => 'X', wait: async () => {} });
  const c = C.cueTranslation(cues[3], r.out, 3);
  assert.equal(c.translated, true);
  assert.deepEqual(c.lines, ['♪ ♪']);
});

// ---- promo lines ----
const longFile = () => {
  const blocks = [];
  for (let i = 0; i < 40; i++) { const st = 5000 + i * 10000; blocks.push(`${i + 1}\n${C.fmtMs(st)} --> ${C.fmtMs(st + 4000)}\nLine ${i}\n`); }
  return C.parseSrt(blocks.join('\n')).cues;
};
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('promos: exact five texts, in order, no overlap, real timings untouched, renumbered', () => {
  const cues = longFile();
  const srt = C.buildSrt(cues, cues.map((c) => c.lines), 'translated', { promos: true, rng: seeded(1) });
  const out = C.parseSrt(srt).cues;
  assert.equal(out.length, 45);
  out.forEach((c, i) => assert.equal(c.index, String(i + 1)));
  const promoCues = out.filter((c) => C.PROMOS.includes(c.lines[0]));
  assert.deepEqual(promoCues.map((c) => c.lines[0]), C.PROMOS);
  const real = out.filter((c) => /^Line /.test(c.lines[0]));
  real.forEach((c, i) => assert.equal(c.timing, cues[i].timing));
  const iv = out.map((c) => C.parseTiming(c.timing));
  for (let i = 1; i < iv.length; i++) assert.ok(iv[i].start >= iv[i - 1].end, `overlap at ${i}`);
});

test('promos: different exports put them at different times', () => {
  const cues = longFile();
  const when = (seed) => C.parseSrt(C.buildSrt(cues, cues.map((c) => c.lines), 'translated', { promos: true, rng: seeded(seed) })).cues.filter((c) => C.PROMOS.includes(c.lines[0])).map((c) => c.timing).join('|');
  assert.notEqual(when(1), when(2));
  assert.notEqual(when(2), when(3));
  assert.equal(when(5), when(5));
});

test('promos: file without gaps puts them after the last cue without overlap', () => {
  const tight = C.parseSrt('1\n00:00:00,000 --> 00:00:02,000\nA\n\n2\n00:00:02,000 --> 00:00:04,000\nB\n').cues;
  const r = C.addPromos(tight.map((c) => ({ index: c.index, timing: c.timing, lines: c.lines })), seeded(4));
  assert.equal(r.atEnd, 5);
  const iv = r.blocks.map((b) => C.parseTiming(b.timing));
  for (let i = 1; i < iv.length; i++) assert.ok(iv[i].start >= iv[i - 1].end);
  assert.deepEqual(r.blocks.slice(2).map((b) => b.lines[0]), C.PROMOS);
});

test('promos: bilingual mode also gets them and promo text is never translated', () => {
  const cues = longFile();
  const srt = C.buildSrt(cues, cues.map((c) => ['X']), 'bilingual', { promos: true, rng: seeded(9) });
  for (const p of C.PROMOS) assert.ok(srt.includes('\n' + p + '\n'));
  assert.ok(srt.includes('Line 0\nX'));
});

test('parseTiming and fmtMs round trip', () => {
  assert.equal(C.fmtMs(C.parseTiming('01:02:03,004 --> 01:02:05,000').start), '01:02:03,004');
});

test('promos: spread through the film near 10/30/50/70/90 percent', () => {
  const cues = longFile();
  const r = C.addPromos(cues.map((c) => ({ index: c.index, timing: c.timing, lines: c.lines })), seeded(7));
  const total = 5000 + 39 * 10000 + 4000;
  r.placed.forEach((p, k) => assert.ok(Math.abs(p.start / total - (0.1 + 0.2 * k)) < 0.1, `promo ${k} at ${p.start / total}`));
  assert.equal(r.atEnd, 0);
});
test('promos: sparse gaps shorten a line to 2s, then fall back to the end', () => {
  const mk = (gap, n) => { const b = []; for (let i = 0; i < n; i++) { const st = i * (2000 + gap); b.push(`${i + 1}\n${C.fmtMs(st)} --> ${C.fmtMs(st + 2000)}\nL${i}\n`); } return C.parseSrt(b.join('\n')).cues.map((c) => ({ index: c.index, timing: c.timing, lines: c.lines })); };
  const a = C.addPromos(mk(2600, 30), seeded(3));
  assert.equal(a.shortened, 5); assert.equal(a.atEnd, 0);
  a.placed.forEach((p) => assert.ok(p.dur >= 2000 && p.dur <= 2600));
  const iv = a.blocks.map((b) => C.parseTiming(b.timing));
  for (let i = 1; i < iv.length; i++) assert.ok(iv[i].start >= iv[i - 1].end);
  const few = C.addPromos(mk(1000, 30), seeded(3));
  assert.equal(few.atEnd, 5);
});
