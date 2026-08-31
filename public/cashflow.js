let cashflowMonths = {};

function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

    const isLive = line.source === 'live';
    const confidence = isLive ? 1 : (line.weighting === null ? 0.5 : Number(line.weighting) / 100);
    const value = Number(line.planned_value || 0) * confidence;

    if (!byMonth[month]) byMonth[month] = { live: 0, pipeline: 0 };
    byMonth[month][isLive ? 'live' : 'pipeline'] += value;

    if (!contributorsByMonth[month]) contributorsByMonth[month] = [];
    contributorsByMonth[month].push({
      job: line.job_number,
      title: line.title,
      source: line.source,
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
  `;

  if (months.length === 0) {
    axisEl.innerHTML = '';
    gridEl.innerHTML = '';
    chartEl.innerHTML = '<p class="chart-note">No billing plan data to forecast from yet.</p>';
    return;
  }

  const maxValue = Math.max(...months.map(m => Math.max(byMonth[m].live, byMonth[m].pipeline)));
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
    const { live, pipeline } = byMonth[m];
    const label = formatter.format(new Date(`${m}-01T00:00:00`));
    cashflowMonths[m] = { label, live, pipeline, contributors: contributorsByMonth[m] };
    const heightPct = (v) => axisMax > 0 ? Math.max((v / axisMax) * 100, 3) : 3;
    return `
      <div class="forecast-bar-col" data-month="${m}" tabindex="0" role="button" aria-label="Show breakdown for ${label}">
        <div class="forecast-bar-group">
          <div class="forecast-bar" style="height:${heightPct(live)}%; background:#2f7a4f;"></div>
          <div class="forecast-bar" style="height:${heightPct(pipeline)}%; background:rgba(242,196,0,0.6);"></div>
        </div>
        <span class="forecast-bar-label">${label}</span>
        <span class="forecast-bar-value" style="color:#2f7a4f;">Live: ${money(live)}</span>
        <span class="forecast-bar-value" style="color:#8a6d00;">Pipeline: ${money(pipeline)}</span>
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

  const rows = data.contributors
    .map(c => `
      <tr>
        <td>${escapeHtml(c.job)} ${escapeHtml(c.title || '')}</td>
        <td>${c.source === 'live' ? 'Live' : 'Pipeline'}</td>
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
        <tr><td>Total</td><td></td><td>${money(data.live + data.pipeline)}</td></tr>
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

initDetailClicks();
loadCashflow();
