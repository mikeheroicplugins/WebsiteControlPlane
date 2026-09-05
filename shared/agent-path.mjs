// The hosted bridge and the VPS gateway must use the same API translations.
export function agentPath(input, method = 'GET') {
  const url = new URL(input, 'http://geekheros.internal');
  let pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return pathname + url.search;
  pathname = pathname.slice(4);
  if (pathname === '/system') pathname = '/health';
  if (pathname === '/domains' && method.toUpperCase() === 'POST') pathname = '/domains/call';
  if (pathname === '/domains' && method.toUpperCase() === 'PUT') pathname = '/domains/settings';
  if (pathname === '/lovable' && method.toUpperCase() === 'POST') pathname = '/lovable/connect';
  return pathname + url.search;
}
