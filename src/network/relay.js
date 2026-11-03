/** Resolve the relay from deployment configuration or the current host. */
export function resolveRelayUrl(location = globalThis.location, configured = globalThis.BANKSHOT_RELAY_URL || import.meta.env?.VITE_BANKSHOT_RELAY_URL) {
  const secure = location?.protocol === 'https:';
  const scheme = secure ? 'wss:' : 'ws:';
  const hostname = location?.hostname || 'localhost';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const host = !secure && loopback ? `${hostname}:8787` : (location?.host || hostname);
  const fallback = `${scheme}//${host}/relay`;
  const url = new URL(configured || fallback, fallback);
  if (!['ws:', 'wss:'].includes(url.protocol) || (secure && url.protocol !== 'wss:')) {
    throw new TypeError('The online relay must use a WebSocket URL compatible with this page.');
  }
  return url.href;
}
