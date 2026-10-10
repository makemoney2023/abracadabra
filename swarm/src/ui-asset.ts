/** R2 key for a canvas file published under `ui/`. Anything else stays on the assets binding. */
export function uiAssetKey(pathname: string): string | null {
  if (pathname === '/' || pathname === '/index.html') return 'ui/index.html';
  if (!pathname.startsWith('/assets/')) return null;
  const name = pathname.slice('/assets/'.length);
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  return `ui/assets/${name}`;
}

export function uiContentType(key: string): string {
  if (key.endsWith('.html')) return 'text/html; charset=utf-8';
  if (key.endsWith('.css')) return 'text/css; charset=utf-8';
  if (key.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}
