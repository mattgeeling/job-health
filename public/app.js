let allJobs = [];

async function loadJobs() {
  const res = await fetch('api/jobs.php');
  const { jobs, last_synced_at } = await res.json();
  allJobs = jobs;
  populateHandlerFilter(jobs);
  applyFilter();
  renderLastSynced(last_synced_at);
}

function renderLastSynced(isoString) {
  const el = document.getElementById('lastSynced');
  if (!isoString) {
    el.textContent = 'Never synced';
    return;
  }
  const date = new Date(isoString.replace(' ', 'T'));
  el.textContent = 'Last synced ' + date.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
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
      const res = await fetch('api/refresh.php', { method: 'POST' });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || 'Sync failed');

      await loadJobs();
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      status.textContent = `Synced ${result.synced} jobs at ${now}`;
    } catch (e) {
      status.textContent = 'Sync failed — try again';
      status.classList.add('sync-status-error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync now';
    }
  });
}

function populateHandlerFilter(jobs) {
  const select = document.getElementById('handlerFilter');
  const handlers = [...new Set(jobs.map(j => j.handler_name).filter(Boolean))].sort();

  const fromUrl = new URLSearchParams(location.search).get('handler');
  const saved = fromUrl || localStorage.getItem('jobHealthHandlerFilter') || '';

  select.innerHTML = '<option value="">All handlers</option>' +
    handlers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');

  if (handlers.includes(saved)) {
    select.value = saved;
    localStorage.setItem('jobHealthHandlerFilter', saved);
  }

  select.addEventListener('change', () => {
    localStorage.setItem('jobHealthHandlerFilter', select.value);
    applyFilter();
  });
}

function initSearch() {
  const input = document.getElementById('jobSearch');
  input.addEventListener('input', applyFilter);
}

function applyFilter() {
  const handler = document.getElementById('handlerFilter').value;
  const query = document.getElementById('jobSearch').value.trim().toLowerCase();

  let filtered = handler ? allJobs.filter(j => j.handler_name === handler) : allJobs;
  if (query) {
    filtered = filtered.filter(j =>
      (j.job_number || '').toLowerCase().includes(query) ||
      (j.title || '').toLowerCase().includes(query) ||
      (j.client_name || '').toLowerCase().includes(query)
    );
  }

  renderProfitPanel(filtered);
  renderHighlights(filtered);
  renderDeliveryEfficiency(filtered);
  renderSummary(filtered);
  renderTable(filtered);
}

const CHARGEABLE_DAY_RATE = 825;

function renderDeliveryEfficiency(jobs) {
  const withEstimate = jobs.filter(j => Number(j.estimate_hours) > 0);
  const overJobs = withEstimate.filter(j => Number(j.actual_hours) > Number(j.estimate_hours));

  const totalOverHours = overJobs.reduce((sum, j) => sum + (Number(j.actual_hours) - Number(j.estimate_hours)), 0);
  const totalOverDays = totalOverHours / 7.5;
  const capacityValue = totalOverDays * CHARGEABLE_DAY_RATE;

  const statsEl = document.getElementById('deliveryStats');
  statsEl.innerHTML = `
    <div class="profit-tile">
      <span class="profit-label">Over-delivered hours</span>
      <span class="profit-value">${totalOverHours.toFixed(0)}h <span class="delivery-days">(~${totalOverDays.toFixed(0)} working days)</span></span>
    </div>
    <div class="profit-tile profit-tile-emphasis profit-tile-red">
      <span class="profit-label">Value of that lost capacity</span>
      <span class="profit-value">${money(capacityValue)} <span class="delivery-days">at £${CHARGEABLE_DAY_RATE}/day</span></span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Jobs currently over estimate</span>
      <span class="profit-value">${overJobs.length} <span class="delivery-days">of ${withEstimate.length}</span></span>
    </div>
  `;

  const sorted = [...overJobs].sort((a, b) =>
    (Number(b.actual_hours) - Number(b.estimate_hours)) - (Number(a.actual_hours) - Number(a.estimate_hours))
  );

  const body = document.getElementById('deliveryTableBody');
  if (sorted.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="chart-note">No jobs currently over their estimated hours.</td></tr>';
    return;
  }

  body.innerHTML = sorted.map(j => {
    const over = Number(j.actual_hours) - Number(j.estimate_hours);
    return `
      <tr class="job-row" onclick="location.href='job.html?job=${encodeURIComponent(j.job_number)}'">
        <td>
          <span class="job-number">${j.job_number}</span>
          <span class="job-title">${escapeHtml(j.title || '')}</span>
        </td>
        <td>${escapeHtml(j.handler_name || '')}</td>
        <td><strong>+${over.toFixed(0)}h</strong></td>
        <td>${pct(j.net_margin_pct)}</td>
      </tr>
    `;
  }).join('');
}

function renderHighlights(jobs) {
  const el = document.getElementById('highlightRow');
  const withMargin = jobs.filter(j => j.net_margin !== null && j.net_margin !== undefined && j.risk !== 'unquoted');
  if (withMargin.length === 0) {
    el.innerHTML = '';
    return;
  }

  const best = withMargin.reduce((a, b) => Number(b.net_margin) > Number(a.net_margin) ? b : a);

  // "Biggest risk" must actually BE at risk (red) — picking the lowest
  // net profit across all jobs would flag a healthy, 70%-margin job just
  // because its profit happened to be the smallest positive number.
  const redJobs = withMargin.filter(j => j.risk === 'red');
  const worst = redJobs.length > 0
    ? redJobs.reduce((a, b) => Number(b.net_margin) < Number(a.net_margin) ? b : a)
    : null;

  const card = (job, kind) => `
    <a class="highlight-card highlight-card-${kind}" href="job.html?job=${encodeURIComponent(job.job_number)}">
      <span class="highlight-kicker">${kind === 'best' ? 'Most profitable' : 'Biggest risk'}</span>
      <span class="highlight-job">${job.job_number} — ${escapeHtml(job.title || '')}</span>
      <span class="highlight-client">${escapeHtml(job.client_name || '')}</span>
      <span class="highlight-margin ${Number(job.net_margin) < 0 ? 'negative' : ''}">${money(job.net_margin)} net profit (${pct(job.net_margin_pct)} margin)</span>
      <span class="highlight-handler">${escapeHtml(job.handler_name || 'Unassigned')}</span>
    </a>
  `;

  const noRiskCard = `
    <div class="highlight-card highlight-card-best">
      <span class="highlight-kicker">Biggest risk</span>
      <span class="highlight-job">No jobs currently flagged red</span>
    </div>
  `;

  el.innerHTML = card(best, 'best') + (worst && worst !== best ? card(worst, 'worst') : noRiskCard);
}

function renderProfitPanel(jobs) {
  const quotedJobs = jobs.filter(j => j.risk !== 'unquoted');
  const totalQuoted = quotedJobs.reduce((sum, j) => sum + Number(j.quoted_value || 0), 0);
  const totalNetMargin = quotedJobs.reduce((sum, j) => sum + Number(j.net_margin || 0), 0);
  const totalGrossMargin = quotedJobs.reduce((sum, j) => sum + Number(j.gross_margin || 0), 0);
  const blendedNetPct = totalQuoted !== 0 ? (totalNetMargin / totalQuoted) * 100 : null;
  const atRiskMargin = jobs
    .filter(j => j.risk === 'red')
    .reduce((sum, j) => sum + Math.min(0, Number(j.net_margin || 0)), 0);

  const el = document.getElementById('profitPanel');
  el.innerHTML = `
    <div class="profit-tile">
      <span class="profit-label">Total quoted</span>
      <span class="profit-value">${money(totalQuoted)}</span>
    </div>
    <div class="profit-tile profit-tile-emphasis">
      <span class="profit-label">Net profit</span>
      <span class="profit-value ${totalNetMargin < 0 ? 'negative' : ''}">${money(totalNetMargin)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Blended net margin %</span>
      <span class="profit-value ${blendedNetPct !== null && blendedNetPct < 0 ? 'negative' : ''}">${pct(blendedNetPct)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Gross margin</span>
      <span class="profit-value">${money(totalGrossMargin)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Margin eroded by red jobs</span>
      <span class="profit-value ${atRiskMargin < 0 ? 'negative' : ''}">${money(atRiskMargin)}</span>
    </div>
  `;
}

function riskWeight(risk) {
  return { red: 0, unquoted: 0, amber: 1, green: 2 }[risk] ?? 3;
}

function renderSummary(jobs) {
  const counts = { red: 0, amber: 0, green: 0, unquoted: 0 };
  for (const j of jobs) counts[j.risk] = (counts[j.risk] || 0) + 1;
  const el = document.getElementById('summary');
  el.innerHTML = `
    <span><strong>${jobs.length}</strong> open live jobs</span>
    <span><span class="risk-dot red"></span> <strong>${counts.red}</strong> over budget / negative margin</span>
    <span><span class="risk-dot amber"></span> <strong>${counts.amber}</strong> approaching risk</span>
    <span><span class="risk-dot green"></span> <strong>${counts.green}</strong> healthy</span>
    ${counts.unquoted > 0 ? `<span><span class="risk-dot unquoted"></span> <strong>${counts.unquoted}</strong> no quote yet</span>` : ''}
  `;
}

function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(0) + '%';
}

function pctChip(v, risk) {
  if (v === null || v === undefined) return '—';
  return `<span class="pct-chip ${risk}">${pct(v)}</span>`;
}

function renderTable(jobs) {
  const sorted = [...jobs].sort((a, b) => {
    const w = riskWeight(a.risk) - riskWeight(b.risk);
    if (w !== 0) return w;
    const aPct = a.net_margin_pct ?? Infinity;
    const bPct = b.net_margin_pct ?? Infinity;
    return aPct - bPct;
  });

  const body = document.getElementById('jobTableBody');
  body.innerHTML = sorted.map(j => `
    <tr class="job-row ${j.risk === 'unquoted' ? 'job-row-unquoted' : ''}" onclick="location.href='job.html?job=${encodeURIComponent(j.job_number)}'">
      <td><span class="risk-dot ${j.risk}"></span></td>
      <td>
        <span class="job-number">${j.job_number}</span>
        <span class="job-title">${escapeHtml(j.title || '')}</span>
      </td>
      <td>${escapeHtml(j.client_name || '')}</td>
      <td>${escapeHtml(j.handler_name || '')}</td>
      <td>${j.date_due || '—'}</td>
      <td>${money(j.quoted_value)}</td>
      <td class="${j.net_margin < 0 ? 'negative' : ''}"><strong>${money(j.net_margin)}</strong></td>
      <td class="${j.net_margin_pct !== null && j.net_margin_pct < 0 ? 'negative' : ''}"><strong>${pct(j.net_margin_pct)}</strong></td>
      <td>${j.actual_hours ?? '—'} / ${j.estimate_hours ?? '—'}</td>
      <td>${pctChip(j.pct_actual_vs_estimate_hours, j.risk)}</td>
      <td>${j.notes ? `<span class="job-note">${escapeHtml(j.notes)}</span>` : '—'}</td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

initSyncButton();
initSearch();
loadJobs();
