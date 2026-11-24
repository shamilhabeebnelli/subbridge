// Offline engine worker: runs Opus-MT models (Apache-2.0) in the browser with transformers.js. English source only.
import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;
let current = null; // { tgt, pipe }
async function get(tgt, id) {
  if (current && current.tgt === tgt) return current.pipe;
  if (current) { try { await current.pipe.dispose(); } catch {} current = null; }
  const progress = (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', id, file: p.file, loaded: p.loaded, total: p.total }); };
  const pipe = await pipeline('translation', `Xenova/opus-mt-en-${tgt}`, { dtype: 'q8', progress_callback: progress });
  current = { tgt, pipe };
  return pipe;
}
self.onmessage = async (e) => {
  const { id, tgt, text } = e.data;
  try {
    const pipe = await get(tgt, id);
    const out = await pipe(text, { max_new_tokens: Math.min(512, Math.max(32, text.length * 2)) });
    self.postMessage({ type: 'done', id, text: out[0].translation_text });
  } catch (err) { self.postMessage({ type: 'error', id, error: String(err && err.message || err) }); }
};
