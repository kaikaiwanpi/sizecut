// WebMCP: expose what this page actually knows to a browsing agent.
// The draft moved from navigator.modelContext to document.modelContext; support both
// and do nothing at all when neither is present.
(() => {
  const mc =
    (typeof document !== 'undefined' && document.modelContext) ||
    (typeof navigator !== 'undefined' && navigator.modelContext) ||
    null;
  if (!mc || typeof mc.registerTool !== 'function') return;

  const controller = new AbortController();
  const opts = { signal: controller.signal };

  const LIMITS = [
    { plan: 'Base (free)', limit: '10 MB per the Account Caps table; 20 MB per the File Attachments FAQ (August 2026 change)' },
    { plan: 'Nitro Basic', limit: '50 MB' },
    { plan: 'Nitro', limit: '500 MB in the Account Caps table; up to 1 GB in the File Attachments FAQ' },
  ];

  const FORMATS = {
    input: ['MP4', 'MOV', 'M4V', 'WEBM', 'MKV'],
    not_supported: { AVI: 'the container cannot be read by the page; it says so instead of failing halfway' },
    output: 'H.264 video + AAC audio in an MP4 container',
    ios: 'iOS Safari exposes no video encoder to the page, so the tool declines there',
  };

  const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

  const tools = [
    {
      name: 'get_discord_size_limits',
      description: 'Return the Discord upload limits this page uses, and where each number comes from.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => text(LIMITS),
    },
    {
      name: 'get_supported_formats',
      description: 'Return which input containers the compressor reads and what it produces.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => text(FORMATS),
    },
    {
      name: 'estimate_bitrate_budget',
      description: 'Estimate the video bitrate that fits a target size for a given duration. Pure arithmetic, no file needed.',
      inputSchema: {
        type: 'object',
        properties: {
          targetMB: { type: 'number', description: 'Target size in megabytes' },
          durationSeconds: { type: 'number', description: 'Clip duration in seconds' },
        },
        required: ['targetMB', 'durationSeconds'],
        additionalProperties: false,
      },
      execute: async ({ targetMB, durationSeconds }) => {
        if (!(targetMB > 0) || !(durationSeconds > 0)) {
          return { content: [{ type: 'text', text: 'targetMB and durationSeconds must both be positive numbers' }], isError: true };
        }
        const audioBps = 96000;
        const usableBits = targetMB * 8 * 1e6 * 0.985;
        const videoBps = usableBits / durationSeconds - audioBps;
        return text({
          targetMB,
          durationSeconds,
          audioBps,
          estimated_video_bitrate_bps: Math.max(0, Math.round(videoBps)),
          note: '0.985 is the container safety factor the page uses; the real pass re-checks the result size.',
        });
      },
    },
    {
      name: 'get_compressor_state',
      description: 'Read the current state of the page: selected file, chosen target, whether an encode is running, last result size.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => {
        const s = (typeof window !== 'undefined' && window.__sizecut && window.__sizecut.state) || null;
        if (!s) return text({ available: false });
        return text({
          available: true,
          targetMB: s.targetMB ?? null,
          fileSelected: !!(s.meta && s.meta.name),
          fileName: s.meta ? s.meta.name : null,
          sourceBytes: s.meta ? s.meta.size : null,
          running: !!s.running,
          resultBytes: s.result ? s.result.bytes : null,
        });
      },
    },
  ];

  for (const tool of tools) {
    try {
      mc.registerTool(tool, opts);
    } catch (err) {
      // a tool that cannot be registered must not break the page
    }
  }

  window.addEventListener('pagehide', () => controller.abort(), { once: true });
})();
