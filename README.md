<p align="center"><img src="logo.svg" width="96" alt="SubBridge logo, an N under a bridge arch"></p>

# SubBridge (limited beta)

A web page for translating SRT subtitle files with a reviewable grid. One HTML file, no account, MIT, free. Live at https://subtranslator.denelli.in

Status: limited beta. It is not a finished all-language, whole-film translator. The free engine allows about 5000 characters a day, quality varies, and Tulu is not available. See Limits.

Other subtitle tools exist and are more complete for many jobs, for example Subtitle Edit, Aegisub and several online SRT translators. SubBridge is a small free option with a review grid and no sign-up. No claim of being first or best.

## What works (tested)

- Opens a UTF-8 SRT. Keeps cue numbers and timing lines exactly. Handles BOM, CRLF, missing numbers, skips unreadable blocks.
- Protects italic/bold/ASS-position tags, keeps dialogue dashes, rebalances two-line cues, leaves music-note-only cues alone.
- Engines: MyMemory (free, no key) and a LibreTranslate server you run yourself (no key). No API keys are collected anywhere.
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

## Build and test

```
npm ci
npm run build
npm test
CHROME_PATH=/path/to/chrome npm run test:browser
```
