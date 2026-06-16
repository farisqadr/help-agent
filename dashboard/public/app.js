async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed ${path}: ${res.status}`);
  return res.json();
}

async function refreshStatus() {
  const data = await fetchJson('/api/status');
  document.getElementById('status').textContent =
    `Dry run: ${data.dryRun} | SOL: ${data.balance?.sol?.toFixed(4) ?? '?'} | Open: ${data.openPositions}`;
}

async function refreshPositions() {
  const { positions } = await fetchJson('/api/positions');
  const el = document.getElementById('positions-list');
  if (positions.length === 0) {
    el.innerHTML = '<p>No open positions</p>';
    return;
  }
  el.innerHTML = positions.map((p) => `
    <div class="position-card">
      <strong>${p.id}</strong> — ${p.poolAddress?.slice(0, 12)}…
      <br>Mode: ${p.strategyMode} | Deployed: ${p.solDeployed} SOL
    </div>
  `).join('');
}

async function init() {
  await refreshStatus();
  await refreshPositions();
  setInterval(refreshStatus, 30000);
  setInterval(refreshPositions, 30000);

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  ws.addEventListener('message', () => {
    refreshStatus();
    refreshPositions();
  });
}

init().catch(console.error);
