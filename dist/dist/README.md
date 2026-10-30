# Sizecut — Video Compressor for Discord

Static page, no build step: `index.html` + `styles.css` + `app.js`, plus one vendored
library `vendor/mediabunny.min.js` (Mediabunny 1.64.0, MPL-2.0 — see
`vendor/mediabunny.LICENSE.txt`). Nothing else: no framework, no analytics, no uploads.

## Run it

The page must be served over http(s): the encoder is an ES module and browsers refuse to
import one from `file://`.

    cd C:\Users\Administrator\sites\discord-video-compressor
    python -m http.server 8080
    # open http://localhost:8080

Opening `index.html` directly shows a notice saying exactly that, instead of failing silently.

## What it does, in order

1. Read the file with Mediabunny's `Input` (demux + decode through WebCodecs).
2. If the file **already fits** the chosen limit, nothing is re-encoded:
   - MP4 stays untouched and comes back under its own name;
   - MKV/MOV (H.264 + AAC) is repackaged into MP4 in a fraction of a second — measured 8 MB
     in 285 ms — with the streams copied, not re-encoded.
3. Otherwise compute a bitrate budget from the target size, the duration and a 96 kbit/s
   audio reservation, then pick the largest resolution on the ladder whose bits-per-pixel
   stays above 0.06.
4. `Conversion` encodes H.264 + AAC and muxes a fast-start MP4 in memory. If the result
   overshot, one more pass at a scaled bitrate; the best fit wins.
5. Encoding can be cancelled mid-run: the button beside the percentage, or `Esc`.

## Files that ship

| file | role |
|---|---|
| `index.html` | markup, meta/OG tags, JSON-LD (WebApplication + FAQPage mirroring the visible FAQ) |
| `styles.css` | the design system |
| `app.js` | pipeline, UI, all state |
| `vendor/mediabunny.min.js` | media library, dynamic-imported on first file pick |
| `vendor/mediabunny.LICENSE.txt` | MPL-2.0, required by the licence |
| `favicon.svg`, `robots.txt`, `sitemap.xml` | site furniture; the sitemap holds a placeholder URL until a domain exists |

`app.zero-dep.js`, `index.v1.html`, `styles.v1.css` are archived earlier versions — do not deploy them.

## Tests

`qa.js` (state machine), `qa2.js` (interaction + accessibility), `qa3.js` (fit / remux /
encode routing), `qa4.js` (cancel) drive the real page in a headless browser over CDP. They
live outside this folder because they need fixture videos.

## Deploying

The folder is a static site: push it to a repository and point GitHub Pages or Cloudflare
Pages at it. Both serve over https, so the module import works exactly as it does on
localhost. No server code, no functions, no storage. Largest asset 718 KB, inside
Cloudflare Pages' 25 MiB per-file limit.
