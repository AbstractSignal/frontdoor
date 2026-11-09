#!/usr/bin/env bash
# purpose: Headless screenshot + computed-style check of the served page via CDP (what a browser actually sees)
# usage: bash bin/dashboard-verify.sh [URL] [selector1,selector2,...]   # default URL is the LAN door the infra repo deploys to
set -euo pipefail

URL="${1:-http://192.168.66.12:8080/?t=${RANDOM}#/homelab}"
SELECTORS="${2:-.box-lan,.box,.door,.b-icon}"
PORT="${DASH_VERIFY_PORT:-9222}"
SETTLE_MS="${DASH_VERIFY_SETTLE_MS:-3000}"
OUT="${DASH_VERIFY_OUT:-/tmp/dashboard-verify-$(date +%Y%m%d-%H%M%S).png}"

# Reuse a CDP endpoint already on 127.0.0.1:PORT (e.g. the user's Chrome);
# otherwise start a throwaway headless chromium and retire it on exit.
if ! curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  DATA_DIR="$(mktemp -d)"
  chromium --headless=new --remote-debugging-port="${PORT}" --remote-debugging-address=127.0.0.1 \
    --user-data-dir="${DATA_DIR}" --no-first-run --no-default-browser-check --disable-gpu about:blank >/dev/null 2>&1 &
  CHROME_PID=$!
  trap 'kill "${CHROME_PID}" 2>/dev/null || true; rm -r -- "${DATA_DIR}" 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null || {
    echo "verify: no CDP endpoint on 127.0.0.1:${PORT} and chromium would not start" >&2
    exit 1
  }
fi

DASH_URL="${URL}" DASH_SELECTORS="${SELECTORS}" DASH_OUT="${OUT}" \
DASH_SETTLE_MS="${SETTLE_MS}" DASH_PORT="${PORT}" node <<'EOF'
const port = process.env.DASH_PORT;
const j = (path, opts) => fetch(`http://127.0.0.1:${port}${path}`, opts).then((r) => r.json());
(async () => {
  const tab = await j('/json/new?about:blank', { method: 'PUT' });
  const closeTab = () => fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`).catch(() => {});
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.env.DASH_URL });
  await new Promise((r) => setTimeout(r, Number(process.env.DASH_SETTLE_MS)));
  const ready = (await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })).result.value;
  const title = (await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value;
  const size = (await send('Page.getLayoutMetrics')).cssContentSize;
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.min(Math.ceil(size.height), 8000), scale: 1 },
  });
  require('node:fs').writeFileSync(process.env.DASH_OUT, Buffer.from(shot.data, 'base64'));
  const sels = process.env.DASH_SELECTORS.split(',').map((s) => s.trim()).filter(Boolean);
  const expr = `(async () => {
    const out = [];
    for (const sel of ${JSON.stringify(sels)}) {
      const els = document.querySelectorAll(sel);
      if (!els.length) { out.push({ sel, count: 0 }); continue; }
      const b = els[0].getBoundingClientRect();
      const cs = getComputedStyle(els[0]);
      out.push({ sel, count: els.length, w: Math.round(b.width), h: Math.round(b.height), color: cs.color, bg: cs.backgroundColor });
    }
    return JSON.stringify(out);
  })()`;
  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const report = JSON.parse(res.result.value);
  for (const r of report)
    console.log(r.count === 0 ? `MISSING ${r.sel}` : `${r.sel}: x${r.count} ${r.w}x${r.h} color=${r.color} bg=${r.bg}`);
  console.log(`page: ${title} (readyState=${ready})`);
  await closeTab();
  ws.close();
  process.exit(ready === 'complete' && report.every((r) => r.count > 0) ? 0 : 1);
})().catch((e) => {
  console.error(`verify: ${e.message}`);
  process.exit(1);
});
EOF

echo "verify: ok — ${URL}"
echo "screenshot: ${OUT}"
