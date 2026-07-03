'use strict';

/* ================= Data model ================= */

const STORAGE_KEY = 'pft-data-v1';

const CATEGORIES = [
  { id: 'cash',        label: 'Cash',        cssVar: '--cat-cash' },
  { id: 'investments', label: 'Investments', cssVar: '--cat-invest' },
  { id: 'retirement',  label: 'Retirement',  cssVar: '--cat-retire' },
  { id: 'realestate',  label: 'Real estate', cssVar: '--cat-realestate' },
  { id: 'crypto',      label: 'Crypto',      cssVar: '--cat-crypto' },
  { id: 'other',       label: 'Other',       cssVar: '--cat-other' },
];
const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

let state = { assets: [], goals: [], history: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.assets)) state = normalize(data);
    }
  } catch (e) { /* corrupted storage — start fresh */ }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalize(data) {
  return {
    assets: (data.assets || []).filter(a => a && a.name != null).map(a => ({
      id: a.id || uid(),
      name: String(a.name).slice(0, 60),
      category: CAT_BY_ID[a.category] ? a.category : 'other',
      value: Math.max(0, Number(a.value) || 0),
    })),
    goals: (data.goals || []).filter(g => g && g.name != null).map(g => ({
      id: g.id || uid(),
      name: String(g.name).slice(0, 60),
      target: Math.max(1, Number(g.target) || 1),
      date: g.date,
      cats: g.cats === 'all' ? 'all' : (Array.isArray(g.cats) ? g.cats.filter(c => CAT_BY_ID[c]) : 'all'),
      createdAt: g.createdAt || isoToday(),
      baseline: Math.max(0, Number(g.baseline) || 0),
    })),
    history: (data.history || [])
      .filter(h => h && h.d && isFinite(h.v))
      .map(h => ({ d: h.d, v: Number(h.v) }))
      .sort((a, b) => a.d.localeCompare(b.d)),
  };
}

function uid() { return Math.random().toString(36).slice(2, 10); }
function isoToday() { return new Date().toISOString().slice(0, 10); }

function totalAssets() {
  return state.assets.reduce((s, a) => s + a.value, 0);
}

function sumForCats(cats) {
  if (cats === 'all') return totalAssets();
  return state.assets.filter(a => cats.includes(a.category)).reduce((s, a) => s + a.value, 0);
}

function recordSnapshot() {
  const d = isoToday();
  const v = totalAssets();
  const i = state.history.findIndex(h => h.d === d);
  if (i >= 0) state.history[i].v = v;
  else state.history.push({ d, v });
  state.history.sort((a, b) => a.d.localeCompare(b.d));
}

/* ================= Goal math ================= */

const DAY = 86400000;

function goalStatus(goal) {
  const current = sumForCats(goal.cats);
  const now = Date.now();
  const start = new Date(goal.createdAt + 'T00:00:00').getTime();
  const end = new Date(goal.date + 'T00:00:00').getTime();

  const pct = Math.min(1, current / goal.target);
  let expected = goal.target;
  if (end > start) {
    const frac = Math.min(1, Math.max(0, (now - start) / (end - start)));
    expected = goal.baseline + (goal.target - goal.baseline) * frac;
  }

  let status;
  if (current >= goal.target) status = 'good';
  else if (end < now) status = 'critical';
  else if (expected <= 0 || current >= expected) status = 'ontrack';
  else if (current / expected >= 0.85) status = 'behind';
  else status = 'critical';

  const monthsLeft = Math.max(0, (end - now) / (DAY * 30.44));
  const monthlyNeeded = monthsLeft > 0 ? Math.max(0, (goal.target - current) / monthsLeft) : 0;

  return { current, pct, expected, status, monthsLeft, monthlyNeeded };
}

const STATUS_META = {
  good:     { icon: '✓', text: 'Achieved',  fill: 'var(--status-good)' },
  ontrack:  { icon: '●', text: 'On track',  fill: 'var(--accent)' },
  behind:   { icon: '▲', text: 'Behind',    fill: 'var(--status-warning)' },
  critical: { icon: '✕', text: 'Off track', fill: 'var(--status-critical)' },
};

/* ================= Formatting ================= */

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function fmt$(n) { return fmtUSD.format(Math.round(n)); }

function fmtCompact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return '$' + trimZero((n / 1e6).toFixed(1)) + 'M';
  if (abs >= 1e3) return '$' + trimZero((n / 1e3).toFixed(1)) + 'K';
  return fmt$(n);
}
function trimZero(s) { return s.replace(/\.0$/, ''); }

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMonth(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(' ', " '");
}

/* ================= DOM helpers ================= */

const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const tooltip = $('#tooltip');
function showTooltip(x, y, build) {
  tooltip.replaceChildren();
  build(tooltip);
  tooltip.hidden = false;
  const r = tooltip.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 10;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 14;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}
function hideTooltip() { tooltip.hidden = true; }

/* ================= Rendering ================= */

function render() {
  const hasData = state.assets.length > 0 || state.goals.length > 0;
  $('#empty-state').hidden = hasData;
  $('#dashboard').hidden = !hasData;
  if (!hasData) return;
  renderKPIs();
  renderTrend();
  renderAllocation();
  renderGoals();
  renderAssets();
}

function renderKPIs() {
  const total = totalAssets();
  $('#hero-networth').textContent = fmt$(total);

  // 30-day delta from history
  const deltaHost = $('#hero-delta');
  deltaHost.replaceChildren();
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const past = [...state.history].reverse().find(h => h.d <= cutoff);
  if (past) {
    const diff = total - past.v;
    const pct = past.v > 0 ? (diff / past.v) * 100 : 0;
    const span = el('span', { class: diff >= 0 ? 'up' : 'down' },
      `${diff >= 0 ? '↑' : '↓'} ${fmt$(Math.abs(diff))} (${Math.abs(pct).toFixed(1)}%)`);
    deltaHost.append(span, ' vs 30 days ago');
  } else {
    deltaHost.textContent = 'Update asset values over time to see your trend';
  }

  $('#tile-asset-count').textContent = String(state.assets.length);
  const catCount = new Set(state.assets.map(a => a.category)).size;
  $('#tile-asset-cats').textContent = `across ${catCount} ${catCount === 1 ? 'category' : 'categories'}`;

  const statuses = state.goals.map(goalStatus);
  const onTrack = statuses.filter(s => s.status === 'ontrack' || s.status === 'good').length;
  $('#tile-goals-ontrack').textContent = state.goals.length ? `${onTrack} / ${state.goals.length}` : '—';
  $('#tile-goals-sub').textContent = state.goals.length ? 'on track or achieved' : 'no goals yet';

  const largest = [...state.assets].sort((a, b) => b.value - a.value)[0];
  $('#tile-largest').textContent = largest ? fmtCompact(largest.value) : '—';
  $('#tile-largest-sub').textContent = largest ? largest.name : '';
}

/* ----- Net worth trend (SVG line) ----- */

function renderTrend() {
  const host = $('#trend-chart');
  host.replaceChildren();
  const data = state.history;

  const tbody = $('#trend-table tbody');
  tbody.replaceChildren(...data.map(h =>
    el('tr', {}, el('td', {}, fmtDate(h.d)), el('td', { class: 'num' }, fmt$(h.v)))));

  if (data.length < 2) {
    host.append(el('div', { class: 'chart-note' },
      'Your history starts now — each time you add or update an asset, a snapshot is recorded here.'));
    return;
  }

  const width = Math.max(320, host.clientWidth || 600);
  const height = 240;
  const pad = { l: 56, r: 78, t: 14, b: 26 };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;

  const xs = data.map(h => new Date(h.d + 'T00:00:00').getTime());
  const ys = data.map(h => h.v);
  const xMin = xs[0], xMax = xs[xs.length - 1];
  const [yMin, yMax, yTicks] = niceDomain(Math.min(...ys), Math.max(...ys));

  const X = t => pad.l + ((t - xMin) / (xMax - xMin || 1)) * pw;
  const Y = v => pad.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

  const svg = svgEl('svg', { width, height, role: 'img', 'aria-label': 'Net worth over time line chart' });

  // gridlines + y tick labels (hairline, solid, recessive)
  for (const tv of yTicks) {
    svg.append(svgEl('line', {
      x1: pad.l, x2: pad.l + pw, y1: Y(tv), y2: Y(tv),
      stroke: 'var(--grid)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: pad.l - 8, y: Y(tv) + 4, 'text-anchor': 'end',
      fill: 'var(--muted)', 'font-size': 11.5, style: 'font-variant-numeric: tabular-nums',
    });
    lbl.textContent = fmtCompact(tv);
    svg.append(lbl);
  }

  // x tick labels (~4)
  const tickCount = Math.min(4, data.length);
  for (let i = 0; i < tickCount; i++) {
    const idx = Math.round((i / (tickCount - 1 || 1)) * (data.length - 1));
    const lbl = svgEl('text', {
      x: X(xs[idx]), y: height - 8, 'text-anchor': i === 0 ? 'start' : (i === tickCount - 1 ? 'end' : 'middle'),
      fill: 'var(--muted)', 'font-size': 11.5,
    });
    lbl.textContent = fmtMonth(data[idx].d);
    svg.append(lbl);
  }

  // baseline
  svg.append(svgEl('line', {
    x1: pad.l, x2: pad.l + pw, y1: pad.t + ph, y2: pad.t + ph,
    stroke: 'var(--baseline)', 'stroke-width': 1,
  }));

  // area wash + 2px line
  const pts = data.map((h, i) => `${X(xs[i]).toFixed(1)},${Y(ys[i]).toFixed(1)}`);
  svg.append(svgEl('path', {
    d: `M${pts.join('L')}L${X(xMax).toFixed(1)},${pad.t + ph}L${X(xMin).toFixed(1)},${pad.t + ph}Z`,
    fill: 'var(--accent)', opacity: 0.1,
  }));
  svg.append(svgEl('path', {
    d: `M${pts.join('L')}`,
    fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  // end marker (8px dot with 2px surface ring) + direct end label
  const lx = X(xMax), ly = Y(ys[ys.length - 1]);
  svg.append(svgEl('circle', { cx: lx, cy: ly, r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 }));
  const endLbl = svgEl('text', {
    x: lx + 8, y: ly + 4, fill: 'var(--ink)', 'font-size': 12, 'font-weight': 600,
  });
  endLbl.textContent = fmtCompact(ys[ys.length - 1]);
  svg.append(endLbl);

  // crosshair hover layer
  const hair = svgEl('line', { y1: pad.t, y2: pad.t + ph, stroke: 'var(--baseline)', 'stroke-width': 1, visibility: 'hidden' });
  const dot = svgEl('circle', { r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' });
  svg.append(hair, dot);

  const overlay = svgEl('rect', {
    x: pad.l, y: pad.t, width: pw, height: ph, fill: 'transparent',
    tabindex: 0, 'aria-label': 'Chart values; use arrow keys to step through dates',
  });
  let focusIdx = data.length - 1;

  function nearestIndex(px) {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(X(xs[i]) - px);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function showAt(i, clientX, clientY) {
    const cx = X(xs[i]), cy = Y(ys[i]);
    hair.setAttribute('x1', cx); hair.setAttribute('x2', cx);
    hair.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
    dot.setAttribute('visibility', 'visible');
    showTooltip(clientX, clientY, tt => {
      tt.append(el('div', { class: 'tt-title' }, fmtDate(data[i].d)));
      tt.append(el('div', { class: 'tt-row' },
        el('span', { class: 'tt-key', style: 'background: var(--accent)' }),
        el('span', { class: 'tt-value' }, fmt$(data[i].v)),
        el('span', { class: 'tt-label' }, 'net worth')));
    });
  }
  function hideHover() {
    hair.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
    hideTooltip();
  }

  overlay.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect();
    showAt(nearestIndex(e.clientX - r.left), e.clientX, e.clientY);
  });
  overlay.addEventListener('pointerleave', hideHover);
  overlay.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') focusIdx = Math.max(0, focusIdx - 1);
    else if (e.key === 'ArrowRight') focusIdx = Math.min(data.length - 1, focusIdx + 1);
    else return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    showAt(focusIdx, r.left + X(xs[focusIdx]), r.top + Y(ys[focusIdx]));
  });
  overlay.addEventListener('blur', hideHover);
  svg.append(overlay);

  host.append(svg);
}

function niceDomain(min, max) {
  if (min === max) { min = min * 0.95; max = max * 1.05 || 1; }
  const span = max - min;
  const step = niceStep(span / 4);
  const lo = Math.floor((min - span * 0.06) / step) * step;
  const hi = Math.ceil((max + span * 0.06) / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return [lo, hi, ticks];
}
function niceStep(raw) {
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * mag;
}

/* ----- Allocation (single horizontal stacked bar) ----- */

function renderAllocation() {
  const host = $('#alloc-chart');
  const legend = $('#alloc-legend');
  host.replaceChildren();
  legend.replaceChildren();

  const total = totalAssets();
  if (total <= 0) {
    host.append(el('div', { class: 'chart-note' }, 'Add assets to see your allocation.'));
    return;
  }

  const byCat = CATEGORIES
    .map(c => ({ cat: c, value: sumForCats([c.id]) }))
    .filter(x => x.value > 0);

  const bar = el('div', { class: 'alloc-bar', role: 'img', 'aria-label': 'Asset allocation by category' });
  for (const { cat, value } of byCat) {
    const pct = (value / total) * 100;
    const seg = el('div', {
      class: 'alloc-seg',
      style: `flex-grow: ${value}; background: var(${cat.cssVar})`,
      onpointermove: e => showTooltip(e.clientX, e.clientY, tt => {
        tt.append(el('div', { class: 'tt-title' }, cat.label));
        tt.append(el('div', { class: 'tt-row' },
          el('span', { class: 'tt-key', style: `background: var(${cat.cssVar})` }),
          el('span', { class: 'tt-value' }, fmt$(value)),
          el('span', { class: 'tt-label' }, pct.toFixed(1) + '%')));
      }),
      onpointerleave: hideTooltip,
    });
    bar.append(seg);
  }
  host.append(bar);

  for (const { cat, value } of byCat) {
    legend.append(el('div', { class: 'legend-row', role: 'listitem' },
      el('span', { class: 'legend-swatch', style: `background: var(${cat.cssVar})` }),
      el('span', { class: 'legend-name' }, cat.label),
      el('span', { class: 'legend-value' }, fmt$(value)),
      el('span', { class: 'legend-pct' }, ((value / total) * 100).toFixed(1) + '%')));
  }
}

/* ----- Goals ----- */

function renderGoals() {
  const list = $('#goals-list');
  list.replaceChildren();

  if (state.goals.length === 0) {
    list.append(el('div', { class: 'chart-note' },
      'No goals yet. Add one — an emergency fund, a down payment, retirement — and link it to your asset categories.'));
    return;
  }

  for (const goal of state.goals) {
    const s = goalStatus(goal);
    const meta = STATUS_META[s.status];
    const pctLabel = Math.min(100, (s.current / goal.target) * 100);

    const meter = el('div', { class: 'meter', style: `background: color-mix(in srgb, ${meta.fill} 22%, var(--surface))` },
      el('div', { class: 'meter-fill', style: `width: ${Math.min(100, s.pct * 100)}%; background: ${meta.fill}` }));
    if (s.status !== 'good' && s.expected < goal.target) {
      const exPct = Math.min(100, (s.expected / goal.target) * 100);
      meter.append(el('div', {
        class: 'meter-expected',
        style: `left: ${exPct}%`,
        title: `Expected by now: ${fmt$(s.expected)}`,
      }));
    }

    const catNames = goal.cats === 'all'
      ? 'All categories'
      : goal.cats.map(c => CAT_BY_ID[c].label).join(', ');

    const metaRight = s.status === 'good'
      ? 'Goal reached — nice work'
      : s.monthsLeft > 0
        ? `${fmt$(s.monthlyNeeded)}/mo needed · by ${fmtDate(goal.date)}`
        : `Target date passed (${fmtDate(goal.date)})`;

    list.append(el('div', { class: 'goal-card' },
      el('div', { class: 'goal-top' },
        el('span', { class: 'goal-name' }, goal.name),
        el('span', { class: `goal-status ${s.status}` },
          el('span', { class: 'icon', 'aria-hidden': 'true' }, meta.icon), meta.text)),
      el('div', { class: 'goal-amounts' },
        el('strong', {}, fmt$(s.current)), ` of ${fmt$(goal.target)} (${pctLabel.toFixed(0)}%)`),
      meter,
      el('div', { class: 'goal-meta' },
        el('span', {}, catNames),
        el('span', {}, metaRight)),
      el('div', { class: 'goal-actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openGoalDialog(goal) }, 'Edit'),
        el('button', { class: 'btn small danger-text', type: 'button', onclick: () => deleteGoal(goal.id) }, 'Delete'))));
  }
}

/* ----- Assets table ----- */

function renderAssets() {
  const tbody = $('#assets-table tbody');
  tbody.replaceChildren();
  const total = totalAssets();

  const sorted = [...state.assets].sort((a, b) => b.value - a.value);
  for (const asset of sorted) {
    const cat = CAT_BY_ID[asset.category];
    tbody.append(el('tr', {},
      el('td', {}, asset.name),
      el('td', {}, el('span', { class: 'cat-chip' },
        el('span', { class: 'cat-dot', style: `background: var(${cat.cssVar})` }), cat.label)),
      el('td', { class: 'num' }, fmt$(asset.value)),
      el('td', { class: 'num' }, total > 0 ? ((asset.value / total) * 100).toFixed(1) + '%' : '—'),
      el('td', { class: 'actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openAssetDialog(asset) }, 'Edit'),
        ' ',
        el('button', { class: 'btn small danger-text', type: 'button', onclick: () => deleteAsset(asset.id) }, 'Delete'))));
  }

  if (sorted.length === 0) {
    tbody.append(el('tr', {}, el('td', { colspan: 5, style: 'color: var(--muted)' }, 'No assets yet.')));
  }
}

/* ================= Dialogs & mutations ================= */

const assetDialog = $('#asset-dialog');
const assetForm = $('#asset-form');
let editingAssetId = null;

function openAssetDialog(asset) {
  editingAssetId = asset ? asset.id : null;
  $('#asset-dialog-title').textContent = asset ? 'Edit asset' : 'Add asset';
  assetForm.elements.name.value = asset ? asset.name : '';
  assetForm.elements.category.value = asset ? asset.category : 'cash';
  assetForm.elements.value.value = asset ? asset.value : '';
  assetDialog.showModal();
}

assetForm.addEventListener('submit', () => {
  const name = assetForm.elements.name.value.trim();
  const category = assetForm.elements.category.value;
  const value = Math.max(0, Number(assetForm.elements.value.value) || 0);
  if (!name) return;
  if (editingAssetId) {
    const a = state.assets.find(x => x.id === editingAssetId);
    if (a) { a.name = name; a.category = category; a.value = value; }
  } else {
    state.assets.push({ id: uid(), name, category, value });
  }
  recordSnapshot();
  save();
  render();
});

function deleteAsset(id) {
  const a = state.assets.find(x => x.id === id);
  if (!a || !confirm(`Delete "${a.name}"?`)) return;
  state.assets = state.assets.filter(x => x.id !== id);
  recordSnapshot();
  save();
  render();
}

const goalDialog = $('#goal-dialog');
const goalForm = $('#goal-form');
let editingGoalId = null;

function openGoalDialog(goal) {
  editingGoalId = goal ? goal.id : null;
  $('#goal-dialog-title').textContent = goal ? 'Edit goal' : 'Add goal';
  goalForm.elements.name.value = goal ? goal.name : '';
  goalForm.elements.target.value = goal ? goal.target : '';
  goalForm.elements.date.value = goal ? goal.date : '';
  const all = !goal || goal.cats === 'all';
  goalForm.elements['all-cats'].checked = all;
  for (const cb of goalForm.querySelectorAll('#goal-cats input')) {
    cb.checked = !all && goal.cats.includes(cb.value);
    cb.disabled = all;
  }
  goalDialog.showModal();
}

goalForm.elements['all-cats'].addEventListener('change', e => {
  for (const cb of goalForm.querySelectorAll('#goal-cats input')) cb.disabled = e.target.checked;
});

goalForm.addEventListener('submit', e => {
  const name = goalForm.elements.name.value.trim();
  const target = Math.max(1, Number(goalForm.elements.target.value) || 0);
  const date = goalForm.elements.date.value;
  const all = goalForm.elements['all-cats'].checked;
  const picked = [...goalForm.querySelectorAll('#goal-cats input:checked')].map(cb => cb.value);
  if (!name || !date) return;
  const cats = all || picked.length === 0 ? 'all' : picked;

  if (editingGoalId) {
    const g = state.goals.find(x => x.id === editingGoalId);
    if (g) { g.name = name; g.target = target; g.date = date; g.cats = cats; }
  } else {
    state.goals.push({
      id: uid(), name, target, date, cats,
      createdAt: isoToday(),
      baseline: sumForCats(cats),
    });
  }
  save();
  render();
});

function deleteGoal(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g || !confirm(`Delete goal "${g.name}"?`)) return;
  state.goals = state.goals.filter(x => x.id !== id);
  save();
  render();
}

for (const btn of document.querySelectorAll('dialog [data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

/* ================= Export / import / sample ================= */

$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `finance-tracker-${isoToday()}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#btn-import').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.assets)) throw new Error('bad shape');
    if (!confirm('Importing replaces your current data. Continue?')) return;
    state = normalize(data);
    save();
    render();
  } catch (err) {
    alert('Could not import that file — it does not look like a tracker export.');
  } finally {
    e.target.value = '';
  }
});

function loadSampleData() {
  const today = new Date();
  const assets = [
    { id: uid(), name: 'Checking account',      category: 'cash',        value: 4800 },
    { id: uid(), name: 'High-yield savings',    category: 'cash',        value: 18500 },
    { id: uid(), name: 'Vanguard index funds',  category: 'investments', value: 62300 },
    { id: uid(), name: '401(k)',                category: 'retirement',  value: 88400 },
    { id: uid(), name: 'Roth IRA',              category: 'retirement',  value: 21700 },
    { id: uid(), name: 'Home equity',           category: 'realestate',  value: 115000 },
    { id: uid(), name: 'Bitcoin',               category: 'crypto',      value: 6900 },
  ];
  const total = assets.reduce((s, a) => s + a.value, 0);

  // walk backward from today's total, ~0.9%/mo growth with noise
  const history = [];
  let v = total;
  for (let i = 0; i < 18; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, Math.min(today.getDate(), 28));
    history.push({ d: d.toISOString().slice(0, 10), v: Math.round(v) });
    v = v / (1 + 0.009 + (Math.random() - 0.5) * 0.02);
  }
  history.reverse();

  const iso = (monthsFromNow, day = 1) =>
    new Date(today.getFullYear(), today.getMonth() + monthsFromNow, day).toISOString().slice(0, 10);

  const goals = [
    { id: uid(), name: 'Emergency fund',     target: 30000,   date: iso(3),  cats: ['cash'],
      createdAt: iso(-12), baseline: 10000 },
    { id: uid(), name: 'House down payment', target: 120000,  date: iso(24), cats: ['cash', 'investments'],
      createdAt: iso(-12), baseline: 60000 },
    { id: uid(), name: 'Retirement',         target: 1500000, date: iso(288), cats: ['retirement', 'investments'],
      createdAt: iso(-24), baseline: 95000 },
  ];

  state = { assets, goals, history };
  save();
  render();
}

$('#btn-sample').addEventListener('click', loadSampleData);
$('#btn-first-asset').addEventListener('click', () => openAssetDialog(null));
$('#btn-add-asset').addEventListener('click', () => openAssetDialog(null));
$('#btn-add-goal').addEventListener('click', () => openGoalDialog(null));

/* ================= Theme ================= */

$('#btn-theme').addEventListener('click', () => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = root.dataset.theme || (prefersDark ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('pft-theme', next);
});

/* ================= Init ================= */

// populate category selects/checkboxes
const catSelect = assetForm.elements.category;
for (const c of CATEGORIES) catSelect.append(el('option', { value: c.id }, c.label));
const catChecks = $('#goal-cats');
for (const c of CATEGORIES) {
  catChecks.append(el('label', { class: 'check' },
    el('input', { type: 'checkbox', value: c.id }), c.label));
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (!$('#dashboard').hidden) renderTrend(); }, 150);
});

load();
render();
