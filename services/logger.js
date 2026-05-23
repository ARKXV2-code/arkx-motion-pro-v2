/**
 * Logger — broadcast ke WebSocket + console
 */
const MAX = 500;
const logs = [];

function log(type, msg, data = null) {
  const entry = { id: Date.now() + Math.random(), type, msg, data, ts: new Date().toISOString() };
  logs.unshift(entry);
  if (logs.length > MAX) logs.pop();

  if (global.wss) {
    const payload = JSON.stringify({ type: 'log', entry });
    global.wss.clients.forEach(c => { if (c.readyState === 1) { try { c.send(payload); } catch {} } });
  }

  const icons = { info:'ℹ️', success:'✅', error:'❌', warn:'⚠️', queue:'📋', retry:'🔄', proxy:'🌐' };
  console.log(`${icons[type]||'📝'} [${type.toUpperCase()}] ${msg}`);
}

module.exports = {
  info:    (m, d) => log('info', m, d),
  success: (m, d) => log('success', m, d),
  error:   (m, d) => log('error', m, d),
  warn:    (m, d) => log('warn', m, d),
  queue:   (m, d) => log('queue', m, d),
  retry:   (m, d) => log('retry', m, d),
  getLogs: (n = 100) => logs.slice(0, n),
  clear:   () => logs.length = 0,
};
