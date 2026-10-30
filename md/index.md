# Video Compressor for Discord — land under the upload limit in your browser

Clipunder re-encodes a video in your browser tab so it fits a size limit. Pick the size
your Discord account allows, drop a clip, and download an H.264 MP4 that uploads on the
first try. The file never leaves your computer.

- Input: MP4, MOV, M4V, WEBM, MKV (AVI is not supported)
- Output: H.264 video + AAC audio in an MP4 container, under the chosen cap
- Target sizes: 10 MB, 25 MB, 50 MB, 100 MB, 500 MB, or a custom number
- No account, no upload, no watermark, no analytics

## Which size do I actually need?

Discord's own pages disagree with each other. The File Attachments FAQ says the free
limit moved from 10 MB to 20 MB in August 2026, while the Account Caps table still lists
the base tier at 10 MB, and Nitro appears as 500 MB in one table and up to 1 GB in
another. 10 MB is the default here because it is the only number every live Discord page
agrees on. Check your own account and pick accordingly:

| Plan | Limit |
| --- | --- |
| Base (free) | 10 MB on the Account Caps table, 20 MB per the Attachments FAQ |
| Nitro Basic | 50 MB |
| Nitro | 500 MB in one table, up to 1 GB in another |

## How a target size becomes a bitrate

The page budgets the target as: `target bits = target size × 8`, subtracts a 96 kbit/s
audio reservation, and divides the rest across the duration to get a video bitrate. It
then walks a resolution ladder from the source size downward and keeps the largest
resolution whose bits-per-pixel stays above 0.06. If the first pass overshoots, one more
pass runs at a scaled bitrate and the best fit wins.

## Already fits? Then it is not re-encoded

- An MP4 that already fits comes back untouched, under its own name.
- MKV or MOV with H.264 + AAC is repackaged into MP4 in a fraction of a second, streams
  copied rather than re-encoded. Measured: 8 MB in 285 ms.
- VP9 and other codecs that cannot be copied fall back to a real encode.

## Common questions

**Does this upload my video anywhere?** No. The browser decodes, re-encodes and hands you
a download. There is no server in that path.

**What comes out?** H.264 in MP4 with AAC audio — what Discord embeds and plays on
desktop, web and mobile. Not a ZIP, not a GIF, no watermark.

**How long does it take?** Faster than realtime on a desktop CPU: a 30-second 1080p clip
reached 720p in 32 seconds. Keep the tab in the foreground; browsers throttle background
tabs.

**Can I compress several at once?** No, deliberately. A queue means several decoders and
hundreds of megabytes of frames in memory, which is what makes browser compressors fall
over on phones.

**Does it work on a phone?** On Android Chrome yes. iOS Safari exposes no video encoder to
the page, and the page says so up front instead of failing halfway.

## Sources

- Discord — Account Caps, Server Caps, and More: https://support.discord.com/hc/en-us/articles/33694251638295
- Discord — File Attachments FAQ: https://support.discord.com/hc/en-us/articles/25444343291031
- W3C — WebCodecs: https://www.w3.org/TR/webcodecs/
- Mediabunny (MP4 muxing, MPL-2.0): https://mediabunny.dev/
