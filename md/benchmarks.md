# Benchmarks — how long compression actually takes

Every number on this page came out of an actual compression through the live page on
30 October 2026. Nothing here is projected or averaged from someone else's hardware.

## Method

The page was opened in Chromium on Windows 11, a file was handed to the file input, the
target size was set, and the clock ran from the click on the compress button until a
result existed. One run per file, not a best-of-five. Timing therefore includes reading
the file, decoding, encoding and muxing — everything a visitor experiences.

The machine is a small cloud instance with **2 vCPU**. Encoding speed scales with cores and
with the hardware encoder the browser picks, so a modern desktop will be faster than this
table and an older laptop slower.

## The runs

| Input | In | Target | Out | Time | Path |
| --- | --- | --- | --- | --- | --- |
| MP4, 1920×1080, 30 fps, 30.44 s | 20.7 MB | 10 MB | 9.81 MB | 40.1 s | Re-encoded to 720p |
| MP4, 1920×1080, 30 fps, 30.44 s | 26.2 MB | 25 MB | 24.4 MB | 31.5 s | Re-encoded, resolution kept |
| MP4, 1280×720, 30 fps, 6.0 s, no audio | 3.9 MB | 2 MB | 1.96 MB | 2.3 s | Re-encoded |
| WEBM, VP9, 854×480, 30 fps, 8.0 s | 873 KB | 1 MB | 906 KB | 7.8 s | VP9 cannot be copied → re-encoded |
| MKV, H.264, 854×480, 30 fps, 8.0 s | 7.96 MB | 10 MB | 7.96 MB | 0.5 s | Already fits → repackaged, streams copied |

## What the table shows

- **The fast path is about 80× faster.** The MKV that already fit was repackaged in 0.5 s;
  the comparable re-encode took tens of seconds.
- **Time tracks pixels and duration, not file size.** The 30-second 1080p clip and the
  6-second 720p clip differ by 20× in wall clock because of frame count and pixel count.
- **Overshoot is not zero.** A 1 MB target produced 906 KB — 9% under, which is the budget
  working as designed. A 10 MB target produced 9.81 MB.
- **Repackaging can grow a file slightly.** The MKV came back 1,780 bytes larger as MP4
  because container overhead differs. Still under the target.

## What this page is not

It is not a comparison against desktop encoders, and it is not a promise about your
machine. A browser can only use the encoders it exposes.
