// Markdown for agents: an agent that asks for text/markdown gets a real Markdown
// rendering of the same page instead of the HTML. Everything else falls through
// untouched, so the ordinary browser experience is identical.
const PAGES = {
  '/': '/md/index.md',
  '/about': '/md/about.md',
  '/privacy': '/md/privacy.md',
  '/contact': '/md/contact.md',
  '/benchmarks': '/md/benchmarks.md',
  '/formats': '/md/formats.md',
};

export async function onRequest(context) {
  const { request, next, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return next();

  const accept = request.headers.get('Accept') || '';
  if (!accept.includes('text/markdown')) return next();

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const mdPath = PAGES[path];
  if (!mdPath) return next();

  const asset = await env.ASSETS.fetch(new Request(new URL(mdPath, url.origin), request));
  if (!asset.ok) return next();

  const body = await asset.text();
  const headers = new Headers(asset.headers);
  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  headers.set('Vary', 'Accept, Accept-Encoding');
  headers.set('x-markdown-tokens', String(Math.ceil(body.length / 4)));
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}
