let cashflowMonths = {};

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

async function loadCashflow() {
  const res = await fetch('api/cashflow.php');
  const { lines } = await res.json();
  renderChart(lines);
}

function renderChart(lines) {
  const byMonth = {};
  const contributorsByMonth = {};
  const currentMonth = new Date().toISOString().slice(0, 7);

  for (const line of lines) {
    if (!line.billing_date) continue;
    const month = line.billing_date.slice(0, 7);
    if (month < currentMonth) continue;

    const confidence = line.source === 'pipeline'
      ? (line.weighting === null ? 0.5 : Number(line.weighting) / 100)
      : 1;
    // Gross profit — revenue minus cost — is the figure that actually
    // matters here (matches how this is tracked on the studio's own
    // spreadsheet), not raw billed value.
    const gp = (Number(line.planned_value || 0) - Number(line.planned_cost || 0)) * confidence;
    const bucket = line.source === 'manual'
      ? (line.type === 'defer' ? 'deferred' : (line.type === 'cost' ? 'cost' : 'released'))
      : line.source;

    if (!byMonth[month]) byMonth[month] = { live: 0, pipeline: 0, released: 0, deferred: 0, cost: 0 };
    byMonth[month][bucket] += gp;

    if (!contributorsByMonth[month]) contributorsByMonth[month] = [];
    contributorsByMonth[month].push({
      job: line.job_number,
      title: line.title,
      source: bucket,
      value: gp,
    });
  }

  const months = Object.keys(byMonth).sort();
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
  `;

  if (months.length === 0) {
    axisEl.innerHTML = '';
    gridEl.innerHTML = '';
    chartEl.innerHTML = '<p class="chart-note">No billing plan data to forecast from yet.</p>';
    return;
  }

  const maxValue = Math.max(...months.map(m => Math.max(byMonth[m].live, byMonth[m].pipeline, byMonth[m].released)));
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
    const { live, pipeline, released, deferred, cost } = byMonth[m];
    const label = formatter.format(new Date(`${m}-01T00:00:00`));
    const total = live + pipeline + released + deferred + cost;
    cashflowMonths[m] = { label, live, pipeline, released, deferred, cost, contributors: contributorsByMonth[m] };
    const heightPct = (v) => v <= 0 ? 0 : (axisMax > 0 ? Math.max((v / axisMax) * 100, 3) : 3);
    return `
      <div class="forecast-bar-col" data-month="${m}" tabindex="0" role="button" aria-label="Show breakdown for ${label}">
        <div class="forecast-bar-group">
          <div class="forecast-bar" style="height:${heightPct(live)}%; background:#2f7a4f;"></div>
          <div class="forecast-bar" style="height:${heightPct(pipeline)}%; background:rgba(242,196,0,0.6);"></div>
          <div class="forecast-bar" style="height:${heightPct(released)}%; background:#3f6fa8;"></div>
        </div>
        <span class="forecast-bar-label">${label}</span>
        <span class="forecast-bar-value" style="color:#2f7a4f;">Live: ${money(live)}</span>
        <span class="forecast-bar-value" style="color:#8a6d00;">Pipeline: ${money(pipeline)}</span>
        <span class="forecast-bar-value" style="color:#3f6fa8;">Released: ${money(released)}</span>
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

function showDetail(month) {
  const chartEl = document.getElementById('cashflowChart');
  const detailEl = document.getElementById('cashflowDetail');
  const data = cashflowMonths[month];

  chartEl.querySelectorAll('.forecast-bar-col').forEach(col => {
    col.classList.toggle('forecast-bar-col-active', col.dataset.month === month);
  });

  if (!data) {
    detailEl.innerHTML = '';
    return;
  }

  const sourcePill = {
    live: '<span class="pct-chip green">Live</span>',
    pipeline: '<span class="pct-chip amber">Pipeline</span>',
    released: '<span class="pct-chip green">Released</span>',
    deferred: '<span class="pct-chip red">Deferred</span>',
    cost: '<span class="pct-chip red">Cost</span>',
  };
  const isManualSource = (s) => s === 'released' || s === 'deferred' || s === 'cost';
  const rowClass = { released: 'cashflow-row-released', deferred: 'cashflow-row-deferred', cost: 'cashflow-row-deferred' };
  const rows = data.contributors
    .map(c => `
      <tr class="${rowClass[c.source] || ''}">
        <td>${isManualSource(c.source) ? escapeHtml(c.title || '') : `${escapeHtml(c.job)} ${escapeHtml(c.title || '')}`}</td>
        <td>${sourcePill[c.source] || c.source}</td>
        <td>${money(c.value)}</td>
      </tr>
    `)
    .join('');

  detailEl.innerHTML = `
    <h3 class="forecast-detail-title">${data.label}</h3>
    <table class="forecast-detail-table">
      <thead><tr><th>Job</th><th>Source</th><th>GP</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Total</td><td></td><td>${money(data.live + data.pipeline + data.released + data.deferred + data.cost)}</td></tr>
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
}

let manualLinesById = {};

function gp(l) {
  return Number(l.value || 0) - Number(l.cost || 0);
}

async function loadManualEntries() {
  const res = await fetch('api/manual_billing_lines.php');
  const { lines } = await res.json();

  const releasedTotal = lines.filter(l => l.type === 'release').reduce((sum, l) => sum + gp(l), 0);
  const deferredTotal = lines.filter(l => l.type === 'defer').reduce((sum, l) => sum + gp(l), 0);
  document.getElementById('releasedTotal').textContent = money(releasedTotal);
  document.getElementById('deferredTotal').textContent = money(deferredTotal);

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
    const label = formatter.format(new Date(`${month}-01T00:00:00`));
    const typeTag = { defer: '<span class="pct-chip red">Deferred</span>', cost: '<span class="pct-chip red">Cost</span>' };
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
        <summary>${label} <span class="forecast-toggle-hint">Released: ${money(released)} &middot; Deferred: ${money(deferred)} &middot; Costs: ${money(costTotal)} &middot; Net: ${money(released + deferred + costTotal)}</span></summary>
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
        </select>
      </td>
      <td>
        <button type="button" class="manual-entry-save" data-id="${l.id}">Save</button>
        <button type="button" class="manual-entry-cancel" data-id="${l.id}">Cancel</button>
      </td>
    </tr>
  `;
}

initDetailClicks();
initManualEntryForm();
loadCashflow();
loadManualEntries();
