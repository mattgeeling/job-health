let cashflowMonths = {};
let cashflowLines = [];
let cashflowRange = '3';
let cashflowSource = 'all';
let cashflowSearchTerm = '';

function matchesSearch(l, q) {
  return (l.job_number !== null && String(l.job_number).toLowerCase().includes(q)) ||
    (l.title && l.title.toLowerCase().includes(q)) ||
    (l.client_name && l.client_name.toLowerCase().includes(q));
}

function renderSearchResults() {
  const section = document.getElementById('cashflowSearchResultsSection');
  const container = document.getElementById('cashflowSearchResults');

  if (!cashflowSearchTerm) {
    section.hidden = true;
    container.innerHTML = '';
    return;
  }

  const q = cashflowSearchTerm.toLowerCase();
  const jobLines = cashflowLines.filter(l => (l.source === 'live' || l.source === 'pipeline') && matchesSearch(l, q));
  const byJob = new Map();
  for (const l of jobLines) {
    if (!byJob.has(l.job_number)) byJob.set(l.job_number, { ...l, totalValue: 0 });
    byJob.get(l.job_number).totalValue += Number(l.planned_value || 0);
  }

  section.hidden = false;

  if (byJob.size === 0) {
    container.innerHTML = '<p class="chart-note">No projects match that search.</p>';
    return;
  }

  container.innerHTML = [...byJob.values()].map(job => {
    const href = job.source === 'live'
      ? `job.html?job=${encodeURIComponent(job.job_number)}`
      : `opportunity.html?job=${encodeURIComponent(job.job_number)}`;
    const actuals = cashflowJobActuals[job.job_number];
    const spendInfo = job.source === 'live' && actuals
      ? ` &middot; Actual spend to date: ${money(actuals.actual_cost)}`
      : '';
    return `
      <a class="cashflow-search-result" href="${href}">
        <span class="cashflow-search-result-title">${escapeHtml(job.job_number)} — ${escapeHtml(job.title || '')}</span>
        <span class="cashflow-search-result-meta">${escapeHtml(job.client_name || '')} &middot; Billing plan total: ${money(job.totalValue)}${spendInfo}</span>
      </a>
    `;
  }).join('');
}

function money(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  const sign = n < 0 ? '-' : '';
  return sign + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let cashflowJobActuals = {};
let cashflowJobNotes = {};

async function loadCashflowJobNotes() {
  const res = await fetch('api/cashflow_job_notes.php');
  const { notes } = await res.json();
  cashflowJobNotes = notes || {};
}

async function loadCashflow() {
  const res = await fetch('api/cashflow.php');
  const { lines, job_actuals } = await res.json();
  cashflowLines = lines;
  cashflowJobActuals = job_actuals || {};
  renderChart(cashflowLines);
  renderSearchResults();
}

// The books for a month stay open for about a week into the next one, so
// don't drop last month from the chart the instant the calendar flips —
// keep showing it until the first Monday of the new month.
function getEffectiveCurrentMonth() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const dowOfFirst = new Date(y, m, 1).getDay();
  const firstMondayDate = 1 + ((8 - dowOfFirst) % 7);

  const effective = d < firstMondayDate ? new Date(y, m - 1, 1) : new Date(y, m, 1);
  return `${effective.getFullYear()}-${String(effective.getMonth() + 1).padStart(2, '0')}`;
}

function renderChart(lines) {
  const byMonth = {};
  const contributorsByMonth = {};
  const currentMonth = getEffectiveCurrentMonth();

  for (const line of lines) {
    if (!line.billing_date) continue;
    if (cashflowSource === 'live' && line.source === 'pipeline') continue;
    const month = line.billing_date.slice(0, 7);
    if (month < currentMonth) continue;

    const confidence = line.source === 'pipeline'
      ? (line.weighting === null ? 0.5 : Number(line.weighting) / 100)
      : 1;
    // Gross profit — revenue minus cost — is the figure that actually
    // matters here (matches how this is tracked on the studio's own
    // spreadsheet), not raw billed value. If the job's own Billing Plan page
    // has set a Job list GP for this month, that already encodes any
    // deferred/released revenue decision — use it instead of the raw
    // billing-minus-cost figure so this chart stays in sync automatically.
    const gpBase = (line.gp_override !== null && line.gp_override !== undefined)
      ? Number(line.gp_override)
      : (Number(line.planned_value || 0) - Number(line.planned_cost || 0));
    const gp = gpBase * confidence;
    const manualBucket = { release: 'released', defer: 'deferred', cost: 'cost', invoice: 'invoiced' };
    const bucket = line.source === 'manual' ? (manualBucket[line.type] || 'released') : line.source;

    if (!byMonth[month]) byMonth[month] = { live: 0, pipeline: 0, released: 0, deferred: 0, cost: 0, invoiced: 0 };
    byMonth[month][bucket] += gp;

    if (!contributorsByMonth[month]) contributorsByMonth[month] = [];
    contributorsByMonth[month].push({
      job: line.job_number,
      title: line.title,
      source: bucket,
      cost: Number(line.planned_cost || 0) * confidence,
      value: gp,
    });
  }

  const allMonths = Object.keys(byMonth).sort();
  const months = cashflowRange === 'all' ? allMonths : allMonths.slice(0, Number(cashflowRange));
  const legendEl = document.getElementById('cashflowLegend');
  const axisEl = document.getElementById('cashflowAxis');
  const gridEl = document.getElementById('cashflowGridlines');
  const chartEl = document.getElementById('cashflowChart');
  const detailEl = document.getElementById('cashflowDetail');
  detailEl.innerHTML = '';

  legendEl.innerHTML = `
    <span class="forecast-legend-item"><span class="forecast-swatch" style="background:#2f7a4f"></span>Live jobs (committed)</span>
    <span class="forecast-legend-item"><span class="forecast-swatch" style="background:rgba(242,196,0,0.6)"></span>Pipeline (weighted)</span>
    <span class="forecast-legend-item"><span class="forecast-swatch" style="background:#3f6fa8"></span>Released (manual)</span>
    <span class="forecast-legend-item"><span class="forecast-swatch" style="background:#7a4fa8"></span>Invoiced (manual)</span>
  `;

  if (months.length === 0) {
    axisEl.innerHTML = '';
    gridEl.innerHTML = '';
    chartEl.innerHTML = '<p class="chart-note">No billing plan data to forecast from yet.</p>';
    return;
  }

  const maxValue = Math.max(...months.map(m => Math.max(byMonth[m].live, byMonth[m].pipeline, byMonth[m].released, byMonth[m].invoiced)));
  let step = 5000;
  while (maxValue > 0 && Math.ceil(maxValue / step) > 10) step *= 2;
  const axisMax = maxValue > 0 ? Math.ceil(maxValue / step) * step : step;
  const ticks = [];
  for (let v = 0; v <= axisMax; v += step) ticks.push(v);
  const axisLabel = (v) => v >= 1000 ? `£${v / 1000}k` : `£${v}`;

  axisEl.innerHTML = ticks.map(v => `<span class="forecast-axis-label" style="bottom:${(v / axisMax) * 100}%">${axisLabel(v)}</span>`).join('');
  gridEl.innerHTML = ticks.map(v => `<div class="forecast-gridline" style="bottom:${(v / axisMax) * 100}%"></div>`).join('');

  const formatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' });
  cashflowMonths = {};

  chartEl.innerHTML = months.map(m => {
    const { live, pipeline, released, deferred, cost, invoiced } = byMonth[m];
    const label = formatter.format(new Date(`${m}-01T00:00:00`));
    const total = live + pipeline + released + deferred + cost + invoiced;
    cashflowMonths[m] = { label, live, pipeline, released, deferred, cost, invoiced, contributors: contributorsByMonth[m] };
    const heightPct = (v) => v <= 0 ? 0 : (axisMax > 0 ? Math.max((v / axisMax) * 100, 3) : 3);
    return `
      <div class="forecast-bar-col" data-month="${m}" tabindex="0" role="button" aria-label="Show breakdown for ${label}">
        <div class="forecast-bar-group">
          <div class="forecast-bar" style="height:${heightPct(live)}%; background:#2f7a4f;"></div>
          <div class="forecast-bar" style="height:${heightPct(pipeline)}%; background:rgba(242,196,0,0.6);"></div>
          <div class="forecast-bar" style="height:${heightPct(released)}%; background:#3f6fa8;"></div>
          <div class="forecast-bar" style="height:${heightPct(invoiced)}%; background:#7a4fa8;"></div>
        </div>
        <span class="forecast-bar-label">${label}</span>
        <span class="forecast-bar-value" style="color:#2f7a4f;">Live: ${money(live)}</span>
        <span class="forecast-bar-value" style="color:#8a6d00;">Pipeline: ${money(pipeline)}</span>
        <span class="forecast-bar-value" style="color:#3f6fa8;">Released: ${money(released)}</span>
        <span class="forecast-bar-value" style="color:#7a4fa8;">Invoiced: ${money(invoiced)}</span>
        <span class="forecast-bar-value negative">Costs: ${money(cost)}</span>
        <span class="cashflow-total-divider"></span>
        <span class="forecast-bar-value cashflow-total-value">Total: ${money(total)}</span>
      </div>
    `;
  }).join('');

  initScrollHint();
}

function initScrollHint() {
  const scroller = document.getElementById('cashflowChart');
  const hint = document.getElementById('cashflowScrollHint');
  if (!scroller || !hint) return;

  const update = () => {
    const hasOverflow = scroller.scrollWidth > scroller.clientWidth + 1;
    const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1;
    hint.classList.toggle('forecast-scroll-hint-visible', hasOverflow && !atEnd);
  };

  scroller.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  hint.addEventListener('click', (e) => {
    e.stopPropagation();
    scroller.scrollBy({ left: 160, behavior: 'smooth' });
  });
  update();
}

let cashflowDetailMonth = null;
let cashflowDetailScope = 'both';

function showDetail(month) {
  const chartEl = document.getElementById('cashflowChart');
  const detailEl = document.getElementById('cashflowDetail');

  if (month !== undefined) cashflowDetailMonth = month;
  const data = cashflowMonths[cashflowDetailMonth];

  chartEl.querySelectorAll('.forecast-bar-col').forEach(col => {
    col.classList.toggle('forecast-bar-col-active', col.dataset.month === cashflowDetailMonth);
  });

  if (!data) {
    detailEl.innerHTML = '';
    return;
  }

  const contributors = cashflowDetailScope === 'live'
    ? data.contributors.filter(c => c.source !== 'pipeline')
    : data.contributors;
  const total = cashflowDetailScope === 'live'
    ? data.live + data.released + data.deferred + data.cost + data.invoiced
    : data.live + data.pipeline + data.released + data.deferred + data.cost + data.invoiced;

  const sourcePill = {
    live: '<span class="pct-chip green">Live</span>',
    pipeline: '<span class="pct-chip amber">Pipeline</span>',
    released: '<span class="pct-chip green">Released</span>',
    deferred: '<span class="pct-chip red">Deferred</span>',
    cost: '<span class="pct-chip red">Cost</span>',
    invoiced: '<span class="pct-chip green">Invoiced</span>',
  };
  const isManualSource = (s) => s === 'released' || s === 'deferred' || s === 'cost' || s === 'invoiced';
  const rowClass = { released: 'cashflow-row-released', deferred: 'cashflow-row-deferred', cost: 'cashflow-row-deferred', invoiced: 'cashflow-row-released' };
  const labelFor = (c) => (isManualSource(c.source) ? c.title : `${c.job} ${c.title}`) || '';
  // Sort by the studio's own job code (the first word of the title, e.g.
  // "5813" or "ELEV174") rather than Synergist's own job number, which is
  // meaningless for alphabetical ordering since almost all of them share
  // the same "1/000..." prefix.
  const sortKeyFor = (c) => (c.title || '').toLowerCase();
  const bottomSources = ['cost', 'released', 'deferred'];
  const sortedContributors = [...contributors].sort((a, b) => {
    const aBottom = bottomSources.includes(a.source) ? 1 : 0;
    const bBottom = bottomSources.includes(b.source) ? 1 : 0;
    if (aBottom !== bBottom) return aBottom - bBottom;
    return sortKeyFor(a).localeCompare(sortKeyFor(b));
  });
  const totalCost = contributors.reduce((sum, c) => sum + (c.cost || 0), 0);
  const isRealJob = (s) => s === 'live' || s === 'pipeline';
  const rows = sortedContributors
    .map(c => `
      <tr class="${rowClass[c.source] || ''}">
        <td>${escapeHtml(labelFor(c))}</td>
        <td>${sourcePill[c.source] || c.source}</td>
        <td>${c.cost ? money(c.cost) : '—'}</td>
        <td>${money(c.value)}</td>
        <td>${isRealJob(c.source)
          ? `<input type="text" class="cashflow-job-note-input" data-job="${escapeHtml(c.job)}" value="${escapeHtml(cashflowJobNotes[c.job] || '')}" placeholder="Add a note…">`
          : ''}</td>
      </tr>
    `)
    .join('');

  detailEl.innerHTML = `
    <div class="cashflow-detail-header">
      <h3 class="forecast-detail-title">${data.label}</h3>
      <div class="cashflow-range-toggle" id="cashflowDetailScopeToggle">
        <button type="button" class="cashflow-range-btn ${cashflowDetailScope === 'live' ? 'cashflow-range-btn-active' : ''}" data-scope="live">Live</button>
        <button type="button" class="cashflow-range-btn ${cashflowDetailScope === 'both' ? 'cashflow-range-btn-active' : ''}" data-scope="both">Live + Proposed</button>
      </div>
    </div>
    <table class="forecast-detail-table">
      <thead><tr><th>Job</th><th>Source</th><th>Costs</th><th>GP</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Total</td><td></td><td>${money(totalCost)}</td><td>${money(total)}</td><td></td></tr>
      </tfoot>
    </table>
  `;
}

function initDetailClicks() {
  const chartEl = document.getElementById('cashflowChart');
  chartEl.addEventListener('click', (e) => {
    const col = e.target.closest('.forecast-bar-col');
    if (!col) return;
    const isActive = col.classList.contains('forecast-bar-col-active');
    showDetail(isActive ? null : col.dataset.month);
  });
  chartEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const col = e.target.closest('.forecast-bar-col');
    if (!col) return;
    e.preventDefault();
    const isActive = col.classList.contains('forecast-bar-col-active');
    showDetail(isActive ? null : col.dataset.month);
  });

  document.getElementById('cashflowDetail').addEventListener('click', (e) => {
    const btn = e.target.closest('#cashflowDetailScopeToggle .cashflow-range-btn');
    if (!btn) return;
    cashflowDetailScope = btn.dataset.scope;
    showDetail(cashflowDetailMonth);
  });

  document.getElementById('cashflowDetail').addEventListener('change', async (e) => {
    const input = e.target.closest('.cashflow-job-note-input');
    if (!input) return;
    const jobNumber = input.dataset.job;
    const note = input.value;
    cashflowJobNotes[jobNumber] = note;
    await fetch('api/cashflow_job_notes.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_number: jobNumber, note }),
    });
  });
}

let manualLinesById = {};

function gp(l) {
  return Number(l.value || 0) - Number(l.cost || 0);
}

async function loadManualEntries() {
  const res = await fetch('api/manual_billing_lines.php');
  const { lines } = await res.json();
  renderManualEntryGroups(lines);
}

function renderManualEntryGroups(lines) {
  const container = document.getElementById('manualEntryGroups');

  if (lines.length === 0) {
    container.innerHTML = '<p class="chart-note">No manual entries yet.</p>';
    return;
  }

  const byMonth = {};
  for (const l of lines) {
    const month = l.billing_date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(l);
  }

  const months = Object.keys(byMonth).sort();
  const formatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

  container.innerHTML = months.map(month => {
    const entries = byMonth[month];
    const released = entries.filter(l => l.type === 'release').reduce((sum, l) => sum + gp(l), 0);
    const deferred = entries.filter(l => l.type === 'defer').reduce((sum, l) => sum + gp(l), 0);
    const costTotal = entries.filter(l => l.type === 'cost').reduce((sum, l) => sum + gp(l), 0);
    const invoicedTotal = entries.filter(l => l.type === 'invoice').reduce((sum, l) => sum + gp(l), 0);
    const label = formatter.format(new Date(`${month}-01T00:00:00`));
    const typeTag = {
      defer: '<span class="pct-chip red">Deferred</span>',
      cost: '<span class="pct-chip red">Cost</span>',
      invoice: '<span class="pct-chip green">Invoiced</span>',
    };
    const rows = entries.map(l => {
      manualLinesById[l.id] = l;
      const isNegative = l.type === 'defer' || l.type === 'cost';
      return `
      <tr data-row-for="${l.id}">
        <td>${escapeHtml(l.description)} ${typeTag[l.type] || ''}</td>
        <td>${l.billing_date}</td>
        <td>${money(l.value)}</td>
        <td>${money(l.cost)}</td>
        <td class="${isNegative ? 'negative' : ''}">${money(gp(l))}</td>
        <td>
          <button type="button" class="manual-entry-edit" data-id="${l.id}">Edit</button>
          <button type="button" class="manual-entry-delete" data-id="${l.id}">Delete</button>
        </td>
      </tr>
    `;
    }).join('');

    return `
      <details class="manual-month-details">
        <summary>${label} <span class="forecast-toggle-hint">Released: ${money(released)} &middot; Deferred: ${money(deferred)} &middot; Costs: ${money(costTotal)} &middot; Invoiced: ${money(invoicedTotal)} &middot; Net: ${money(released + deferred + costTotal + invoicedTotal)}</span></summary>
        <table class="job-table">
          <thead><tr><th>Description</th><th>Date</th><th>Value</th><th>Cost</th><th>GP</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    `;
  }).join('');
}

function initManualEntryForm() {
  const form = document.getElementById('manualEntryForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const description = document.getElementById('manualDescription').value.trim();
    const billingDate = document.getElementById('manualDate').value;
    const type = document.getElementById('manualType').value;
    const rawValue = type === 'cost' ? 0 : Number(document.getElementById('manualValue').value || 0);
    const value = type === 'defer' ? -Math.abs(rawValue) : Math.abs(rawValue);
    const cost = Number(document.getElementById('manualCost').value || 0);

    await fetch('api/manual_billing_lines.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, billing_date: billingDate, value, cost, type }),
    });

    form.reset();
    await loadManualEntries();
    await loadCashflow();
  });

  document.getElementById('manualEntryGroups').addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.manual-entry-delete');
    if (deleteBtn) {
      await fetch('api/manual_billing_line_delete.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(deleteBtn.dataset.id) }),
      });
      await loadManualEntries();
      await loadCashflow();
      return;
    }

    const editBtn = e.target.closest('.manual-entry-edit');
    if (editBtn) {
      const row = editBtn.closest('tr');
      const l = manualLinesById[Number(editBtn.dataset.id)];
      if (row && l) row.outerHTML = renderEditRow(l);
      return;
    }

    const cancelBtn = e.target.closest('.manual-entry-cancel');
    if (cancelBtn) {
      renderManualEntryGroups(Object.values(manualLinesById));
      return;
    }

    const saveBtn = e.target.closest('.manual-entry-save');
    if (saveBtn) {
      const row = saveBtn.closest('tr');
      const id = Number(saveBtn.dataset.id);
      const description = row.querySelector('.manual-edit-description').value.trim();
      const billingDate = row.querySelector('.manual-edit-date').value;
      const type = row.querySelector('.manual-edit-type').value;
      const rawValue = type === 'cost' ? 0 : Number(row.querySelector('.manual-edit-value').value || 0);
      const value = type === 'defer' ? -Math.abs(rawValue) : Math.abs(rawValue);
      const cost = Number(row.querySelector('.manual-edit-cost').value || 0);

      await fetch('api/manual_billing_line_update.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description, billing_date: billingDate, value, cost, type }),
      });

      await loadManualEntries();
      await loadCashflow();
    }
  });
}

function renderEditRow(l) {
  return `
    <tr data-row-for="${l.id}">
      <td><input type="text" class="manual-edit-description" value="${escapeHtml(l.description)}"></td>
      <td><input type="date" class="manual-edit-date" value="${l.billing_date}"></td>
      <td><input type="number" class="manual-edit-value" value="${Math.abs(Number(l.value))}" step="0.01" min="0"></td>
      <td><input type="number" class="manual-edit-cost" value="${Number(l.cost)}" step="0.01" min="0"></td>
      <td>
        <select class="manual-edit-type">
          <option value="release" ${l.type === 'release' ? 'selected' : ''}>Release</option>
          <option value="defer" ${l.type === 'defer' ? 'selected' : ''}>Defer</option>
          <option value="cost" ${l.type === 'cost' ? 'selected' : ''}>Cost only</option>
          <option value="invoice" ${l.type === 'invoice' ? 'selected' : ''}>Invoice amount</option>
        </select>
      </td>
      <td>
        <button type="button" class="manual-entry-save" data-id="${l.id}">Save</button>
        <button type="button" class="manual-entry-cancel" data-id="${l.id}">Cancel</button>
      </td>
    </tr>
  `;
}

function initSyncButton() {
  const btn = document.getElementById('syncBtn');
  const status = document.getElementById('syncStatus');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Syncing…';
    status.textContent = '';
    status.classList.remove('sync-status-error');

    try {
      const res = await fetch('api/refresh.php?target=all', { method: 'POST' });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || 'Sync failed');

      await loadCashflow();
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      status.textContent = `Synced ${result.synced} live jobs and ${result.pipeline_jobs} opportunities at ${now} (took ${result.duration_seconds}s)`;
    } catch (e) {
      status.textContent = `Sync failed: ${e.message || 'try again'}`;
      status.classList.add('sync-status-error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync now';
    }
  });
}

function initRangeToggle() {
  const group = document.getElementById('cashflowRangeToggle');
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.cashflow-range-btn');
    if (!btn) return;
    cashflowRange = btn.dataset.range;
    group.querySelectorAll('.cashflow-range-btn').forEach(b =>
      b.classList.toggle('cashflow-range-btn-active', b === btn)
    );
    renderChart(cashflowLines);
  });
}

function initSourceToggle() {
  const group = document.getElementById('cashflowSourceToggle');
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('.cashflow-range-btn');
    if (!btn) return;
    cashflowSource = btn.dataset.source;
    group.querySelectorAll('.cashflow-range-btn').forEach(b =>
      b.classList.toggle('cashflow-range-btn-active', b === btn)
    );
    renderChart(cashflowLines);
  });
}

function initSearch() {
  document.getElementById('cashflowSearch').addEventListener('input', (e) => {
    cashflowSearchTerm = e.target.value.trim();
    renderSearchResults();
  });
}

async function loadCashflowNotes() {
  const res = await fetch('api/cashflow_notes.php');
  const { content } = await res.json();
  document.getElementById('cashflowNotesInput').value = content || '';
}

function initCashflowNotes() {
  const textarea = document.getElementById('cashflowNotesInput');
  const btn = document.getElementById('cashflowNotesSaveBtn');
  const status = document.getElementById('cashflowNotesStatus');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = 'Saving…';
    try {
      const res = await fetch('api/cashflow_notes.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: textarea.value }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error();
      status.textContent = 'Saved';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (e) {
      status.textContent = 'Failed to save — try again';
    } finally {
      btn.disabled = false;
    }
  });
}

initDetailClicks();
initManualEntryForm();
initRangeToggle();
initSourceToggle();
initSyncButton();
initSearch();
initCashflowNotes();
loadCashflow();
loadManualEntries();
loadCashflowNotes();
loadCashflowJobNotes();
