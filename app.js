/* Sizecut — compress a video to a Discord upload limit, entirely in the tab.
   Decoding, scaling, encoding and MP4 muxing run locally through Mediabunny
   (MPL-2.0, vendored at vendor/mediabunny.min.js), which drives the browser's
   own WebCodecs encoders. The library is a dynamic import, so it is fetched
   only after a file is chosen and never blocks the first screen.
   Nothing is uploaded: the page makes no request after those four files. */

(() => {
  'use strict';

  const MB = 1024 * 1024;
  const CONTAINER_SAFETY = 0.985;   // bytes we allow the file to reach, as a share of the target
  const MIN_BPP = 0.06;             // bits per pixel per frame floor before stepping resolution
  const MAX_FPS = 30;
  const AUDIO_BPS = 96000;
  const LADDER = [2160, 1440, 1080, 960, 720, 540, 480, 360, 240];

  const $ = (id) => document.getElementById(id);

  const el = {
    drop: $('drop'), file: $('file'), filecard: $('filecard'),
    fileName: $('file-name'), fileMeta: $('file-meta'), change: $('change'),
    alert: $('alert'), budget: $('budget'), planNote: $('plan-note'),
    barSrc: $('bar-src'), barTarget: $('bar-target'), barResult: $('bar-result'),
    valSrc: $('val-src'), valTarget: $('val-target'), valResult: $('val-result'),
    rowResult: $('row-result'),
    go: $('go'), goNote: $('go-note'), goWrap: $('goWrap'), again: $('again'), cancel: $('cancel'),
    progress: $('progress'), progressLabel: $('progress-label'),
    progressPct: $('progress-pct'), progressBar: $('progressbar'),
    progressFill: $('progress-fill'), progressSub: $('progress-sub'),
    result: $('result'), rTarget: $('r-target'), rActual: $('r-actual'),
    rSaved: $('r-saved'), download: $('download'), rHint: $('r-hint'),
    custom: $('custom-size')
  };

  const state = {
    file: null, meta: null, blobUrl: null, plan: null,
    targetMB: 10, running: false, result: null, conversion: null, aborted: false
  };

  /* ------------------------------------------------------------------ */
  /* formatting                                                          */
  /* ------------------------------------------------------------------ */

  const fmtBytes = (b) => {
    if (b < 1024) return b + ' B';
    if (b < MB) return (b / 1024).toFixed(0) + ' KB';
    if (b < 1024 * MB) return (b / MB).toFixed(b < 10 * MB ? 2 : 1) + ' MB';
    return (b / (1024 * MB)).toFixed(2) + ' GB';
  };
  const fmtDur = (s) => {
    if (!isFinite(s)) return '—';
    const m = Math.floor(s / 60), r = Math.round(s % 60);
    return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${s.toFixed(1)}s`;
  };
  const fmtMbps = (bps) => (bps / 1e6).toFixed(bps < 1e6 ? 2 : 1) + ' Mbit/s';
  const fmtDurationSafe = (s) => (isFinite(s) ? fmtDur(s) : 'unknown length');

  /* ------------------------------------------------------------------ */
  /* the encoder library, imported on demand                             */
  /* ------------------------------------------------------------------ */

  let libPromise = null;
  function loadLib() {
    if (!libPromise) libPromise = import('./vendor/mediabunny.min.js');
    return libPromise;
  }

  /* ------------------------------------------------------------------ */
  /* planning                                                            */
  /* ------------------------------------------------------------------ */

  function planFor(meta, targetBytes, qualityFactor, fixed) {
    const D = meta.duration;
    if (!isFinite(D) || D <= 0) throw new Error('bad-duration');

    const audioBps = meta.hasAudio ? AUDIO_BPS : 0;
    const budget = targetBytes * CONTAINER_SAFETY - (audioBps / 8) * D - 8192;
    if (budget < 64 * 1024) throw new Error('target-too-small');

    let videoBps = Math.max(120000, (budget * 8 * qualityFactor) / D);
    // never spend more bits than the source already has: re-encoding a file that
    // already fits should not hand back something bigger than the original
    if (meta.bytes && meta.bytes > 0) {
      const sourceBps = (meta.bytes * 8) / D;
      videoBps = Math.min(videoBps, Math.max(120000, sourceBps * 0.92));
    }
    const fps = Math.min(meta.fps || 30, MAX_FPS);

    let pick = fixed || null;
    if (!pick) {
      for (const h of LADDER) {
        if (h > meta.height) continue;
        const w = Math.round((meta.width * (h / meta.height)) / 2) * 2;
        const hh = Math.round(h / 2) * 2;
        if (!w || !hh) continue;
        pick = { w, h: hh };
        if (videoBps / (w * hh * fps) >= MIN_BPP) break;
      }
      if (!pick) {
        const hh = Math.min(meta.height, 240);
        pick = { w: Math.max(2, Math.round((meta.width * (hh / meta.height)) / 2) * 2), h: hh };
      }
    }
    return {
      width: pick.w, height: pick.h, fps, videoBps, audioBps,
      bpp: videoBps / (pick.w * pick.h * fps)
    };
  }

  /* ------------------------------------------------------------------ */
  /* file intake                                                         */
  /* ------------------------------------------------------------------ */

  function fileFromList(list) {
    if (!list || !list.length) return null;
    const f = list[0];
    if (!/^video\//.test(f.type) && !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(f.name)) return null;
    return f;
  }

  async function probeFile(file) {
    const { Input, BlobSource, ALL_FORMATS } = await loadLib();

    // opening the same File twice in quick succession (input event + our own
    // dispatch, or a browser retry) can hand back an unreadable handle; one
    // short retry is cheaper than telling the user their MP4 is invalid
    const open = async (attempt) => {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      let track = null;
      try { track = await input.getPrimaryVideoTrack(); } catch (e) { track = null; }
      if (!track && attempt === 1) {
        await new Promise((r) => setTimeout(r, 180));
        return open(2);
      }
      if (!track) throw new Error((await input.canRead().catch(() => false)) ? 'no-video-track' : 'unsupported');
      return { input, track };
    };

    const { input, track } = await open(1);
    if (!(await track.canDecode())) throw new Error('undecodable');
    const audio = await input.getPrimaryAudioTrack();
    const duration = await track.computeDuration();
    let fps = 30;
    try {
      const stats = await track.computePacketStats(90);
      fps = Math.round(stats.averagePacketRate) || 30;
    } catch (e) { /* keep the default */ }

    const format = await input.getFormat().then((f) => f.name).catch(() => '');
    const vCodec = await track.getCodec().catch(() => null);
    const aCodec = audio ? await audio.getCodec().catch(() => null) : null;

    return {
      duration,
      width: track.displayWidth,
      height: track.displayHeight,
      fps: Math.min(MAX_FPS, fps),
      hasAudio: !!audio,
      bytes: file.size,
      format, vCodec, aCodec
    };
  }

  /* ------------------------------------------------------------------ */
  /* one encoding pass                                                   */
  /* ------------------------------------------------------------------ */

  async function runPass(plan, onProgress) {
    const { Input, Output, Mp4OutputFormat, BufferTarget, Conversion, BlobSource, ALL_FORMATS } = await loadLib();
    const input = new Input({ source: new BlobSource(state.file), formats: ALL_FORMATS });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget()
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: 'avc',
        width: plan.width,
        height: plan.height,
        fit: 'contain',
        bitrate: Math.round(plan.videoBps),
        frameRate: plan.fps
      },
      audio: plan.audioBps > 0
        ? { codec: 'aac', bitrate: Math.round(plan.audioBps), forceTranscode: true }
        : { discard: true },
      copy: false
    });

    if (!conversion.isValid) throw new Error('invalid-conversion');
    state.conversion = conversion;
    conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(0.999, p)));
    await conversion.execute();
    state.conversion = null;

    const buffer = output.target.buffer;
    return { blob: new Blob([buffer], { type: 'video/mp4' }), bytes: buffer.byteLength };
  }

  /* ------------------------------------------------------------------ */
  /* when the file already fits: hand it back, or repackage it           */
  /* ------------------------------------------------------------------ */

  // true when this file's streams can be copied into an MP4 without re-encoding
  function canRepackage(meta) {
    return meta.vCodec === 'avc' && (!meta.hasAudio || meta.aCodec === 'aac');
  }

  async function repackage(meta, onProgress) {
    const { Input, Output, Mp4OutputFormat, BufferTarget, Conversion, BlobSource, ALL_FORMATS } = await loadLib();
    const input = new Input({ source: new BlobSource(state.file), formats: ALL_FORMATS });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget()
    });
    const conversion = await Conversion.init({ input, output, copy: { mode: 'forced' } });
    if (!conversion.isValid || conversion.discardedTracks.length) throw new Error('cannot-repackage');
    state.conversion = conversion;
    conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(0.999, p)));
    await conversion.execute();
    state.conversion = null;
    const buffer = output.target.buffer;
    return { blob: new Blob([buffer], { type: 'video/mp4' }), bytes: buffer.byteLength, mode: 'remux' };
  }

  /* ------------------------------------------------------------------ */
  /* orchestration                                                       */
  /* ------------------------------------------------------------------ */

  async function compress() {
    if (state.running || !state.meta) return null;
    state.running = true;
    state.aborted = false;
    setBusy(true);
    el.alert.hidden = true;
    el.rowResult.hidden = true;

    const targetBytes = Math.round(state.targetMB * MB);
    const meta = state.meta;
    const maxPasses = 2;
    let factor = 1;
    let bestUnder = null;
    let smallest = null;

    try {
      // the file already fits the limit: do not spend quality on a re-encode
      const alreadyMp4File = /^MP4$/i.test(meta.format);
      if (meta.bytes <= targetBytes * 0.985 && (alreadyMp4File || canRepackage(meta))) {
        el.progress.hidden = false;
        el.goWrap.hidden = true;
        const alreadyMp4 = /^MP4$/i.test(meta.format);
        el.progressLabel.textContent = alreadyMp4 ? 'Already under the limit' : 'Repackaging to MP4';
        el.progressSub.textContent = alreadyMp4 ? 'no re-encode needed' : 'copying streams, no re-encode';
        el.progressFill.style.width = '100%';
        el.progressPct.textContent = '100%';

        const out = alreadyMp4
          ? { blob: state.file, bytes: state.file.size, mode: 'passthrough', hasAudio: meta.hasAudio }
          : await repackage(meta, (frac) => { el.progressFill.style.width = (frac * 100).toFixed(1) + '%'; });
        out.mode = alreadyMp4 ? 'passthrough' : 'remux';
        finish(out, targetBytes);
        return out;
      }

      const base = planFor(meta, targetBytes, 1);

      for (let pass = 1; pass <= maxPasses; pass++) {
        const plan = planFor(meta, targetBytes, factor, { w: base.width, h: base.height });
        state.plan = plan;
        showPlan(plan);
        progressStart(pass, maxPasses, plan);

        const t0 = performance.now();
        const out = await runPass(plan, (frac) => {
          const elapsed = (performance.now() - t0) / 1000;
          const eta = frac > 0.02 ? (elapsed * (1 - frac)) / frac : NaN;
          progressUpdate(Math.min(99.9, frac * 100), plan, eta);
        });

        const ratio = out.bytes / targetBytes;
        if (out.bytes <= targetBytes) { if (!bestUnder || out.bytes > bestUnder.bytes) bestUnder = out; }
        if (!smallest || out.bytes < smallest.bytes) smallest = out;

        if (ratio <= 0.995 && ratio >= 0.93) break;
        if (pass === maxPasses) break;

        // one knob per pass: resolution stays put, the bitrate moves by the measured ratio
        factor *= ratio > 1 ? Math.max(0.6, (1 / ratio) * 0.99) : Math.min(1.4, (1 / ratio) * 0.99);
        if (factor < 0.3 || factor > 2.5) break;
      }

      const final = bestUnder || smallest;
      if (!final) throw new Error('failed');
      finish(final, targetBytes);
      return final;
    } catch (e) {
      if (state.aborted) {
        el.goNote.textContent = 'Cancelled — nothing was encoded.';
      } else {
        fail(e);
      }
      throw e;
    } finally {
      state.running = false;
      state.conversion = null;
      setBusy(false);
      el.progress.hidden = true;
    }
  }

  /* ------------------------------------------------------------------ */
  /* UI                                                                  */
  /* ------------------------------------------------------------------ */

  function setBusy(busy) {
    el.go.disabled = busy || !state.meta;
    if (el.cancel) {
      el.cancel.disabled = !busy;
      el.cancel.hidden = !busy;
    }
    el.go.textContent = busy ? 'Compressing…' : 'Compress video';
    el.drop.style.pointerEvents = busy ? 'none' : '';
    el.change.disabled = busy;
  }

  function progressStart(pass, total, plan) {
    el.progress.hidden = false;
    el.goWrap.hidden = true;
    el.progressLabel.textContent = total > 1 ? `Encoding · pass ${pass} of up to ${total}` : 'Encoding';
    progressUpdate(0, plan, NaN);
  }

  function progressUpdate(pct, plan, eta) {
    el.progressFill.style.width = pct.toFixed(1) + '%';
    el.progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    el.progressPct.textContent = Math.round(pct) + '%';
    const bits = [`${plan.width}×${plan.height}`, fmtMbps(plan.videoBps), `${plan.fps} fps`];
    if (isFinite(eta) && eta > 0.5) bits.push(`~${Math.ceil(eta)}s left`);
    el.progressSub.textContent = bits.join(' · ');
  }

  function showPlan(plan) {
    if (!state.meta) return;
    el.planNote.innerHTML =
      `Video budget <strong>${fmtMbps(plan.videoBps)}</strong> at <strong>${plan.width}×${plan.height}</strong> · ${plan.fps} fps · ` +
      `${plan.bpp.toFixed(2)} bits per pixel per frame` +
      (plan.height < state.meta.height ? ' · resolution stepped down to keep it sharp' : '');
  }

  function finish(out, targetBytes) {
    if (state.blobUrl) URL.revokeObjectURL(state.blobUrl);
    state.blobUrl = URL.createObjectURL(out.blob);
    state.result = out;

    const base = (state.file.name || 'video').replace(/\.[^.]+$/, '');
    const mode = out.mode || 'encode';
    el.download.href = state.blobUrl;
    el.download.download = mode === 'passthrough'
      ? state.file.name                       // untouched file keeps its own name
      : `${base}-${(targetBytes / MB).toFixed(0)}mb-discord.mp4`;
    el.download.textContent = `Download MP4 · ${fmtBytes(out.blob.size)}`;

    el.rTarget.textContent = fmtBytes(targetBytes);
    el.rActual.textContent = fmtBytes(out.blob.size);
    const src = state.file.size || 1;
    const saved = 1 - out.blob.size / src;
    const plan = state.plan || {};
    const headroom = targetBytes - out.blob.size;
    if (mode === 'passthrough') {
      el.rSaved.textContent = 'already fits';
      el.rHint.textContent = `${state.meta.format || 'your file'} · unchanged, nothing was re-encoded`;
    } else if (mode === 'remux') {
      el.rSaved.textContent = 'repackaged';
      el.rHint.textContent =
        `H.264 + AAC copied into MP4 · no re-encode · ${fmtBytes(headroom)} under the limit`;
    } else {
      el.rSaved.textContent = saved > 0.005
        ? Math.round(saved * 100) + '% smaller'
        : (saved < -0.005 ? 'larger than source' : 'same size');
      el.rHint.textContent =
        `${state.meta.hasAudio ? 'H.264 + AAC' : 'H.264, no audio track'}` +
        (plan.width ? ` · ${plan.width}×${plan.height} · ${plan.fps} fps` : '') +
        (headroom > 0 ? ` · ${fmtBytes(headroom)} under the limit` : '') +
        (saved <= 0.005 ? ' · this re-encode is not smaller than your source' : '');
    }

    el.progress.hidden = true;
    el.goWrap.hidden = true;
    el.result.hidden = false;

    el.rowResult.hidden = false;
    const max = Math.max(src, targetBytes, out.blob.size);
    el.barResult.style.width = ((out.blob.size / max) * 100).toFixed(2) + '%';
    el.valResult.textContent = fmtBytes(out.blob.size);
    el.valSrc.textContent = fmtBytes(src);
    el.valTarget.textContent = fmtBytes(targetBytes);
    el.result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function fail(e) {
    const map = {
      'lib-failed': 'The encoder library could not be loaded. Serve the folder over http (python -m http.server) rather than opening the file directly.',
      'lib-missing': 'The encoder library loaded but did not register itself. Reload the page.',
      unsupported: 'That container cannot be read. MP4, MOV, M4V, WEBM and MKV work; AVI does not open in a browser.',
      undecodable: 'The container opened but this browser has no decoder for the codec inside — HEVC and ProRes are the usual culprits.',
      'no-video-track': 'That file has no video track.',
      'invalid-conversion': 'This file cannot become an MP4 as it stands: a track would have to be dropped.',
      'target-too-small': 'That target is too small for this clip: the audio alone would eat the budget. Pick a larger size.',
      'bad-duration': 'The duration of that file could not be read.',
      failed: 'Encoding did not produce a file.'
    };
    const msg = map[e.message] || `Encoding failed: ${e.message}`;
    el.alert.textContent = msg;
    el.alert.hidden = false;
    el.goWrap.hidden = false;
    el.go.disabled = !state.meta;
  }

  let intakeToken = 0;

  async function acceptFile(file) {
    if (!file || state.running) return;
    if (state.file && state.meta && file.name === state.file.name &&
        file.size === state.file.size && file.lastModified === state.file.lastModified) return;
    const token = ++intakeToken;
    const stale = () => token !== intakeToken;

    clearResult();
    el.alert.hidden = true;
    el.fileName.textContent = file.name;
    el.fileMeta.textContent = 'Reading…';
    el.filecard.hidden = false;
    el.goNote.textContent = 'Reading the file…';
    el.go.disabled = true;

    try {
      const meta = await probeFile(file);
      if (stale()) return;
      state.file = file;
      state.meta = meta;
      el.fileMeta.textContent =
        `${fmtBytes(file.size)} · ${fmtDurationSafe(meta.duration)} · ${meta.width}×${meta.height} · ` +
        `${meta.fps} fps${meta.hasAudio ? ' · audio' : ' · silent'}`;
      el.drop.hidden = true;
      el.budget.hidden = false;
      updateBudget();
      el.go.disabled = false;
      const advice = mobileAdvice(file, meta);
      if (advice) el.goNote.textContent = advice;
    } catch (e) {
      if (stale()) return;
      state.file = null;
      state.meta = null;
      el.fileMeta.textContent = '';
      el.filecard.hidden = true;
      el.drop.hidden = false;
      el.budget.hidden = true;
      el.go.disabled = true;
      el.goNote.textContent = 'Add a video to start.';
      el.file.value = '';
      fail(e);
    }
  }

  // Phones do expose an encoder since iOS 16.4, but they encode far slower than a
  // laptop and Safari kills tabs that hold too much memory. Say so before they wait.
  function mobileAdvice(file, meta) {
    const mobile = (navigator.userAgentData && navigator.userAgentData.mobile) ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!mobile) return '';
    const pixels = (meta.width || 0) * (meta.height || 0);
    const seconds = meta.duration || 0;
    const work = pixels * seconds * (meta.fps || 30);
    if (work > 8e9 || file.size > 120 * 1024 * 1024) {
      return 'Heavy file for a phone: expect several minutes, keep this tab in front, and keep the phone plugged in. If it stalls, use a computer.';
    }
    return '';
  }

  function clearResult() {
    state.result = null;
    el.result.hidden = true;
    el.goWrap.hidden = false;
    el.rowResult.hidden = true;
    el.progress.hidden = true;
    if (state.blobUrl) { URL.revokeObjectURL(state.blobUrl); state.blobUrl = null; }
  }

  function updateBudget() {
    if (!state.meta) return;
    const src = state.file.size;
    const target = state.targetMB * MB;
    const max = Math.max(src, target);
    el.barSrc.style.width = ((src / max) * 100).toFixed(2) + '%';
    el.barTarget.style.width = ((target / max) * 100).toFixed(2) + '%';
    el.valSrc.textContent = fmtBytes(src);
    el.valTarget.textContent = fmtBytes(target);
    el.rowResult.hidden = true;

    const plan = planFor(state.meta, Math.round(target), 1);
    el.goNote.textContent = state.file && state.file.size <= target * 0.98
      ? `Already under ${state.targetMB} MB — compressing would not make it smaller.`
      : `${state.meta.width}×${state.meta.height} → ${plan.width}×${plan.height} · ${fmtMbps(plan.videoBps)}`;
    showPlan(plan);
  }

  function readTarget() {
    const checked = document.querySelector('input[name="target"]:checked');
    if (!checked) return 10;
    if (checked.value === 'custom') {
      const v = parseFloat(el.custom.value);
      return isFinite(v) && v > 0 ? Math.min(2000, v) : null;
    }
    return parseFloat(checked.value);
  }

  /* ------------------------------------------------------------------ */
  /* events                                                              */
  /* ------------------------------------------------------------------ */

  el.drop.addEventListener('click', () => el.file.click());
  el.drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); }
  });
  el.change.addEventListener('click', () => el.file.click());

  el.file.addEventListener('change', () => {
    const f = fileFromList(el.file.files);
    if (f) acceptFile(f);
  });

  ['dragenter', 'dragover'].forEach((t) => {
    el.drop.addEventListener(t, (e) => { e.preventDefault(); el.drop.classList.add('is-over'); });
  });
  ['dragleave', 'dragend'].forEach((t) => {
    el.drop.addEventListener(t, () => el.drop.classList.remove('is-over'));
  });
  el.drop.addEventListener('drop', (e) => {
    e.preventDefault();
    el.drop.classList.remove('is-over');
    const f = fileFromList(e.dataTransfer && e.dataTransfer.files);
    if (f) acceptFile(f);
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  document.querySelectorAll('input[name="target"]').forEach((r) => {
    r.addEventListener('change', () => {
      const t = readTarget();
      if (t === null) { el.custom.focus(); return; }
      state.targetMB = t;
      clearResult();
      updateBudget();
    });
  });

  el.custom.addEventListener('input', () => {
    const v = parseFloat(el.custom.value);
    if (isFinite(v) && v > 0) {
      document.querySelector('input[name="target"][value="custom"]').checked = true;
      state.targetMB = Math.min(2000, v);
      clearResult();
      updateBudget();
    }
  });

  // paste a file straight onto the page: one keystroke instead of a file dialog
  document.addEventListener('paste', (e) => {
    if (state.running) return;
    const dt = e.clipboardData;
    if (!dt) return;
    let f = dt.files && dt.files.length ? dt.files[0] : null;
    if (!f && dt.items) {
      for (const it of dt.items) {
        if (it.kind === 'file') { f = it.getAsFile(); if (f) break; }
      }
    }
    f = fileFromList(f ? [f] : null);
    if (f) { e.preventDefault(); acceptFile(f); }
  });

  function cancelRun() {
    if (!state.running) return;
    state.aborted = true;
    el.goNote.textContent = 'Cancelling…';
    const conv = state.conversion;
    if (conv && typeof conv.cancel === 'function') {
      Promise.resolve(conv.cancel()).catch(() => {});
    }
  }

  el.cancel.addEventListener('click', cancelRun);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.running) { e.preventDefault(); cancelRun(); }
  });

  el.go.addEventListener('click', () => { compress().catch(() => {}); });

  el.again.addEventListener('click', () => {
    if (state.running) return;
    clearResult();
    state.file = null;
    state.meta = null;
    state.plan = null;
    intakeToken++;
    el.file.value = '';
    el.filecard.hidden = true;
    el.drop.hidden = false;
    el.budget.hidden = true;
    el.alert.hidden = true;
    el.go.disabled = true;
    el.goNote.textContent = 'Add a video to start.';
    el.drop.focus();
  });

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  el.valTarget.textContent = '10 MB';
  el.barTarget.style.width = '100%';

  const blockedFileProtocol = location.protocol === 'file:';
  if (blockedFileProtocol) {
    el.alert.hidden = false;
    el.alert.textContent = 'Open this page over http, not as a file: browsers refuse to load the encoder module from file://. In this folder run "python -m http.server 8080" and open http://localhost:8080.';
    el.go.disabled = true;
  } else if (typeof VideoEncoder !== 'function') {
    el.alert.hidden = false;
    el.alert.textContent = 'This browser does not expose a video encoder (WebCodecs) to the page, so it cannot compress locally. Chrome, Edge or Firefox on desktop and Chrome on Android all work; on iPhone or iPad you need iOS 16.4 or newer.';
    el.go.disabled = true;
  }

  // exposed for automated checks; harmless in production
  window.__sizecut = {
    state, compress, acceptFile, planFor, loadLib,
    setTarget(mb) { state.targetMB = mb; updateBudget(); }
  };
})();
