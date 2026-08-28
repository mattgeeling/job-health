let allOpportunities = [];

const BUCKET_LABEL = {
  overdue: 'Overdue',
  short_term: 'Short term',
  long_term: 'Long term',
  unscheduled: 'No date',
};

const BUCKET_RISK_CLASS = {
  overdue: 'red',
  short_term: 'amber',
  long_term: 'green',
  unscheduled: 'unquoted',
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function loadPipeline() {
  const res = await fetch('api/pipeline.php');
  const { opportunities, last_synced_at } = await res.json();
  allOpportunities = opportunities;
  populateHandlerFilter(opportunities);
  applyFilter();
  renderLastSynced(last_synced_at);
}

function populateHandlerFilter(opportunities) {
  const select = document.getElementById('handlerFilter');
  const handlers = [...new Set(opportunities.map(o => o.handler_name).filter(Boolean))].sort();

  const saved = localStorage.getItem('pipelineHandlerFilter') || '';

  select.innerHTML = '<option value="">All handlers</option>' +
    handlers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');

  if (handlers.includes(saved)) {
    select.value = saved;
  }

  select.addEventListener('change', () => {
    localStorage.setItem('pipelineHandlerFilter', select.value);
    applyFilter();
  });
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

      await loadPipeline();
      const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      status.textContent = `Synced ${result.pipeline_jobs} opportunities at ${now}`;
    } catch (e) {
      status.textContent = 'Sync failed — try again';
      status.classList.add('sync-status-error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync now';
    }
  });
}

function initSearch() {
  document.getElementById('pipelineSearch').addEventListener('input', applyFilter);
}

function getActiveBucket() {
  return new URLSearchParams(location.search).get('bucket') || '';
}

function applyFilter() {
  const query = document.getElementById('pipelineSearch').value.trim().toLowerCase();
  const handler = document.getElementById('handlerFilter').value;

  let searchFiltered = handler ? allOpportunities.filter(o => o.handler_name === handler) : allOpportunities;
  if (query) {
    searchFiltered = searchFiltered.filter(o =>
      (o.job_number || '').toLowerCase().includes(query) ||
      (o.title || '').toLowerCase().includes(query) ||
      (o.client_name || '').toLowerCase().includes(query)
    );
  }

  const activeBucket = getActiveBucket();
  const tableFiltered = activeBucket
    ? searchFiltered.filter(o => o.bucket === activeBucket)
    : searchFiltered;

  renderStats(searchFiltered, activeBucket);
  renderTable(tableFiltered);
}

function renderStats(rows, activeBucket) {
  const counts = { overdue: 0, short_term: 0, long_term: 0, unscheduled: 0 };
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;

  const tile = (bucket, label, title, count, extraClass = '') => `
    <a class="profit-tile bucket-tile ${activeBucket === bucket ? 'bucket-tile-active' : ''}" href="pipeline.html?bucket=${bucket}">
      <span class="profit-label" title="${title}">${label}</span>
      <span class="profit-value ${extraClass}">${count}</span>
    </a>
  `;

  const el = document.getElementById('pipelineStats');
  el.innerHTML =
    tile('short_term', 'Short term', 'Opportunities due within the next 6 weeks.', counts.short_term) +
    tile('long_term', 'Long term', 'Opportunities due more than 6 weeks out.', counts.long_term) +
    tile('overdue', 'Overdue', 'Due date has already passed without being won or lost in Synergist.', counts.overdue, counts.overdue > 0 ? 'negative' : '') +
    tile('unscheduled', 'No date set', 'No due date set in Synergist.', counts.unscheduled);

  const clearEl = document.getElementById('pipelineClearFilter');
  clearEl.innerHTML = activeBucket
    ? `Showing <strong>${BUCKET_LABEL[activeBucket]}</strong> only &middot; <a href="pipeline.html">Show all &rarr;</a>`
    : '';
}

function renderTable(rows) {
  const body = document.getElementById('pipelineTableBody');
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="chart-note">No opportunities match.</td></tr>';
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    if (!a.date_due) return 1;
    if (!b.date_due) return -1;
    return a.date_due.localeCompare(b.date_due);
  });

  body.innerHTML = sorted.map(o => {
    const noValue = o.quoted_value === null || o.quoted_value === undefined || Number(o.quoted_value) === 0;
    return `
    <tr class="${noValue ? 'job-row-unquoted' : ''}">
      <td><span class="risk-dot ${BUCKET_RISK_CLASS[o.bucket]}"></span></td>
      <td>
        <span class="job-number">${o.job_number}</span>
        <span class="job-title">${escapeHtml(o.title || '')}</span>
      </td>
      <td>${escapeHtml(o.client_name || '')}</td>
      <td>${escapeHtml(o.handler_name || '')}</td>
      <td>${escapeHtml(o.job_type || '')}</td>
      <td>${o.date_in || '—'}</td>
      <td>${o.date_due || '—'} <span class="pct-chip ${BUCKET_RISK_CLASS[o.bucket]}">${BUCKET_LABEL[o.bucket]}</span></td>
      <td>${money(o.quoted_value)}</td>
    </tr>
  `;
  }).join('');
}

initSyncButton();
initSearch();
loadPipeline();
