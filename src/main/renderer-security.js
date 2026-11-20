const { readFile, realpath } = require('node:fs/promises');
const path = require('node:path');

const scheme = 'klipy';
const rendererUrl = `${scheme}://app/index.html`;
const rendererSession = 'klipy-renderer'; // in-memory; no persistent renderer storage
const devUrl = 'http://127.0.0.1:5173/';
const types = {
  '.html': 'text/html; charset=UTF-8', '.js': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

function policy(isDev) {
  return [
    "default-src 'none'",
    `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
    "style-src 'self' 'unsafe-inline'", // HeroUI / Framer Motion inline styles
    "img-src 'self' data: blob:",
    "font-src 'self'",
    isDev ? "connect-src 'self' ws://127.0.0.1:5173" : "connect-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ].join('; ');
}

function assetPath(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== `${scheme}:` || url.host !== 'app' || url.username || url.password || url.search) return null;
  const name = url.pathname.slice(1);
  if (/^(?:index\.html|logo\.svg|app-icon\.png)$/.test(name) ||
      /^assets\/[a-z0-9_.-]+\.(?:js|css|svg|png|woff2)$/i.test(name) ||
      /^brands\/si\/[a-z0-9_-]+\.svg$/i.test(name)) return name;
  return null;
}

async function configureRenderer(session, dist, isDev) {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);

  if (isDev) {
    session.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      callback({ cancel: !['http://127.0.0.1:5173', 'ws://127.0.0.1:5173'].includes(url.origin) &&
        !['data:', 'blob:'].includes(url.protocol) });
    });
    session.webRequest.onHeadersReceived({ urls: [devUrl + '*'] }, (details, callback) => {
      if (details.resourceType !== 'mainFrame') return callback({});
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy(true)] } });
    });
    return;
  }

  const root = await realpath(dist);
  session.protocol.handle(scheme, async (request) => {
    try {
      const asset = request.method === 'GET' && assetPath(request.url);
      if (!asset) return new Response(null, { status: 404 });
      const file = await realpath(path.join(root, asset));
      const relative = path.relative(root, file);
      if (!relative || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') {
        return new Response(null, { status: 404 });
      }
      return new Response(await readFile(file), { headers: {
        'Content-Type': types[path.extname(asset).toLowerCase()],
        'Content-Security-Policy': policy(false),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store',
      } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });

  session.webRequest.onBeforeRequest(({ url }, callback) => {
    callback({ cancel: !url.startsWith(`${scheme}://app/`) && !url.startsWith('data:') &&
      !url.startsWith(`blob:${scheme}://app/`) });
  });
}

module.exports = { scheme, rendererUrl, rendererSession, devUrl, assetPath, configureRenderer };
