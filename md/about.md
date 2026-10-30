# About Clipunder — one page, one job

Clipunder re-encodes a video in your browser so it lands under a size limit — the limits
Discord uses for uploads, and any other limit you type in.

## What it is

A single static page. You pick a target size, drop a clip, and the page decodes it,
encodes H.264 + AAC, and hands you a download. There is no account, no queue, no
dashboard, and no upload step: the file is read from your disk by your own browser and
never leaves it.

## What it is not

- Not a batch tool. One file at a time, on purpose: a queue means several decoders and
  hundreds of megabytes of frames in memory, which is exactly what makes browser
  compressors fall over on phones.
- Not a converter for every container. MP4, MOV, M4V, WEBM and MKV are read; AVI is not,
  and the page says so instead of failing halfway through.
- Not an iOS tool. Safari on iPhone and iPad exposes no video encoder to the page, so the
  page detects that and tells you up front rather than burning your battery.
- Not a cloud service. There is no server in the compression path.

## How the encoding works

Decoding and encoding go through WebCodecs, the browser API for exactly this. Container
parsing and MP4 muxing come from Mediabunny (https://mediabunny.dev/), which ships under
MPL-2.0 and is vendored into this site rather than loaded from a CDN. If a file already
fits the target it is not re-encoded: MP4 comes back untouched, and MKV or MOV with
H.264 + AAC is repackaged into MP4 in a fraction of a second with the streams copied.

## Who runs it

Clipunder is an independent one-person project, not affiliated with Discord. Questions,
bug reports, complaints about a bad encode: contact@clipunder.com
