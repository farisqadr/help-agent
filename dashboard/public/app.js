const PROTECTED_DEFAULTS = [
  'Gambling',
  'Porn/NSFW',
  'Prediction Market',
  'Perpetual DEX',
  'Binary Option',
  'Lending/Borrowing',
];

const WEIGHT_KEYS = ['volume24h', 'feeApr', 'volatility', 'holderQuality', 'binUtilization'];

const state = { config: null, candidates: [] };

// ---------- helpers ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${path}`);
  return data;
}

let toastTimer = null;
function toast(msg, kind = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 4) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toFixed(d));
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const timeAgo = (iso) => {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

// ---------- tabs ----------
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---------- overview ----------
async function loadOverview() {
  const s = await api('/api/status');
  $('ov-balance').textContent = `${fmt(s.balance?.sol)} SOL`;
  $('ov-positions').textContent = s.openPositions;
  $('ov-rpc').textContent = s.rpc?.ok ? `slot ${s.rpc.slot}` : 'down';
  $('ov-mode').textContent = s.dryRun ? 'DRY RUN' : 'LIVE';

  const dryBadge = $('dry-badge');
  dryBadge.textContent = s.dryRun ? 'DRY RUN' : 'LIVE';
  dryBadge.className = `badge ${s.dryRun ? 'dry' : 'live'}`;

  await loadDaemon();
  await loadNetwork();
}

// ---------- network mode + wallet ----------
async function loadNetwork() {
  const m = await api('/api/mode');
  const dry = m.dryRun;
  $('mode-toggle').checked = !dry;
  $('mode-label').textContent = dry ? 'DRY RUN' : 'MAINNET';
  $('mode-hint').textContent = dry ? 'Simulated — no real transactions' : 'Live trading with real funds';
  $('mode-dry').classList.toggle('active', dry);
  $('mode-live').classList.toggle('active', !dry);
  $('mode-live').classList.toggle('danger', !dry);
  renderWallet(m.wallet);
}

function renderWallet(w) {
  $('wal-status').textContent = w.hasKey ? (w.pubkey ? 'configured' : 'invalid key') : 'none';
  $('wal-pubkey').textContent = w.pubkey ? shortAddr(w.pubkey) : '—';
}

$('mode-toggle').addEventListener('change', async (e) => {
  const wantMainnet = e.target.checked;
  if (wantMainnet && !confirm('Switch to MAINNET? The agent will use real funds for live trading.')) {
    e.target.checked = false;
    return;
  }
  try {
    await api('/api/mode', { method: 'POST', body: { dryRun: !wantMainnet } });
    toast(wantMainnet ? 'Switched to MAINNET' : 'Switched to DRY RUN', wantMainnet ? 'err' : 'ok');
    await loadOverview();
  } catch (err) {
    toast(err.message, 'err');
    await loadNetwork();
  }
});

$('btn-wal-save').addEventListener('click', async () => {
  const key = $('wal-key').value.trim();
  if (!key) return toast('Paste a private key first', 'err');
  try {
    const w = await api('/api/wallet', { method: 'POST', body: { privateKey: key } });
    $('wal-key').value = '';
    renderWallet(w);
    toast(`Wallet saved · ${shortAddr(w.pubkey)}`);
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-wal-remove').addEventListener('click', async () => {
  if (!confirm('Remove the stored wallet key? Agent reverts to dry-run.')) return;
  try {
    const w = await api('/api/wallet', { method: 'DELETE' });
    renderWallet(w);
    await loadNetwork();
    toast('Wallet removed');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-wal-test').addEventListener('click', async () => {
  $('wal-test').textContent = 'Testing…';
  try {
    const r = await api('/api/wallet/test', { method: 'POST' });
    $('wal-test').textContent = r.ok
      ? `OK · ${shortAddr(r.pubkey)} · ${fmt(r.sol)} SOL · slot ${r.slot}`
      : `Failed: ${r.error}`;
    $('wal-test').style.color = r.ok ? 'var(--primary)' : 'var(--danger)';
  } catch (e) { $('wal-test').textContent = e.message; $('wal-test').style.color = 'var(--danger)'; }
});

async function loadDaemon() {
  const d = await api('/api/daemon');
  $('dm-status').textContent = d.running ? 'running' : 'stopped';
  $('dm-screen').textContent = `${d.screeningIntervalMin}m`;
  $('dm-manage').textContent = `${d.managementIntervalMin}m`;
  $('dm-last-screen').textContent = timeAgo(d.lastRun?.screening);
  $('dm-last-manage').textContent = timeAgo(d.lastRun?.management);
  const badge = $('daemon-badge');
  badge.textContent = `daemon: ${d.running ? 'on' : 'off'}`;
  badge.className = `badge ${d.running ? 'on' : 'off'}`;
}

$('btn-refresh').addEventListener('click', () => loadOverview().catch((e) => toast(e.message, 'err')));
$('btn-daemon-start').addEventListener('click', async () => {
  try { await api('/api/daemon/start', { method: 'POST' }); toast('Daemon started'); loadDaemon(); }
  catch (e) { toast(e.message, 'err'); }
});
$('btn-daemon-stop').addEventListener('click', async () => {
  try { await api('/api/daemon/stop', { method: 'POST' }); toast('Daemon stopped'); loadDaemon(); }
  catch (e) { toast(e.message, 'err'); }
});

// ---------- config load + bind ----------
async function loadConfig() {
  state.config = await api('/api/config');
  bindScreening();
  bindExit();
  bindProtection();
  bindLearning();
}

function bindScreening() {
  const c = state.config;
  const weights = c.screening?.weights ?? {};
  const box = $('weights');
  box.innerHTML = '';
  WEIGHT_KEYS.forEach((k) => {
    const v = Math.round((weights[k] ?? 0) * 100);
    const row = document.createElement('div');
    row.className = 'weight-row';
    row.innerHTML = `<label>${k}</label>
      <input type="range" min="0" max="100" value="${v}" data-w="${k}" />
      <span class="wval" data-wv="${k}">${v}%</span>`;
    box.appendChild(row);
  });
  box.querySelectorAll('input[type=range]').forEach((inp) => {
    inp.addEventListener('input', () => {
      box.querySelector(`[data-wv="${inp.dataset.w}"]`).textContent = `${inp.value}%`;
    });
  });
  $('sc-minScore').value = c.screening?.minScore ?? 0.5;
  $('sc-top').value = c.screening?.topCandidatesLimit ?? 10;
  $('sc-discover').value = c.screening?.discoverLimit ?? 50;
  $('sc-screenInt').value = c.screeningIntervalMin ?? 30;
  $('sc-manageInt').value = c.managementIntervalMin ?? 5;
  $('sc-poolUrl').value = c.screening?.poolListUrl ?? '';

  $('dp-auto').checked = c.deploy?.autoDeploy !== false;
  $('dp-sol').value = c.deploy?.autoDeploySol ?? '';
  $('dp-pct').value = c.deploy?.maxDeployPct ?? 0.25;
}

$('btn-save-deploy').addEventListener('click', async () => {
  try {
    state.config = await api('/api/config', {
      method: 'PUT',
      body: {
        deploy: {
          autoDeploy: $('dp-auto').checked,
          autoDeploySol: $('dp-sol').value ? Number($('dp-sol').value) : null,
          maxDeployPct: Number($('dp-pct').value),
        },
      },
    });
    bindScreening();
    toast('Auto-deploy settings saved');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-save-screening').addEventListener('click', async () => {
  const weights = {};
  document.querySelectorAll('#weights input[type=range]').forEach((inp) => {
    weights[inp.dataset.w] = Number(inp.value);
  });
  try {
    state.config = await api('/api/config', {
      method: 'PUT',
      body: {
        screeningIntervalMin: Number($('sc-screenInt').value),
        managementIntervalMin: Number($('sc-manageInt').value),
        screening: {
          weights,
          minScore: Number($('sc-minScore').value),
          topCandidatesLimit: Number($('sc-top').value),
          discoverLimit: Number($('sc-discover').value),
          poolListUrl: $('sc-poolUrl').value.trim(),
        },
      },
    });
    bindScreening();
    bindLearning();
    toast('Screening criteria saved');
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-run-screen').addEventListener('click', async () => {
  toast('Running screening…');
  try { await api('/api/actions/screen', { method: 'POST' }); await loadCandidates(); toast('Screening complete'); }
  catch (e) { toast(e.message, 'err'); }
});

async function loadCandidates() {
  const data = await api('/api/candidates');
  state.candidates = data.candidates ?? [];
  const tbody = document.querySelector('#cand-table tbody');
  tbody.innerHTML = '';
  if (!state.candidates.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No candidates. Run screening.</td></tr>';
  }
  state.candidates.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><b>${c.name ?? '—'}</b><br><span class="mono">${shortAddr(c.poolAddress)}</span></td>
      <td>${fmt(c.score, 3)}</td>
      <td>${c.volume24h ? '$' + Number(c.volume24h).toLocaleString() : '—'}</td>
      <td>${fmt((c.feeApr ?? 0) * 100, 1)}%</td>
      <td>${fmt(c.volatility, 2)}</td>
      <td><button class="btn btn-sm btn-primary" data-deploy="${i}">Deploy</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-deploy]').forEach((b) => {
    b.addEventListener('click', () => prefillDeploy(state.candidates[Number(b.dataset.deploy)]));
  });
  $('cand-meta').textContent = `${state.candidates.length} candidates`;
  $('rejected-meta').textContent = (data.rejected?.length)
    ? `Rejected by protection: ${data.rejected.map((r) => `${shortAddr(r.poolAddress)} (${r.reason})`).join(', ')}`
    : '';
}

function prefillDeploy(c) {
  $('op-pool').value = c.poolAddress ?? '';
  $('op-mint').value = c.tokenMint ?? '';
  $('op-vol').value = c.volatility ?? '';
  document.querySelector('.nav-item[data-tab="open"]').click();
  toast(`Prefilled ${c.name ?? 'candidate'} — set amount & deploy`);
}

// ---------- open position ----------
document.querySelectorAll('#op-range-seg .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#op-range-seg .seg-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const manual = btn.dataset.range === 'manual';
    $('op-manual-range').classList.toggle('hidden', !manual);
    $('op-auto-range').classList.toggle('hidden', manual);
  });
});

$('btn-deploy').addEventListener('click', async () => {
  const rangeMode = document.querySelector('#op-range-seg .seg-btn.active').dataset.range;
  const exit = {};
  if ($('op-tp').value) exit.takeProfitPct = Number($('op-tp').value);
  if ($('op-sl').value) exit.stopLossPct = Number($('op-sl').value);
  if ($('op-trail').value) exit.trailingStopPct = Number($('op-trail').value);
  exit.autoSwapToSol = $('op-autoswap').checked;

  const body = {
    poolAddress: $('op-pool').value.trim(),
    tokenMint: $('op-mint').value.trim() || undefined,
    solAmount: $('op-amount').value ? Number($('op-amount').value) : undefined,
    mode: $('op-mode').value,
    rangeMode,
    exit,
  };
  if (rangeMode === 'manual') {
    body.manualRange = { binsBelow: Number($('op-below').value), binsAbove: Number($('op-above').value) };
  } else if ($('op-vol').value) {
    body.volatility = Number($('op-vol').value);
  }

  if (!body.poolAddress) return toast('Pool address required', 'err');
  try {
    const r = await api('/api/positions/deploy', { method: 'POST', body });
    toast(`Deployed ${fmt(r.position?.solDeployed)} SOL (${r.position?.strategyMode})`);
    loadPositions();
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- positions ----------
async function loadPositions() {
  const { positions } = await api('/api/positions');
  const box = $('positions-list');
  box.innerHTML = '';
  if (!positions.length) {
    box.innerHTML = '<div class="card empty">No open positions.</div>';
    return;
  }
  positions.forEach((p) => {
    const exit = p.exit ?? {};
    const card = document.createElement('div');
    card.className = 'pos-card';
    card.innerHTML = `
      <div class="pos-head">
        <span class="mono">${shortAddr(p.poolAddress)}</span>
        <span class="pill ${(p.strategyMode || '').toLowerCase()}">${p.strategyMode}</span>
      </div>
      <div class="kv"><span>Deployed</span><b>${fmt(p.solDeployed)} SOL</b></div>
      <div class="kv"><span>Entry price</span><b>${fmt(p.entryPrice)}</b></div>
      <div class="kv"><span>Range</span><b>${p.rangeMode} · ${p.binRange?.binCount ?? '—'} bins</b></div>
      <div class="kv"><span>Peak PnL</span><b>${fmt(p.peakPnlPct, 2)}%</b></div>
      <div class="grid grid-3 tight mt">
        <label class="field"><span>TP %</span><input type="number" step="0.1" value="${exit.takeProfitPct ?? ''}" data-x="tp" /></label>
        <label class="field"><span>SL %</span><input type="number" step="0.1" value="${exit.stopLossPct ?? ''}" data-x="sl" /></label>
        <label class="field"><span>Trail %</span><input type="number" step="0.1" value="${exit.trailingStopPct ?? ''}" data-x="trail" /></label>
      </div>
      <div class="actions" style="margin-top:8px">
        <button class="btn btn-sm" data-save="${p.id}">Save Exit</button>
        <button class="btn btn-sm btn-danger" data-close="${p.id}">Close Now</button>
      </div>`;
    box.appendChild(card);

    card.querySelector(`[data-save="${p.id}"]`).addEventListener('click', async () => {
      const exitBody = {};
      card.querySelectorAll('input[data-x]').forEach((inp) => {
        if (inp.value === '') return;
        const map = { tp: 'takeProfitPct', sl: 'stopLossPct', trail: 'trailingStopPct' };
        exitBody[map[inp.dataset.x]] = Number(inp.value);
      });
      try { await api(`/api/positions/${p.id}/exit`, { method: 'PUT', body: exitBody }); toast('Exit plan updated'); }
      catch (e) { toast(e.message, 'err'); }
    });

    card.querySelector(`[data-close="${p.id}"]`).addEventListener('click', async () => {
      try {
        const r = await api('/api/positions/close', { method: 'POST', body: { positionId: p.id, reason: 'manual' } });
        toast(`Closed · PnL ${fmt(r.actualPnlSol)} SOL${r.swap ? ' · swapped to SOL' : ''}`);
        loadPositions();
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

$('btn-run-manage').addEventListener('click', async () => {
  toast('Running manage cycle…');
  try { await api('/api/actions/manage', { method: 'POST' }); await loadPositions(); toast('Manage cycle complete'); }
  catch (e) { toast(e.message, 'err'); }
});

// ---------- exit plan ----------
function bindExit() {
  const e = state.config.exit ?? {};
  $('ex-tp').value = e.takeProfitPct ?? 10;
  $('ex-sl').value = e.stopLossPct ?? 5;
  $('ex-trail').value = e.trailingStopPct ?? 3;
  $('ex-trail-enabled').checked = e.trailingEnabled !== false;
  $('ex-autoswap').checked = e.autoSwapToSol !== false;
  $('ex-autotune').checked = Boolean(e.autoTune);
  $('ex-last-tuned').textContent = e.lastTunedAt ? timeAgo(e.lastTunedAt) : 'never';
}

$('btn-save-exit').addEventListener('click', async () => {
  try {
    state.config = await api('/api/config', {
      method: 'PUT',
      body: {
        exit: {
          takeProfitPct: Number($('ex-tp').value),
          stopLossPct: Number($('ex-sl').value),
          trailingStopPct: Number($('ex-trail').value),
          trailingEnabled: $('ex-trail-enabled').checked,
          autoSwapToSol: $('ex-autoswap').checked,
          autoTune: $('ex-autotune').checked,
        },
      },
    });
    bindExit();
    toast('Exit plan saved');
  } catch (e) { toast(e.message, 'err'); }
});

async function runFeedback() {
  toast('Running feedback loop…');
  try {
    await api('/api/actions/feedback', { method: 'POST' });
    await loadConfig();
    toast('Feedback loop complete');
  } catch (e) { toast(e.message, 'err'); }
}
$('btn-run-feedback').addEventListener('click', runFeedback);
$('btn-feedback2').addEventListener('click', runFeedback);

// ---------- protection ----------
function bindProtection() {
  const banned = state.config.risk?.bannedCategories ?? [];
  const all = [...new Set([...PROTECTED_DEFAULTS, ...banned])];
  const box = $('categories');
  box.innerHTML = '';
  all.forEach((cat) => {
    const on = banned.includes(cat);
    const row = document.createElement('div');
    row.className = 'cat-toggle';
    row.innerHTML = `<span>${cat}</span>
      <label class="switch"><input type="checkbox" data-cat="${cat}" ${on ? 'checked' : ''} /><span class="slider"></span></label>`;
    box.appendChild(row);
  });
  renderKeywords();
}

function renderKeywords() {
  const kws = state.config.risk?.keywordBlacklist ?? [];
  const box = $('keywords');
  box.innerHTML = kws.length ? '' : '<span class="muted">No keywords yet.</span>';
  kws.forEach((kw) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${kw}<button data-kw="${kw}">×</button>`;
    box.appendChild(chip);
  });
  box.querySelectorAll('[data-kw]').forEach((b) => {
    b.addEventListener('click', () => {
      state.config.risk.keywordBlacklist = state.config.risk.keywordBlacklist.filter((k) => k !== b.dataset.kw);
      renderKeywords();
    });
  });
}

$('btn-add-kw').addEventListener('click', () => {
  const v = $('kw-input').value.trim();
  if (!v) return;
  state.config.risk = state.config.risk ?? { keywordBlacklist: [] };
  state.config.risk.keywordBlacklist = [...new Set([...(state.config.risk.keywordBlacklist ?? []), v])];
  $('kw-input').value = '';
  renderKeywords();
});

$('btn-add-cat').addEventListener('click', () => {
  const v = $('cat-input').value.trim();
  if (!v) return;
  const box = $('categories');
  const row = document.createElement('div');
  row.className = 'cat-toggle';
  row.innerHTML = `<span>${v}</span><label class="switch"><input type="checkbox" data-cat="${v}" checked /><span class="slider"></span></label>`;
  box.appendChild(row);
  $('cat-input').value = '';
});

$('btn-save-protection').addEventListener('click', async () => {
  const bannedCategories = [...document.querySelectorAll('#categories input[data-cat]')]
    .filter((i) => i.checked).map((i) => i.dataset.cat);
  const keywordBlacklist = state.config.risk?.keywordBlacklist ?? [];
  try {
    state.config = await api('/api/config', { method: 'PUT', body: { risk: { bannedCategories, keywordBlacklist } } });
    bindProtection();
    toast('Protection settings saved');
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- learning ----------
function bindLearning() {
  const weights = state.config.screening?.weights ?? {};
  const box = $('learn-weights');
  box.innerHTML = '';
  Object.entries(weights).forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'kv';
    row.innerHTML = `<span>${k}</span><b>${fmt(v * 100, 1)}%</b>`;
    box.appendChild(row);
  });
  $('learn-tuned').textContent = state.config.screening?.lastTunedAt ? timeAgo(state.config.screening.lastTunedAt) : 'never';
}

async function loadDecisions() {
  const { entries } = await api('/api/logs/decisions');
  const box = $('decision-log');
  box.innerHTML = entries.length ? '' : '<span class="muted">No decisions logged yet.</span>';
  entries.forEach((e) => {
    const item = document.createElement('div');
    item.className = 'log-item';
    const detail = e.poolAddress ? shortAddr(e.poolAddress) : (e.positionId ?? '');
    const extra = e.reason ? ` · ${e.reason}` : (e.actualPnlSol != null ? ` · ${fmt(e.actualPnlSol)} SOL` : '');
    item.innerHTML = `<span class="act act-${e.action}">${e.action}</span> <span class="mono">${detail}</span>${extra}
      <div class="when">${timeAgo(e.timestamp)}</div>`;
    box.appendChild(item);
  });
}

// ---------- init ----------
async function init() {
  try {
    await loadConfig();
    await loadOverview();
    await loadCandidates();
    await loadPositions();
    await loadDecisions();
  } catch (e) { toast(e.message, 'err'); }
  setInterval(() => { loadOverview().catch(() => {}); loadDecisions().catch(() => {}); }, 20000);

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  ws.addEventListener('message', () => { loadPositions().catch(() => {}); loadDecisions().catch(() => {}); });
}

init();
