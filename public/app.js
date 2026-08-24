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

function applyFilter() {
  const handler = document.getElementById('handlerFilter').value;
  const filtered = handler ? allJobs.filter(j => j.handler_name === handler) : allJobs;
  renderProfitPanel(filtered);
  renderHighlights(filtered);
  renderSummary(filtered);
  renderTable(filtered);
}

function renderHighlights(jobs) {
  const el = document.getElementById('highlightRow');
  const withMargin = jobs.filter(j => j.net_margin !== null && j.net_margin !== undefined);
  if (withMargin.length === 0) {
    el.innerHTML = '';
    return;
  }

  const best = withMargin.reduce((a, b) => Number(b.net_margin) > Number(a.net_margin) ? b : a);
  const worst = withMargin.reduce((a, b) => Number(b.net_margin) < Number(a.net_margin) ? b : a);

  const card = (job, kind) => `
    <a class="highlight-card highlight-card-${kind}" href="job.html?job=${encodeURIComponent(job.job_number)}">
      <span class="highlight-kicker">${kind === 'best' ? 'Most profitable' : 'Biggest risk'}</span>
      <span class="highlight-job">${job.job_number} — ${escapeHtml(job.title || '')}</span>
      <span class="highlight-client">${escapeHtml(job.client_name || '')}</span>
      <span class="highlight-margin ${Number(job.net_margin) < 0 ? 'negative' : ''}">${money(job.net_margin)} net profit (${pct(job.net_margin_pct)} margin)</span>
      <span class="highlight-handler">${escapeHtml(job.handler_name || 'Unassigned')}</span>
    </a>
  `;

  el.innerHTML = (best === worst)
    ? card(best, 'best')
    : card(best, 'best') + card(worst, 'worst');
}

function renderProfitPanel(jobs) {
  const totalQuoted = jobs.reduce((sum, j) => sum + Number(j.quoted_value || 0), 0);
  const totalNetMargin = jobs.reduce((sum, j) => sum + Number(j.net_margin || 0), 0);
  const totalGrossMargin = jobs.reduce((sum, j) => sum + Number(j.gross_margin || 0), 0);
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
  return { red: 0, amber: 1, green: 2 }[risk] ?? 3;
}

function renderSummary(jobs) {
  const counts = { red: 0, amber: 0, green: 0 };
  for (const j of jobs) counts[j.risk] = (counts[j.risk] || 0) + 1;
  const el = document.getElementById('summary');
  el.innerHTML = `
    <span><strong>${jobs.length}</strong> open live jobs</span>
    <span><span class="risk-dot red"></span> <strong>${counts.red}</strong> over budget / negative margin</span>
    <span><span class="risk-dot amber"></span> <strong>${counts.amber}</strong> approaching risk</span>
    <span><span class="risk-dot green"></span> <strong>${counts.green}</strong> healthy</span>
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
    <tr class="job-row" onclick="location.href='job.html?job=${encodeURIComponent(j.job_number)}'">
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
loadJobs();
