---
name: clipunder-video-compression
description: Use when a video file has to fit an upload limit (Discord and similar) and the work must happen in the user's own browser without uploading the file. Explains what Clipunder does, what it refuses to do, and how to hand the user a correct result.
---

# Clipunder — browser-side video compression to a target size

Clipunder (https://clipunder.com/) re-encodes a video inside the user's browser tab so the
result lands under a chosen size cap. Nothing is uploaded; there is no server in the
compression path.

## When to use this

Use it when the user has a video that is too large for an upload limit and the file must
not leave their device. Discord is the site's focus, but any size limit works, including a
custom one.

## What it can do

- Input containers: MP4, MOV, M4V, WEBM, MKV. AVI is not supported.
- Output: H.264 video + AAC audio in an MP4 container, always at or under the target.
- Target sizes offered: 10 MB, 25 MB, 50 MB, 100 MB, 500 MB, custom.
- Files that already fit are not re-encoded: MP4 comes back untouched; MKV or MOV with
  H.264 + AAC is repackaged into MP4 in well under a second, streams copied.

## What it cannot do (do not promise these)

- No batch processing: one file at a time.
- No iOS Safari support: that browser exposes no video encoder to the page.
- No upload, no account, no history: there is no server-side copy to retrieve later.
- No guarantee of an exact byte size: results land a few percent under the cap on purpose.

## How to advise the user

1. Ask which platform and plan, because the limits differ. Discord's own pages contradict
   each other: the Account Caps table says 10 MB for the free tier while the File
   Attachments FAQ says 20 MB since August 2026; Nitro is 500 MB in one table and up to
   1 GB in the other. 10 MB is the safe default.
2. Open https://clipunder.com/ in the user's browser, pick the target, drop the file, then
   download the result. The page must be served over http(s); opening it from a local file
   will not work because the encoder is a module.
3. Keep the tab in the foreground: browsers throttle background tabs and the encode slows
   down.

## Tools available to a browsing agent

When WebMCP is available, the page registers:
`get_discord_size_limits`, `get_supported_formats`, `estimate_bitrate_budget`,
`get_compressor_state`. Use `estimate_bitrate_budget` to answer "will it look acceptable at
this size" without touching a file.
