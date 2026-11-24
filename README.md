<p align="center"><img src="logo.svg" width="96" alt="SubBridge logo, an N under a bridge arch"></p>

# SubBridge (limited beta)

A web page for translating SRT subtitle files with a reviewable grid. One HTML file, no account, MIT, free. Live at https://subtranslator.denelli.in

Status: limited beta. It is not a finished all-language, whole-film translator. The online engine (MyMemory) allows about 5000 characters a day and quality varies. The offline engine has no daily service limit but covers only six languages. Malayalam, Tamil, Telugu, Kannada, Bengali, Urdu, Portuguese and Malay work only through the capped online engine, and Tulu has no engine. See Limits.

Other subtitle tools exist and are more complete for many jobs, for example Subtitle Edit, Aegisub and several online SRT translators. SubBridge is a small free option with a review grid and no sign-up. No claim of being first or best.

## What works (tested)

- Opens a UTF-8 SRT. Keeps cue numbers and timing lines exactly. Handles BOM, CRLF, missing numbers, skips unreadable blocks.
- Protects italic/bold/ASS-position tags, keeps dialogue dashes, rebalances two-line cues, leaves music-note-only cues alone.
- Engines: MyMemory (free, no key, online, about 5000 characters a day), a LibreTranslate server you run yourself (no key), and an offline in-browser engine (beta). No API keys are collected anywhere.
- Offline engine (beta): English subtitles to Hindi, Arabic, French, Spanish, Chinese (Simplified) and Indonesian, translated on your device with small Opus-MT models (Apache-2.0 per their Hugging Face model cards) through transformers.js. No daily service limit. First use downloads about 100 to 115 MB per language from huggingface.co plus the runtime from cdn.jsdelivr.net, then the browser caches it. Subtitle text never leaves the page in this mode.
- Shows an estimated time left from the speed observed in the current run, separately from the model download. It is an estimate and changes with the device.
- Shows how many characters will be sent and where, and requires a tick before anything leaves the page.
- Stops cleanly on the free daily limit, keeps finished cues, lets you continue later while the page stays open.
- Side-by-side review with editable cells. Downloads a translated SRT or a bilingual SRT.
- Every download also contains five credit lines from the project owner, added as separate cues in silent gaps, spread through the film (about 10, 30, 50, 70 and 90 percent of its length), at slightly different times on each download. A line shortens to 2 s in tight gaps and goes after the last cue only if no gap fits. Real cue timings never move.

## Limits (read these)

- Free MyMemory allows about 5000 characters per day without an account (https://mymemory.translated.net/doc/usagelimits.php). A whole film is usually larger, so expect it to stop part way.
- Target languages: the list has 16 entries (15 besides English). MyMemory accepted English to each of the 14 non-English languages except Tulu in a small probe on 24 Nov 2026. Tulu is not supported by any engine checked.
- Source languages other than English were probed with one short sentence each, and those sentences came from earlier MyMemory output, so this is weak evidence.
- Quality is not verified. Probes found a wrong meaning in Tamil, an unrelated Portuguese sentence, and "Okay, I will." returned as "Así que, uh." in Spanish. Always review.
- Subtitle text is sent to the chosen service. Nothing is stored by the page.
- Basic SRT only (no WebVTT/ASS), 2 MiB and 5000 cues maximum.

### Offline engine: what was measured and what was not

Measured on one machine only (headless Chrome, 2 CPUs, 2 GB RAM, desktop-class), 100 unique cues each: Hindi 56 s, Arabic 58 s, Spanish 56 s, Chinese 51 s, Indonesian 50 s. French 400 cues took 217 s (about 0.5 s per cue). Chrome used about 1.5 GB of memory. A second run loaded the model from cache with no download. If the model download is blocked, or the page is opened as a saved file, the page says so.

Not verified: real phones (a phone with little memory may be slow or fail), films longer than 400 cues, and quality by native speakers. Chinese sometimes repeats phrases. Gender and register are guessed. Check every line.

Not covered offline: Malayalam, Tamil, Telugu, Kannada, Bengali, Urdu, Portuguese, Malay and Tulu. A larger multilingual model (M2M100, MIT) was tried for Malayalam and crashed the browser tab on the 2 GB test machine, so it is not shipped. Telugu and Tulu are not in that model's language list.

## Build and test

```
npm ci
npm run build
npm test
CHROME_PATH=/path/to/chrome npm run test:browser
```

The offline engine is bundled by `build.mjs` into `4-worker.js`, which the small `worker.js` loads (the 4- prefix is an accident of how the file was uploaded; it is the same file build.mjs writes). Run `npm ci` first. Serve the folder over http (not file://) so the worker can start. Speed test used for the numbers above: `node local-test.mjs <language-id> <cues>`.

```
```
