import { render } from 'preact';
import { useState, useRef, useMemo } from 'preact/hooks';
import * as C from './core.js';

const EN = C.LANGUAGES.find((l) => l.id === 'english');
const PROBED = 'Probed on 24 Nov 2026: one short sentence per language, English to this language. Not a quality guarantee.';

const secureRng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function App() {
  const [cues, setCues] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [error, setError] = useState('');
  const [langs, setLangs] = useState(C.LANGUAGES);
  const [src, setSrc] = useState('auto');
  const [tgt, setTgt] = useState('spanish');
  const [engine, setEngine] = useState('mymemory');
  const [libreUrl, setLibreUrl] = useState('');
  const [libreCodes, setLibreCodes] = useState(null);
  const [consent, setConsent] = useState(false);
  const [custom, setCustom] = useState({ name: '', code: '' });
  const [out, setOut] = useState(() => new Map());
  const [manual, setManual] = useState({});
  const [progress, setProgress] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [eta, setEta] = useState(null);
  const etaBase = useRef(null);
  const [fileKey, setFileKey] = useState(0);
  const ac = useRef(null);

  const target = langs.find((l) => l.id === tgt) || EN;
  const source = src === 'auto' ? null : langs.find((l) => l.id === src);
  const plan = useMemo(() => C.plan(cues, engine), [cues, engine]);
  const sup = C.support(engine, target, libreCodes);
  const supSrc = source ? C.support(engine, source, libreCodes) : 'yes';
  const host = engine === 'mymemory' ? 'api.mymemory.translated.net' : engine === 'local' ? 'huggingface.co and cdn.jsdelivr.net (model and runtime files only)' : (libreUrl || 'your LibreTranslate server');

  function reset() { setOut(new Map()); setManual({}); setProgress(null); setStatus(''); setConsent(false); }
  function load(text) {
    try {
      const r = C.parseSrt(text);
      if (!r.cues.length) throw new Error('No subtitle cues found. Open an SRT file.');
      reset(); setError(''); setCues(r.cues); setSkipped(r.skipped);
    } catch (e) { setError(e.message); }
  }
  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > C.LIMITS.bytes) { setError('File is larger than 2 MiB.'); return; }
    const buf = await f.arrayBuffer();
    load(new TextDecoder('utf-8').decode(buf));
  }
  function addCustom() {
    try {
      const l = C.customLanguage(custom.name, custom.code);
      if (!langs.some((x) => x.id === l.id)) setLangs([...langs, l]);
      setTgt(l.id); setError(''); setCustom({ name: '', code: '' });
    } catch (e) { setError(e.message); }
  }
  async function checkLibre() {
    try { setLibreCodes(await C.libreLanguages(libreUrl, (u) => fetch(u))); setError(''); } catch (e) { setError('Could not read languages: ' + e.message); }
  }
  const wk = useRef(null);
  const lastLocalErr = useRef('');
  function localTranslate(text, tgtCode, signal) {
    if (!wk.current) {
      let w; try { w = new Worker('worker.js', { type: 'module' }); } catch (e) { lastLocalErr.current = 'The offline engine could not start. Open the page from its web address (not a saved file) in a current browser. ' + e.message; throw new Error(lastLocalErr.current); }
      wk.current = { w, n: 0, pending: new Map() };
      w.onmessage = (e) => {
        const m = e.data; const p = wk.current.pending.get(m.id);
        if (m.type === 'progress') { setStatus(`Downloading the offline model (first use only, then cached): ${m.file.split('/').pop()} ${Math.round((m.loaded || 0) / 1048576)} of ${Math.round((m.total || 0) / 1048576)} MB`); return; }
        if (!p) return;
        wk.current.pending.delete(m.id);
        if (m.type === 'done') p.res(m.text); else { lastLocalErr.current = m.error; p.rej(new Error(m.error)); }
      };
      w.onerror = (e) => { for (const p of wk.current.pending.values()) { lastLocalErr.current = 'The offline engine could not start. Open the page from its web address (not a saved file) in a current browser. ' + (e.message || ''); p.rej(new Error(lastLocalErr.current)); }; wk.current.pending.clear(); wk.current = null; };
    }
    const cur = wk.current; const id = ++cur.n;
    return new Promise((res, rej) => { cur.pending.set(id, { res, rej }); cur.w.postMessage({ id, tgt: tgtCode, text }); signal?.addEventListener('abort', () => rej(new Error('stopped'))); });
  }
  async function start() {
    setError(''); setBusy(true); setStatus('Translating…'); etaBase.current = null; lastLocalErr.current = ''; setEta({ state: 'start' });
    ac.current = new AbortController();
    try {
      const translate = C.makeProvider(engine, { url: libreUrl, worker: localTranslate }, (...a) => fetch(...a));
      const have = new Map(out);
      const r = await C.run({
        cues, provider: engine, src: source ? source[C.PROVIDERS[engine].key] : 'auto', tgt: target[C.PROVIDERS[engine].key],
        translate, signal: ac.current.signal, have, onProgress: (p) => { const now = Date.now(); if (!etaBase.current) etaBase.current = { t: now, done: p.done }; const sec = C.etaSeconds(etaBase.current, { t: now, done: p.done, total: p.total }); setEta(sec === null ? { state: 'estimating' } : { state: 'eta', sec, at: now + sec * 1000 }); setProgress(p); setStatus((s) => (s.startsWith('Downloading') ? 'Translating…' : s)); },
      });
      setOut(new Map(r.out));
      const left = cues.filter((c, i) => !C.cueTranslation(c, r.out, i).translated && C.cueSegments(c).length).length;
      if (r.stopped === 'quota') setStatus(`Stopped: the service's daily limit was reached. ${left}. You can continue later; finished cues are kept while this page stays open.`);
      else if (r.stopped?.startsWith('config:')) setStatus('Stopped: ' + r.stopped.slice(7));
      else if (r.stopped === 'stopped') setStatus(`Stopped. ${left}.`);
      else setStatus(r.failed.length ? `Finished with ${r.failed.length} failed lines. Run again to retry them.${engine === 'local' && lastLocalErr.current ? ' Offline engine said: ' + lastLocalErr.current.slice(0, 160) + ' (the model download may be blocked, or this browser cannot run it).' : ''}` : 'Finished. Review the lines below before using them.');
    } catch (e) { setStatus('Stopped: ' + e.message); }
    setBusy(false); setEta(null);
  }
  const lines = (i) => manual[i] !== undefined ? manual[i].split('\n') : C.cueTranslation(cues[i], out, i).lines;
  const untranslated = cues.filter((c, i) => manual[i] === undefined && !C.cueTranslation(c, out, i).translated && C.cueSegments(c).length).length;
  const anyDone = out.size > 0 || Object.keys(manual).length > 0;
  const allLines = () => cues.map((_, i) => lines(i));
  const code = target[C.PROVIDERS[engine].key] || target.id;

  return (
    <main>
      <header>
        <svg viewBox="0 0 128 128" width="44" height="44" role="img" aria-label="SubBridge logo"><rect width="128" height="128" rx="24" fill="#16324a" /><path d="M16 84 Q64 30 112 84" fill="none" stroke="#6fd3b0" stroke-width="9" stroke-linecap="round" /><path d="M44 96V52l40 44V52" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <div><h1>SubBridge <span class="beta">beta</span></h1><p>Translate SRT subtitles. Timings stay exactly as they are.</p></div>
      </header>

      <section class="note" role="note">
        <b>Read first.</b> This beta sends subtitle text to the translation service you choose. It is meant for small files: the free MyMemory service allows about 5000 characters per day without an account. Machine translation can be wrong, so review the lines. Tulu is not supported by any free engine checked. Source languages were only tested for single short sentences.
      </section>

      <section>
        <h2>1. Open a subtitle file</h2>
        <div class="row">
          <input key={fileKey} type="file" accept=".srt,text/plain" aria-label="Open SRT file" onChange={onFile} />
          <button onClick={() => load(C.DEMO)}>Try demo subtitles</button>
          <button disabled={!cues.length} onClick={() => { setCues([]); reset(); setSkipped([]); setFileKey(fileKey + 1); }}>Clear</button>
        </div>
        {cues.length > 0 && <p aria-live="polite">{cues.length} cues, {plan.chars} characters to translate{skipped.length ? `, ${skipped.length} unreadable blocks skipped` : ''}.</p>}
        {error && <p class="err" role="alert">{error}</p>}
      </section>

      <section>
        <h2>2. Choose languages and engine</h2>
        <div class="grid">
          <label>From<select aria-label="From language" value={src} onChange={(e) => { setSrc(e.target.value); reset(); }}><option value="auto">Detect automatically</option>{langs.map((l) => <option value={l.id}>{l.name}</option>)}</select></label>
          <label>To<select aria-label="To language" value={tgt} onChange={(e) => { setTgt(e.target.value); reset(); }}>{langs.map((l) => <option value={l.id}>{l.name}{l.native && l.native !== l.name ? ` (${l.native})` : ''}</option>)}</select></label>
          <label>Engine<select aria-label="Engine" value={engine} onChange={(e) => { setEngine(e.target.value); reset(); }}>{Object.entries(C.PROVIDERS).map(([k, p]) => <option value={k}>{p.label}</option>)}</select></label>
        </div>
        {engine === 'libre' && <div class="row"><input aria-label="LibreTranslate URL" placeholder="http://localhost:5000" value={libreUrl} onInput={(e) => setLibreUrl(e.target.value)} /><button onClick={checkLibre} disabled={!libreUrl}>Check languages</button></div>}
        <p class={'support ' + sup} aria-live="polite">
          {sup === 'yes' && engine === 'local' && `${target.name}: translated on this device with a small Opus-MT model. English subtitles only. First use downloads the model (about 100 MB, cached afterwards). No daily service limit from a service. Uses about 1.5 GB of memory on a desktop browser and can be slow or fail on a phone with little memory. Quality is not verified${target.id === 'chinese-simplified-' ? ' (Chinese sometimes repeats phrases, check every line)' : ''}.`}
          {sup === 'yes' && engine !== 'local' && (engine === 'mymemory' ? `${target.name}: accepted by MyMemory. ${PROBED}` : `${target.name}: available on this server.`)}
          {sup === 'unknown' && `${target.name}: support is not known for this engine. Try a short test.`}
          {sup === 'no' && (target.id === 'tulu' ? 'Tulu: no engine here supports it. Pick another language.' : engine === 'local' ? `${target.name}: not available offline. Offline mode only has Hindi, Arabic, French, Spanish, Chinese and Indonesian. Pick one of those, or use another engine.` : `${target.name}: not available on this engine.`)}
          {supSrc === 'no' && ` Source language ${source.name} is not available on this engine.`}
        </p>
        <details><summary>Add a language code</summary>
          <div class="row"><input aria-label="Language name" placeholder="Name, e.g. German" value={custom.name} onInput={(e) => setCustom({ ...custom, name: e.target.value })} /><input aria-label="Language code" placeholder="Code, e.g. de" value={custom.code} onInput={(e) => setCustom({ ...custom, code: e.target.value })} /><button onClick={addCustom}>Add</button></div>
        </details>
      </section>

      <section>
        <h2>3. Translate</h2>
        {engine === 'mymemory' && plan.chars > 5000 && <p class="warn">This file has {plan.chars} characters. MyMemory's anonymous limit is about 5000 per day, so it will probably stop part way. Finished cues are kept.</p>}
        <label class="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {engine === 'local' ? 'I understand the model and runtime files are downloaded from huggingface.co and cdn.jsdelivr.net. The subtitle text stays on this device.' : `I understand the subtitle text will be sent to ${host}`}</label>
        <div class="row">
          <button class="primary" disabled={!cues.length || busy || !consent || sup === 'no' || supSrc === 'no'} onClick={start}>{anyDone ? 'Continue translating' : 'Translate'}</button>
          <button disabled={!busy} onClick={() => ac.current?.abort()}>Stop</button>
        </div>
        {progress && <progress max={progress.total} value={progress.done} aria-label="Progress" />}
        {status && <p aria-live="polite" class="status">{status}</p>}
        {busy && eta && !status.startsWith('Downloading') && <p class="eta" aria-live="off">{eta.state === 'eta' ? (eta.sec === 0 ? 'Almost done.' : `Estimated time left: ${C.fmtDuration(eta.sec)}, around ${new Date(eta.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Based on the speed so far on this device, so it can change.`) : 'Estimating time left… (needs a few seconds of progress)'}</p>}
        {busy && status.startsWith('Downloading') && <p class="eta">Model download is in progress. Time left for translation is shown after the download finishes, because it depends on this device.</p>}
      </section>

      {cues.length > 0 && <section>
        <h2>4. Review and download</h2>
        {anyDone && untranslated > 0 && <p class="warn">{untranslated} {untranslated === 1 ? 'cue is' : 'cues are'} not translated and will keep the original text.</p>}
        <div class="row">
          <button class="primary" disabled={!anyDone} onClick={() => download(`translated.${code}.srt`, C.buildSrt(cues, allLines(), 'translated', { promos: true, rng: secureRng }))}>Download translated SRT</button>
          <button disabled={!anyDone} onClick={() => download(`bilingual.${code}.srt`, C.buildSrt(cues, allLines(), 'bilingual', { promos: true, rng: secureRng }))}>Download bilingual SRT</button>
        </div>
        <div class="cues">
          {cues.map((c, i) => {
            const t = C.cueTranslation(c, out, i);
            return <div class="cue" key={i}>
              <div class="meta"><b>{c.index}</b> <span>{c.timing}</span>{t.simplified && <em>some tags were dropped</em>}{anyDone && !t.translated && manual[i] === undefined && <em>not translated</em>}</div>
              <div class="orig" dir="auto">{c.lines.join('\n')}</div>
              <textarea aria-label={`Translation of cue ${c.index}`} dir="auto" rows={Math.max(2, c.lines.length)} value={manual[i] !== undefined ? manual[i] : (anyDone ? t.lines.join('\n') : '')} placeholder={anyDone ? '' : 'Translation appears here'} onInput={(e) => setManual({ ...manual, [i]: e.target.value })} />
            </div>;
          })}
        </div>
      </section>}
      <footer>Every downloaded SRT also contains five short credit lines from denelli.in, added as separate cues in gaps between subtitles, at different times each download. Your real subtitle timings are never changed. MIT licensed. Nothing is saved by this page. Reloading clears everything.</footer>
    </main>
  );
}
render(<App />, document.getElementById('app'));
