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

async function loadPipeline() {
  const res = await fetch('api/pipeline.php');
  const { opportunities, last_synced_at } = await res.json();
  allOpportunities = opportunities;
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

function applyFilter() {
  const query = document.getElementById('pipelineSearch').value.trim().toLowerCase();
  let filtered = allOpportunities;
  if (query) {
    filtered = filtered.filter(o =>
      (o.job_number || '').toLowerCase().includes(query) ||
      (o.title || '').toLowerCase().includes(query) ||
      (o.client_name || '').toLowerCase().includes(query)
    );
  }
  renderStats(filtered);
  renderTable(filtered);
}

function renderStats(rows) {
  const counts = { overdue: 0, short_term: 0, long_term: 0, unscheduled: 0 };
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;

  const el = document.getElementById('pipelineStats');
  el.innerHTML = `
    <div class="profit-tile">
      <span class="profit-label" title="Opportunities due within the next 6 weeks.">Short term</span>
      <span class="profit-value">${counts.short_term}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label" title="Opportunities due more than 6 weeks out.">Long term</span>
      <span class="profit-value">${counts.long_term}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label" title="Due date has already passed without being won or lost in Synergist.">Overdue</span>
      <span class="profit-value ${counts.overdue > 0 ? 'negative' : ''}">${counts.overdue}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label" title="No due date set in Synergist.">No date set</span>
      <span class="profit-value">${counts.unscheduled}</span>
    </div>
  `;
}

function renderTable(rows) {
  const body = document.getElementById('pipelineTableBody');
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="chart-note">No opportunities match.</td></tr>';
    return;
  }

  body.innerHTML = rows.map(o => `
    <tr>
      <td><span class="risk-dot ${BUCKET_RISK_CLASS[o.bucket]}"></span></td>
      <td>
        <span class="job-number">${o.job_number}</span>
        <span class="job-title">${escapeHtml(o.title || '')}</span>
      </td>
      <td>${escapeHtml(o.client_name || '')}</td>
      <td>${escapeHtml(o.handler_name || '')}</td>
      <td>${escapeHtml(o.job_type || '')}</td>
      <td>${o.date_due || '—'} <span class="pct-chip ${BUCKET_RISK_CLASS[o.bucket]}">${BUCKET_LABEL[o.bucket]}</span></td>
    </tr>
  `).join('');
}

initSyncButton();
initSearch();
loadPipeline();
