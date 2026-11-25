// Offline engine worker: runs Opus-MT models (Apache-2.0) in the browser with transformers.js. English source only.
import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;
// Malayalam: no Xenova repo exists. Uses a community int8 ONNX export of Helsinki-NLP/opus-mt-en-ml (Apache-2.0), pinned to one commit.
// That repo has no tokenizer_config.json, so the two upstream values are supplied here (same as Helsinki-NLP/opus-mt-en-ml).
const ML = { id: 'akm9191/opus-mt-en-ml-int8-onnx', revision: 'f46c4b34a8b83c8e825de869de16e30fd1029a32' };
const realFetch = env.fetch;
env.fetch = (url, opts) => (String(url).includes(ML.id) && String(url).endsWith('/tokenizer_config.json')
  ? Promise.resolve(new Response('{"target_lang": "ml", "source_lang": "en"}', { status: 200, headers: { 'content-type': 'application/json' } }))
  : realFetch(url, opts));
let current = null; // { tgt, pipe }
async function get(tgt, id) {
  if (current && current.tgt === tgt) return current.pipe;
  if (current) { try { await current.pipe.dispose(); } catch {} current = null; }
  const progress = (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', id, file: p.file, loaded: p.loaded, total: p.total }); };
  const pipe = tgt === 'ml'
    ? await pipeline('translation', ML.id, { dtype: 'q8', revision: ML.revision, progress_callback: progress })
    : await pipeline('translation', `Xenova/opus-mt-en-${tgt}`, { dtype: 'q8', progress_callback: progress });
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
