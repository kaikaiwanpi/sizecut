# Supported formats — what opens, what is copied, what is re-encoded

The container decides which path a file takes: returned untouched, repackaged in half a
second, or re-encoded at full cost.

## The matrix

| Container | Reads? | If it already fits | Notes |
| --- | --- | --- | --- |
| MP4 (H.264 + AAC) | Yes | Returned untouched, original name | The common case: no work at all |
| MOV (H.264 + AAC) | Yes | Repackaged to MP4, streams copied | Under a second; quality untouched |
| M4V | Yes | Same as MP4 | MP4 with an Apple extension |
| MKV (H.264 + AAC) | Yes | Repackaged to MP4, streams copied | Measured: 7.96 MB in 0.5 s |
| WEBM (VP9 or VP8) | Yes | Re-encoded, not copied | MP4 cannot carry VP9 in the target profile |
| AVI | **No** | — | The page says so up front instead of failing halfway |

Output is always the same: H.264 video with AAC audio inside MP4, which is what Discord
embeds and plays on desktop, web and mobile.

## Two different costs hiding in one button

A file that already fits never enters the encoder. MP4 comes back byte-identical under its
own name; MKV or MOV gets its compressed streams copied into a new MP4 wrapper, which is
packaging, not a quality decision. Measured: 0.5 seconds for a 7.96 MB MKV versus tens of
seconds re-encoded.

## Why AVI is refused

The browser stack (WebCodecs plus a JavaScript demuxer) has no AVI container parser.
Rather than accept the file and fail minutes later, the page rejects it at intake.

## Why iPhone and iPad are refused

Safari on iOS exposes no video encoder to the page. The tool detects the missing API at
load and says so. Android Chrome and desktop Chrome, Edge, Brave, Opera and Firefox builds
with WebCodecs work.

## What the target size does to the picture

Two levers move together: the bitrate budget that follows from the target size, and the
resolution ladder. The page keeps the largest resolution whose bits-per-pixel stays above a
floor, so a small cap lowers the resolution rather than turning the frame into mush.
