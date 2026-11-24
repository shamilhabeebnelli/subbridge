// SubBridge core: SRT parsing, safe segmenting, provider adapters, translation runner.
// No DOM, no storage. Network calls only through an injected fetch.

export const LIMITS = { bytes: 2 * 1024 * 1024, cues: 5000 };

// ---------- languages ----------
// mm = MyMemory code, lt = LibreTranslate code.
// mm 'yes' was probed live on 24 Nov 2026 (English to each). Everything else is a claim from docs, marked as such.
export const LANGUAGES = [
  { name: 'Malayalam', native: 'മലയാളം', mm: 'ml', lt: 'ml' },
  { name: 'English', native: 'English', mm: 'en', lt: 'en', loc: 'en' },
  { name: 'Hindi', native: 'हिन्दी', mm: 'hi', lt: 'hi', loc: 'hi' },
  { name: 'Tamil', native: 'தமிழ்', mm: 'ta', lt: 'ta' },
  { name: 'Telugu', native: 'తెలుగు', mm: 'te', lt: 'te' },
  { name: 'Kannada', native: 'ಕನ್ನಡ', mm: 'kn', lt: 'kn' },
  { name: 'Tulu', native: 'ತುಳು', mm: null, lt: null },
  { name: 'Arabic', native: 'العربية', mm: 'ar', lt: 'ar', loc: 'ar', rtl: true },
  { name: 'French', native: 'Français', mm: 'fr', lt: 'fr', loc: 'fr' },
  { name: 'Portuguese', native: 'Português', mm: 'pt', lt: 'pt' },
  { name: 'Malay', native: 'Bahasa Melayu', mm: 'ms', lt: 'ms' },
  { name: 'Urdu', native: 'اردو', mm: 'ur', lt: 'ur', rtl: true },
  { name: 'Chinese (Simplified)', native: '简体中文', mm: 'zh-CN', lt: 'zh', loc: 'zh' },
  { name: 'Spanish', native: 'Español', mm: 'es', lt: 'es', loc: 'es' },
  { name: 'Bengali', native: 'বাংলা', mm: 'bn', lt: 'bn' },
  { name: 'Indonesian', native: 'Bahasa Indonesia', mm: 'id', lt: 'id', loc: 'id' },
].map((l) => ({ id: l.name.toLowerCase().replace(/\W+/g, '-'), ...l }));

export const PROVIDERS = {
  mymemory: { label: 'MyMemory (free, no key, small daily limit)', maxChars: 480, host: 'api.mymemory.translated.net', key: 'mm', canAuto: true },
  local: { label: 'Offline in your browser (beta, English to 6 languages)', maxChars: 400, host: 'huggingface.co', key: 'loc', canAuto: false },
  libre: { label: 'LibreTranslate (your own server, no key)', maxChars: 4000, host: '', key: 'lt', canAuto: true },
};

// Custom language: { name, code } applies the same code to every provider (user's responsibility).
export function customLanguage(name, code) {
  const c = String(code || '').trim();
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(c)) throw new Error('Language code looks invalid. Use a code like "de" or "pt-BR".');
  return { id: 'custom-' + c.toLowerCase(), name: String(name || c).trim() || c, native: '', mm: c, lt: c, custom: true };
}

// 'yes' (code exists for this provider), 'no' (known not to work), 'unknown' (provider decides at run time).
export function support(providerId, lang, libreCodes) {
  const p = PROVIDERS[providerId];
  const code = lang[p.key];
  if (providerId === 'libre') {
    if (!code) return 'no';
    if (libreCodes) return libreCodes.includes(code) ? 'yes' : 'no';
    return 'unknown';
  }
  if (providerId === 'mymemory' && lang.custom) return 'unknown';
  return code ? 'yes' : 'no';
}

// ---------- SRT ----------
const TIME = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(.*)$/;

export function parseSrt(input) {
  let text = String(input);
  if (text.length > LIMITS.bytes) throw new Error('File is larger than 2 MiB.');
  text = text.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim();
  const cues = [];
  const skipped = [];
  if (!text) return { cues, skipped };
  const blocks = text.split(/\n{2,}/);
  for (const [bi, block] of blocks.entries()) {
    const lines = block.split('\n');
    let i = 0;
    let index = null;
    if (/^\d+$/.test(lines[0].trim()) && lines[1] !== undefined) { index = lines[0].trim(); i = 1; }
    const m = TIME.exec((lines[i] || '').trim());
    if (!m) { skipped.push(bi + 1); continue; }
    cues.push({ index: index ?? String(cues.length + 1), timing: lines[i].trim(), lines: lines.slice(i + 1) });
    if (cues.length > LIMITS.cues) throw new Error('More than 5000 cues.');
  }
  return { cues, skipped };
}

// ---------- tag protection ----------
const TAG = /<\/?[a-zA-Z][^<>]*>|\{\\[^{}]*\}/g;

// Leading and trailing tag runs stay outside the text sent out. Inner tags become numbered tokens.
export function protect(line, noTok = false) {
  const lead = (/^(?:\s*(?:<\/?[a-zA-Z][^<>]*>|\{\\[^{}]*\}))+/.exec(line) || [''])[0];
  const rest = line.slice(lead.length);
  const trail = (/(?:(?:<\/?[a-zA-Z][^<>]*>|\{\\[^{}]*\})\s*)+$/.exec(rest) || [''])[0];
  const body = rest.slice(0, rest.length - trail.length);
  const inner = [];
  const text = body.replace(TAG, (t) => { if (noTok) return ' '; inner.push(t); return `§${inner.length}§`; });
  return { lead, trail, inner, text };
}

export function restore(p, translated) {
  let out = translated;
  let simplified = false;
  for (const [i, tag] of p.inner.entries()) {
    const tok = new RegExp(`§\\s*${i + 1}\\s*§`);
    if (tok.test(out)) out = out.replace(tok, tag); else simplified = true;
  }
  out = out.replace(/§\s*\d+\s*§/g, () => { simplified = true; return ''; });
  return { text: p.lead + out.trim() + p.trail, simplified };
}

// ---------- segmenting ----------
// A cue becomes segments: one per line when it is a dash dialogue, else one joined segment.
// noTok: the offline model garbles number tokens (seen live), so inner tags are dropped before translation instead.
export function cueSegments(cue, noTok = false) {
  const lines = cue.lines.map((l) => l.trim()).filter((l) => l !== '');
  const dialogue = lines.length > 1 && lines.every((l) => /^[-–—]\s*/.test(l));
  const groups = dialogue ? lines.map((l) => [l]) : lines.length ? [lines] : [];
  return groups.map((g) => {
    if (g.length === 1) {
      // Dialogue dash is held back so engines cannot drop it; it is put back after translation.
      const d = dialogue ? /^[-–—]\s*/.exec(g[0])[0] : '';
      const p = protect(g[0].slice(d.length), noTok);
      return { single: p, dash: d ? d.trim() + ' ' : '', tags: [], text: p.text.replace(/\s+/g, ' ').trim(), lineCount: 1 };
    }
    // Several lines joined: every tag becomes a numbered token so tags that end one line and start the next survive.
    const tags = [];
    const joined = g.join(' ').replace(TAG, (t) => { if (noTok) return ' '; tags.push(t); return `§${tags.length}§`; });
    return { single: null, tags, text: joined.replace(/\s+/g, ' ').trim(), lineCount: g.length };
  });
}

export function restoreSeg(seg, translated) {
  if (seg.single) { const r = restore(seg.single, translated.replace(/^[-–—]\s*/, '')); return { ...r, text: (seg.dash || '') + r.text }; }
  let out = translated;
  let missing = false;
  for (const [i] of seg.tags.entries()) {
    const tok = new RegExp(`§\\s*${i + 1}\\s*§`);
    if (!tok.test(out)) missing = true;
  }
  if (missing) return { text: out.replace(/§\s*\d+\s*§/g, '').replace(/\s+/g, ' ').trim(), simplified: seg.tags.length > 0 };
  seg.tags.forEach((t, i) => { out = out.replace(new RegExp(`§\\s*${i + 1}\\s*§`), t); });
  return { text: out.replace(/§\s*\d+\s*§/g, '').replace(/\s+/g, ' ').trim(), simplified: false };
}

export function splitLong(text, max) {
  if (text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = -1;
    for (const re of [/[.!?।。！？؟…]\s/g, /[,;:،]\s/g, /\s/g]) {
      let m;
      let best = -1;
      while ((m = re.exec(rest.slice(0, max + 1)))) best = m.index + m[0].length;
      if (best > max * 0.3) { cut = best; break; }
    }
    if (cut < 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Put text back into n lines, splitting near equal character counts at spaces (or anywhere for unspaced scripts).
export function rebalance(text, n) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (n <= 1 || t.length < 2) return [t];
  const words = t.split(' ');
  if (words.length >= n) {
    const lines = [];
    let w = 0;
    for (let k = 0; k < n; k++) {
      const remainingLines = n - k;
      const remainingChars = words.slice(w).join(' ').length;
      const target = remainingChars / remainingLines;
      if (remainingLines === 1) { lines.push(words.slice(w).join(' ')); break; }
      let cur = [];
      while (w < words.length - (remainingLines - 1)) {
        const next = [...cur, words[w]].join(' ');
        if (cur.length && next.length > target && Math.abs(next.length - target) > Math.abs(cur.join(' ').length - target)) break;
        cur.push(words[w++]);
      }
      lines.push(cur.join(' '));
    }
    return lines;
  }
  const chars = [...t];
  const size = Math.ceil(chars.length / n);
  return Array.from({ length: n }, (_, k) => chars.slice(k * size, (k + 1) * size).join('')).filter(Boolean);
}

export function plan(cues, provider) {
  const max = PROVIDERS[provider].maxChars;
  const jobs = [];
  let chars = 0;
  cues.forEach((cue, ci) => cueSegments(cue, provider === 'local').forEach((seg, si) => {
    if (!/[\p{L}\p{N}]/u.test(seg.text)) return; // pure symbols or music notes: leave alone
    const parts = splitLong(seg.text, max);
    jobs.push({ ci, si, parts });
    chars += seg.text.length;
  }));
  const requests = new Set(jobs.flatMap((j) => j.parts)).size;
  return { jobs, chars, requests };
}

// ---------- providers ----------
export class QuotaError extends Error {}
export class ConfigError extends Error {}

const QUOTA_TEXT = /MYMEMORY WARNING|USED ALL AVAILABLE FREE TRANSLATIONS|QUOTA/i;

export function makeProvider(id, opts, fetchFn) {
  const f = fetchFn;
  if (id === 'mymemory') {
    return async (text, src, tgt, signal) => {
      const q = new URLSearchParams({ q: text, langpair: `${src === 'auto' ? 'Autodetect' : src}|${tgt}` });
      if (opts.email) q.set('de', opts.email);
      const r = await f(`https://api.mymemory.translated.net/get?${q}`, { signal });
      if (r.status === 429) throw new QuotaError('MyMemory daily limit reached.');
      const d = await r.json().catch(() => ({}));
      const status = Number(d.responseStatus || r.status);
      const out = d?.responseData?.translatedText;
      if (typeof out === 'string' && QUOTA_TEXT.test(out)) throw new QuotaError('MyMemory daily limit reached.');
      if (status === 403 || status === 400) throw new ConfigError(String(d.responseDetails || 'MyMemory rejected the language pair.').slice(0, 160));
      if (status !== 200 || typeof out !== 'string') throw new Error(`MyMemory error ${status}`);
      return out;
    };
  }
  if (id === 'local') {
    return async (text, src, tgt, signal) => {
      if (!opts.worker) throw new ConfigError('The offline engine needs the hosted page (it uses a background worker).');
      if (src !== 'auto' && src !== 'en') throw new ConfigError('The offline engine translates English subtitles only.');
      return opts.worker(text, tgt, signal);
    };
  }
  if (id === 'libre') {
    return async (text, src, tgt, signal) => {
      const base = String(opts.url || '').trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(base)) throw new ConfigError('Enter the LibreTranslate server URL, such as http://localhost:5000.');
      const body = { q: text, source: src, target: tgt, format: 'text' };
      const r = await f(`${base}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429) throw new QuotaError('LibreTranslate rate limit reached.');
      if (r.status === 400 || r.status === 403) throw new ConfigError(String(d.error || 'LibreTranslate rejected the request.').slice(0, 160));
      if (!r.ok || typeof d.translatedText !== 'string') throw new Error(`LibreTranslate error ${r.status}`);
      return d.translatedText;
    };
  }
  throw new Error('Unknown provider');
}

export async function libreLanguages(url, fetchFn) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) throw new ConfigError('Enter the LibreTranslate server URL first.');
  const r = await fetchFn(`${base}/languages`);
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error('Unexpected /languages response.');
  return d.map((x) => x.code);
}

// ---------- runner ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deterministic leak check: engine output holding a glued letters+digits fragment, or a stray section sign, that the source never had.
export function leaked(source, translated) {
  const frag = /[A-Z]{2,}\d+|\d+[A-Z]{2,}|§/g;
  const bad = (translated.replace(/§\s*\d+\s*§/g, '').match(frag) || []);
  return bad.some((b) => !source.includes(b));
}

// Translate planned jobs one request at a time. Stops on quota or config errors and returns what finished.
export async function run({ cues, provider, src, tgt, translate, onProgress = () => {}, signal, wait = sleep, retries = 2, gapMs = 250, have }) {
  const { jobs, chars } = plan(cues, provider);
  const cache = new Map();
  const out = have ?? new Map(); // `${ci}:${si}` -> {text, simplified}
  const failed = [];
  let done = 0;
  let stopped = null;
  const segFor = (j) => cueSegments(cues[j.ci], provider === 'local')[j.si];
  for (const job of jobs) {
    if (signal?.aborted) { stopped = 'stopped'; break; }
    const seg = segFor(job);
    if (out.has(`${job.ci}:${job.si}`)) { done += seg.text.length; continue; }
    const pieces = [];
    try {
      for (const part of job.parts) {
        if (!cache.has(part)) {
          let attempt = 0;
          for (;;) {
            try { cache.set(part, await translate(part, src, tgt, signal)); break; } catch (e) {
              if (e instanceof QuotaError || e instanceof ConfigError || signal?.aborted || attempt >= retries) throw e;
              await wait(600 * 2 ** attempt++);
            }
          }
          await wait(gapMs);
        }
        pieces.push(cache.get(part));
      }
    } catch (e) {
      if (e instanceof QuotaError) { stopped = 'quota'; break; }
      if (e instanceof ConfigError) { stopped = 'config:' + e.message; break; }
      if (signal?.aborted) { stopped = 'stopped'; break; }
      failed.push({ ci: job.ci, si: job.si, error: String(e.message || e).slice(0, 120) });
      continue;
    }
    const joined = pieces.join(' ').trim();
    if (leaked(seg.text, joined)) { failed.push({ ci: job.ci, si: job.si, error: 'garbled output (control token leaked), line left untranslated' }); continue; }
    const r = restoreSeg(seg, joined);
    out.set(`${job.ci}:${job.si}`, { text: r.text, simplified: r.simplified, lineCount: seg.lineCount });
    done += seg.text.length;
    onProgress({ done, total: chars });
  }
  return { out, failed, stopped, total: chars, done };
}

// Build final cue lines for one cue from its translated segments.
export function cueTranslation(cue, out, ci) {
  const segs = cueSegments(cue);
  if (!segs.length) return { lines: cue.lines.slice(), translated: false, simplified: false };
  let simplified = false;
  const lines = [];
  let any = false;
  for (const [si, seg] of segs.entries()) {
    const r = out.get(`${ci}:${si}`);
    if (!r) {
      if (!/[\p{L}\p{N}]/u.test(seg.text)) { // symbols or music notes only: nothing to translate, keep as is
        lines.push(...(segs.length > 1 && seg.single ? [(seg.dash || '') + seg.single.lead + seg.single.text + seg.single.trail] : cue.lines));
        any = true;
        continue;
      }
      return { lines: cue.lines.slice(), translated: false, simplified };
    }
    any = true;
    simplified = simplified || r.simplified;
    const n = segs.length > 1 ? 1 : seg.lineCount; // dialogue: one line per segment
    lines.push(...rebalance(r.text, n));
  }
  return { lines, translated: any, simplified };
}

// Promo lines supplied by the project owner. They are added as extra cues, never merged into real cues.
export const PROMOS = [
  '© Copyright owned by team denelli.in',
  'Check subtranslator.denelli.in for more subs',
  'follow denelli.in for more projects',
  'Thanks for watching',
  'Denelli Projects by shamilhabeebnelli',
];
const PROMO_MS = 3000;
const PROMO_MARGIN = 200;

const TIMING = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const ms = (h, m, s, f) => ((+h * 60 + +m) * 60 + +s) * 1000 + +String(f).padEnd(3, '0');
export function parseTiming(t) {
  const m = TIMING.exec(t);
  return m ? { start: ms(m[1], m[2], m[3], m[4]), end: ms(m[5], m[6], m[7], m[8]) } : null;
}
export function fmtMs(x) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(x / 3600000))}:${p(Math.floor(x / 60000) % 60)}:${p(Math.floor(x / 1000) % 60)},${p(x % 1000, 3)}`;
}

// Put the five promo lines into silent gaps, spread through the film in order (about 10/30/50/70/90% of runtime).
// A line is 3 s. If only a shorter gap is near, the line is shortened to 2 s. Only when no gap fits does it go
// after the last cue. Real cue timings never move. Random jitter (about 3% of runtime) makes every export differ.
// rng returns a number in [0, 1).
const PROMO_MIN_MS = 2000;
export function addPromos(blocks, rng = Math.random) {
  const timed = blocks.map((b) => ({ b, t: parseTiming(b.timing) })).filter((x) => x.t).sort((x, y) => x.t.start - y.t.start);
  if (!timed.length) return { blocks: blocks.slice(), placed: [], atEnd: PROMOS.length, shortened: 0 };
  const gaps = [];
  let maxEnd = 0;
  timed.forEach((x, i) => {
    if (x.t.start - maxEnd >= PROMO_MIN_MS + 2 * PROMO_MARGIN && (i > 0 || x.t.start > 0)) gaps.push({ from: maxEnd, to: x.t.start });
    maxEnd = Math.max(maxEnd, x.t.end);
  });
  const total = maxEnd;
  const used = new Set();
  const placed = [];
  let atEnd = 0;
  let shortened = 0;
  let endCursor = maxEnd + PROMO_MARGIN * 2;
  let lastStart = -1;
  PROMOS.forEach((text, k) => {
    const frac = (k + 0.5) / PROMOS.length + (rng() - 0.5) * 0.06;
    const target = Math.min(0.97, Math.max(0.02, frac)) * total;
    const pick = (needMs) => {
      let best = -1;
      let bestD = Infinity;
      gaps.forEach((g, gi) => {
        if (used.has(gi) || g.from < lastStart || g.to - g.from < needMs + 2 * PROMO_MARGIN) return;
        const d = target < g.from ? g.from - target : target > g.to ? target - g.to : 0;
        if (d < bestD) { bestD = d; best = gi; }
      });
      return best >= 0 && bestD <= total * 0.35 ? best : -1;
    };
    let dur = PROMO_MS;
    let gi = atEnd ? -1 : pick(PROMO_MS);
    if (gi < 0 && !atEnd) { gi = pick(PROMO_MIN_MS); if (gi >= 0) { dur = Math.min(PROMO_MS, gaps[gi].to - gaps[gi].from - 2 * PROMO_MARGIN); shortened++; } }
    let start;
    if (gi >= 0) {
      used.add(gi);
      const lo = gaps[gi].from + PROMO_MARGIN;
      const hi = gaps[gi].to - PROMO_MARGIN - dur;
      start = Math.round(lo + rng() * (hi - lo));
      lastStart = start;
    } else {
      start = endCursor;
      endCursor += PROMO_MS + PROMO_MARGIN * 2;
      atEnd++;
    }
    placed.push({ text, start, dur });
  });
  const extra = placed.map((p) => ({ index: '', timing: `${fmtMs(p.start)} --> ${fmtMs(p.start + p.dur)}`, lines: [p.text], promo: true, start: p.start }));
  const all = [...timed.map((x) => ({ ...x.b, start: x.t.start })), ...extra].sort((x, y) => x.start - y.start);
  return { blocks: all.map((b, i) => ({ ...b, index: String(i + 1) })), placed, atEnd, shortened };
}

export function buildSrt(cues, edits, mode = 'translated', opts = {}) {
  let blocks = cues.map((cue, i) => {
    const tr = edits[i] ?? cue.lines;
    return { index: cue.index, timing: cue.timing, lines: mode === 'bilingual' ? [...cue.lines, ...tr] : tr };
  });
  if (opts.promos) blocks = addPromos(blocks, opts.rng).blocks;
  return blocks.map((b) => `${b.index}\n${b.timing}\n${b.lines.join('\n')}`).join('\n\n') + '\n';
}

export const DEMO = `1
00:00:01,000 --> 00:00:03,200
Where are you going tomorrow morning?

2
00:00:03,500 --> 00:00:06,000
<i>I have to meet the doctor,</i>
then we can talk.

3
00:00:06,500 --> 00:00:08,800
- Did you eat?
- Not yet.

4
00:00:09,000 --> 00:00:11,000
♪ ♪
`;

// Estimated time left from observed progress in the current run only.
// base = first progress sample of this run {t, done}; cur = latest {t, done, total}.
// Returns null until there is enough data (at least 8 s of observed translation and some progress).
export function etaSeconds(base, cur) {
  if (!base || !cur) return null;
  const dt = (cur.t - base.t) / 1000, dd = cur.done - base.done;
  if (dt < 8 || dd <= 0) return null;
  const left = cur.total - cur.done;
  if (left <= 0) return 0;
  return Math.ceil(left / (dd / dt));
}
export function fmtDuration(s) {
  if (s < 45) return 'under a minute';
  if (s < 3600) return `about ${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return `about ${h} h ${m} min`;
}
