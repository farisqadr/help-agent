const PROTECTED_DEFAULTS = [
  'Gambling',
  'Porn/NSFW',
  'Prediction Market',
  'Perpetual DEX',
  'Binary Option',
  'Lending/Borrowing',
];

const state = { config: null, candidates: [] };

// Pool addresses the user dismissed from the candidate list (persisted locally).
const DISMISSED_KEY = 'help.dismissedCandidates';
function loadDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); }
  catch { return new Set(); }
}
let dismissed = loadDismissed();
function saveDismissed() {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
}

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
const usd = (n) => {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};
const COPY_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const EXTERNAL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const meteoraPoolUrl = (addr) => (addr ? `https://app.meteora.ag/dlmm/${addr}` : null);

async function copyText(text, label = 'Copied') {
  if (!text) return toast('Nothing to copy', 'err');
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast('Copy failed', 'err');
  }
}
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
  const bal = s.balance ?? {};
  $('ov-balance').textContent = bal.sol == null
    ? '—'
    : `${fmt(bal.sol)} SOL${bal.watchOnly ? ' · watch' : ''}`;
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
  const sourceLabel = { imported: 'imported key', solflare: 'Solflare connected', none: 'none' }[w.source] ?? 'none';
  $('wal-status').textContent = w.hasKey && !w.pubkey ? 'invalid key' : sourceLabel;
  $('wal-cantrade').textContent = w.canTrade ? 'yes — can trade' : 'no — import key to trade';
  const addr = w.pubkey || w.connectedAddress;
  $('wal-pubkey').textContent = addr ? shortAddr(addr) : '—';

  // Connect/Disconnect are mutually exclusive based on connection state.
  const connected = Boolean(w.connectedAddress || w.pubkey);
  $('btn-solflare').classList.toggle('hidden', connected);
  $('btn-solflare-disc').classList.toggle('hidden', !connected);

  // Remove key only makes sense when a signing key is stored.
  $('btn-wal-remove').classList.toggle('hidden', !w.hasKey);
  $('btn-wal-test').classList.toggle('hidden', !addr);
}

async function connectSolflare() {
  const provider = window.solflare || (window.solana?.isSolflare ? window.solana : null);
  if (!provider) {
    toast('Solflare not detected. Install the Solflare extension.', 'err');
    window.open('https://solflare.com/', '_blank');
    return;
  }
  try {
    await provider.connect();
    const pubkey = (provider.publicKey ?? window.solana?.publicKey)?.toString();
    if (!pubkey) throw new Error('Solflare did not return a public key');
    const w = await api('/api/wallet/connect', { method: 'POST', body: { pubkey } });
    renderWallet(w);
    await refreshAfterWalletChange();
    toast(`Solflare connected · ${shortAddr(pubkey)}`);
  } catch (e) {
    toast(e.message || 'Solflare connection failed', 'err');
  }
}

// Connecting/disconnecting/importing changes the active address — refresh the
// Overview balance and mode-scoped performance charts to match.
async function refreshAfterWalletChange() {
  await loadOverview().catch(() => {});
  window.refreshCharts?.();
}

$('btn-solflare').addEventListener('click', connectSolflare);
$('btn-solflare-disc').addEventListener('click', async () => {
  try {
    const provider = window.solflare || window.solana;
    if (provider?.disconnect) await provider.disconnect().catch(() => {});
    const w = await api('/api/wallet/disconnect', { method: 'POST' });
    renderWallet(w);
    await refreshAfterWalletChange();
    toast('Solflare disconnected');
  } catch (e) { toast(e.message, 'err'); }
});

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
    window.refreshCharts?.();
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
    await refreshAfterWalletChange();
    toast(`Wallet saved · ${shortAddr(w.pubkey)}`);
  } catch (e) { toast(e.message, 'err'); }
});

$('btn-wal-remove').addEventListener('click', async () => {
  if (!confirm('Remove the stored wallet key? Agent reverts to dry-run.')) return;
  try {
    const w = await api('/api/wallet', { method: 'DELETE' });
    renderWallet(w);
    await refreshAfterWalletChange();
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
  $('sc-top').value = c.screening?.topCandidatesLimit ?? 10;
  $('sc-discover').value = c.screening?.discoverLimit ?? 50;
  $('sc-screenInt').value = c.screeningIntervalMin ?? 30;
  $('sc-manageInt').value = c.managementIntervalMin ?? 5;
  $('sc-poolUrl').value = c.screening?.poolListUrl ?? '';

  $('dp-auto').checked = c.deploy?.autoDeploy !== false;
  $('dp-sol').value = c.deploy?.autoDeploySol ?? '';
  $('dp-pct').value = c.deploy?.maxDeployPct ?? 0.25;

  const dx = c.screening?.dexscreener ?? {};
  $('dx-enabled').checked = Boolean(dx.enabled);
  $('dx-minmc').value = dx.minMarketCapUsd ?? 0;
  $('dx-maxmc').value = dx.maxMarketCapUsd ?? 0;
  $('dx-minvol').value = dx.minVolume24hUsd ?? 0;
  $('dx-minliq').value = dx.minLiquidityUsd ?? 0;
}

$('btn-save-dex').addEventListener('click', async () => {
  try {
    state.config = await api('/api/config', {
      method: 'PUT',
      body: {
        screening: {
          dexscreener: {
            enabled: $('dx-enabled').checked,
            minMarketCapUsd: Number($('dx-minmc').value || 0),
            maxMarketCapUsd: Number($('dx-maxmc').value || 0),
            minVolume24hUsd: Number($('dx-minvol').value || 0),
            minLiquidityUsd: Number($('dx-minliq').value || 0),
          },
        },
      },
    });
    bindScreening();
    toast('DexScreener market filters saved');
  } catch (e) { toast(e.message, 'err'); }
});

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
  try {
    state.config = await api('/api/config', {
      method: 'PUT',
      body: {
        screeningIntervalMin: Number($('sc-screenInt').value),
        managementIntervalMin: Number($('sc-manageInt').value),
        screening: {
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

let lastCandidateData = null;
function renderCandidates(data) {
  lastCandidateData = data;
  state.candidates = (data.candidates ?? []).filter((c) => !dismissed.has(c.poolAddress));
  const tbody = document.querySelector('#cand-table tbody');
  tbody.innerHTML = '';
  if (!state.candidates.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No candidates. Adjust the market filters and Screen Now.</td></tr>';
  }
  state.candidates.forEach((c, i) => {
    const vol = c.volume24hUsd ?? c.volume24h;
    const meteora = meteoraPoolUrl(c.poolAddress);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="pool-cell">
          <div class="pool-head">
            <b>${c.name ?? '—'}</b>
            ${meteora ? `<a href="${meteora}" target="_blank" rel="noopener noreferrer" class="icon-link" title="View on Meteora">${EXTERNAL_SVG}</a>` : ''}
          </div>
          <div class="pool-row mono">
            <span class="muted">pool</span> ${shortAddr(c.poolAddress)}
            <button type="button" class="btn-icon" data-copy-pool="${i}" title="Copy pool address">${COPY_SVG}</button>
          </div>
          ${c.tokenMint ? `<div class="pool-row mono">
            <span class="muted">token</span> ${shortAddr(c.tokenMint)}
            <button type="button" class="btn-icon" data-copy-token="${i}" title="Copy token address">${COPY_SVG}</button>
          </div>` : ''}
        </div>
      </td>
      <td>${fmt(c.score, 3)}</td>
      <td>${usd(c.marketCap)}</td>
      <td>${usd(vol)}</td>
      <td>${usd(c.liquidityUsd)}</td>
      <td>${fmt((c.feeApr ?? 0) * 100, 1)}%</td>
      <td class="row-actions">
        <button class="btn btn-sm btn-primary" data-deploy="${i}">Deploy</button>
        <button class="btn btn-sm btn-danger" data-dismiss="${i}" title="Remove from list">×</button>
      </td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-copy-pool]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = state.candidates[Number(b.dataset.copyPool)];
      copyText(c?.poolAddress, 'Pool address copied');
    });
  });
  tbody.querySelectorAll('[data-copy-token]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const c = state.candidates[Number(b.dataset.copyToken)];
      copyText(c?.tokenMint, 'Token address copied');
    });
  });
  tbody.querySelectorAll('[data-deploy]').forEach((b) => {
    b.addEventListener('click', () => prefillDeploy(state.candidates[Number(b.dataset.deploy)]));
  });
  tbody.querySelectorAll('[data-dismiss]').forEach((b) => {
    b.addEventListener('click', () => {
      const c = state.candidates[Number(b.dataset.dismiss)];
      if (!c?.poolAddress) return;
      dismissed.add(c.poolAddress);
      saveDismissed();
      renderCandidates(lastCandidateData);
      toast(`Removed ${c.name ?? shortAddr(c.poolAddress)}`);
    });
  });

  const parts = [`${state.candidates.length} shown`];
  if (data.discovered != null) parts.push(`${data.discovered} discovered`);
  if (dismissed.size) parts.push(`${dismissed.size} hidden`);
  $('cand-meta').textContent = parts.join(' · ');

  $('rejected-meta').textContent = (data.rejected?.length)
    ? `Rejected by protection: ${data.rejected.map((r) => `${shortAddr(r.poolAddress)} (${r.reason})`).join(', ')}`
    : '';
}

async function loadCandidates() {
  renderCandidates(await api('/api/candidates'));
}

$('btn-refresh-cand').addEventListener('click', async () => {
  const btn = $('btn-refresh-cand');
  btn.disabled = true;
  try { await loadCandidates(); toast('Candidates refreshed'); }
  catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; }
});

$('btn-screen-now').addEventListener('click', async () => {
  const btn = $('btn-screen-now');
  btn.disabled = true;
  btn.textContent = 'Screening…';
  toast('Screening now…');
  try {
    const data = await api('/api/screen-now', { method: 'POST' });
    renderCandidates(data);
    toast(`Found ${data.matched} candidate(s) from ${data.discovered} pools`);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Screen Now';
  }
});

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
