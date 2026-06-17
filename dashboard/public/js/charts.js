async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed ${path}: ${res.status}`);
  return res.json();
}

let pnlChart = null;
let poolChart = null;

function renderPnlChart(series) {
  const ctx = document.getElementById('pnl-chart');
  if (pnlChart) pnlChart.destroy();
  pnlChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map((p) => new Date(p.closedAt).toLocaleDateString()),
      datasets: [{
        label: 'Cumulative PnL (SOL)',
        data: series.map((p) => p.cumulativePnlSol),
        borderColor: '#22c55e',
        tension: 0.3,
      }],
    },
    options: { responsive: true },
  });
}

function renderPoolChart(pools) {
  const ctx = document.getElementById('pool-chart');
  if (poolChart) poolChart.destroy();
  const top = [...pools].sort((a, b) => b.totalPnlSol - a.totalPnlSol).slice(0, 10);
  poolChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map((p) => p.poolAddress.slice(0, 8) + '…'),
      datasets: [{
        label: 'Total PnL (SOL)',
        data: top.map((p) => p.totalPnlSol),
        backgroundColor: '#3b82f6',
      }],
    },
    options: { responsive: true },
  });
}

async function initCharts() {
  const [{ series }, { pools }] = await Promise.all([
    fetchJson('/api/charts/pnl'),
    fetchJson('/api/charts/pools'),
  ]);
  renderPnlChart(series.length ? series : [{ closedAt: new Date().toISOString(), cumulativePnlSol: 0 }]);
  renderPoolChart(pools);
}

initCharts().catch(console.error);

// Allow the main app (mode switch, wallet connect) to refresh performance.
window.refreshCharts = () => initCharts().catch(console.error);

const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${proto}//${location.host}`);
ws.addEventListener('message', (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'trade_closed') initCharts();
});
