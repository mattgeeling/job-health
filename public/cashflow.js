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
    const value = Number(line.planned_value || 0) * confidence;
    const bucket = line.source === 'manual'
      ? (value < 0 ? 'deferred' : 'released')
      : line.source;

    if (!byMonth[month]) byMonth[month] = { live: 0, pipeline: 0, released: 0, deferred: 0 };
    byMonth[month][bucket] += value;

    if (!contributorsByMonth[month]) contributorsByMonth[month] = [];
    contributorsByMonth[month].push({
      job: line.job_number,
      title: line.title,
      source: bucket,
      value,
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
    const { live, pipeline, released, deferred } = byMonth[m];
    const label = formatter.format(new Date(`${m}-01T00:00:00`));
    const total = live + pipeline + released + deferred;
    cashflowMonths[m] = { label, live, pipeline, released, deferred, contributors: contributorsByMonth[m] };
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
        ${released !== 0 ? `<span class="forecast-bar-value" style="color:#3f6fa8;">Released: ${money(released)}</span>` : ''}
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

  const sourceLabel = { live: 'Live', pipeline: 'Pipeline', released: 'Released', deferred: 'Deferred' };
  const isManualSource = (s) => s === 'released' || s === 'deferred';
  const rows = data.contributors
    .map(c => `
      <tr>
        <td>${isManualSource(c.source) ? escapeHtml(c.title || '') : `${escapeHtml(c.job)} ${escapeHtml(c.title || '')}`}</td>
        <td>${sourceLabel[c.source] || c.source}</td>
        <td>${money(c.value)}</td>
      </tr>
    `)
    .join('');

  detailEl.innerHTML = `
    <h3 class="forecast-detail-title">${data.label}</h3>
    <table class="forecast-detail-table">
      <thead><tr><th>Job</th><th>Source</th><th>Value</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Total</td><td></td><td>${money(data.live + data.pipeline + data.released + data.deferred)}</td></tr>
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

let allManualLines = [];
let activeManualTab = 'release';

async function loadManualEntries() {
  const res = await fetch('api/manual_billing_lines.php');
  const { lines } = await res.json();
  allManualLines = lines;

  const released = lines.filter(l => Number(l.value) >= 0);
  const deferred = lines.filter(l => Number(l.value) < 0);
  document.getElementById('releasedTotal').textContent =
    `(${money(released.reduce((sum, l) => sum + Number(l.value), 0))})`;
  document.getElementById('deferredTotal').textContent =
    `(${money(deferred.reduce((sum, l) => sum + Number(l.value), 0))})`;

  renderMonthSummary(lines);
  renderManualEntryGroups();
}

function renderMonthSummary(lines) {
  const body = document.getElementById('manualMonthSummaryBody');
  if (lines.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="chart-note">No manual entries yet.</td></tr>';
    return;
  }

  const byMonth = {};
  for (const l of lines) {
    const month = l.billing_date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { released: 0, deferred: 0 };
    if (Number(l.value) < 0) {
      byMonth[month].deferred += Number(l.value);
    } else {
      byMonth[month].released += Number(l.value);
    }
  }

  const months = Object.keys(byMonth).sort();
  const formatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

  body.innerHTML = months.map(month => {
    const { released, deferred } = byMonth[month];
    const label = formatter.format(new Date(`${month}-01T00:00:00`));
    return `
      <tr>
        <td>${label}</td>
        <td>${money(released)}</td>
        <td class="${deferred < 0 ? 'negative' : ''}">${money(deferred)}</td>
        <td>${money(released + deferred)}</td>
      </tr>
    `;
  }).join('');
}

function renderManualEntryGroups() {
  const container = document.getElementById('manualEntryGroups');
  const lines = allManualLines.filter(l =>
    activeManualTab === 'defer' ? Number(l.value) < 0 : Number(l.value) >= 0
  );

  if (lines.length === 0) {
    container.innerHTML = `<p class="chart-note">No ${activeManualTab === 'defer' ? 'deferred' : 'released'} entries yet.</p>`;
    return;
  }

  const byMonth = {};
  for (const l of lines) {
    const month = l.billing_date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(l);
  }

  const months = Object.keys(byMonth).sort();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const formatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

  container.innerHTML = months.map(month => {
    const entries = byMonth[month];
    const total = entries.reduce((sum, l) => sum + Number(l.value || 0), 0);
    const label = formatter.format(new Date(`${month}-01T00:00:00`));
    const rows = entries.map(l => `
      <tr>
        <td>${escapeHtml(l.description)}</td>
        <td>${l.billing_date}</td>
        <td class="${activeManualTab === 'defer' ? 'negative' : ''}">${money(l.value)}</td>
        <td><button type="button" class="manual-entry-delete" data-id="${l.id}">Delete</button></td>
      </tr>
    `).join('');

    return `
      <details class="manual-month-details" ${month === currentMonth ? 'open' : ''}>
        <summary>${label} <span class="forecast-toggle-hint">${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, ${money(total)}</span></summary>
        <table class="job-table">
          <thead><tr><th>Description</th><th>Date</th><th>Value</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    `;
  }).join('');
}

function initManualEntryTabs() {
  document.getElementById('manualEntryTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.manual-entry-tab');
    if (!btn) return;
    activeManualTab = btn.dataset.type;
    document.querySelectorAll('.manual-entry-tab').forEach(t =>
      t.classList.toggle('manual-entry-tab-active', t === btn)
    );
    renderManualEntryGroups();
  });
}

function initManualEntryForm() {
  const form = document.getElementById('manualEntryForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const description = document.getElementById('manualDescription').value.trim();
    const billingDate = document.getElementById('manualDate').value;
    const type = document.getElementById('manualType').value;
    const rawValue = Number(document.getElementById('manualValue').value || 0);
    const value = type === 'defer' ? -Math.abs(rawValue) : Math.abs(rawValue);

    await fetch('api/manual_billing_lines.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, billing_date: billingDate, value }),
    });

    form.reset();
    await loadManualEntries();
    await loadCashflow();
  });

  document.getElementById('manualEntryGroups').addEventListener('click', async (e) => {
    const btn = e.target.closest('.manual-entry-delete');
    if (!btn) return;

    await fetch('api/manual_billing_line_delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(btn.dataset.id) }),
    });

    await loadManualEntries();
    await loadCashflow();
  });
}

initDetailClicks();
initManualEntryForm();
initManualEntryTabs();
loadCashflow();
loadManualEntries();
