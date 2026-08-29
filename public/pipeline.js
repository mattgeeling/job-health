let allOpportunities = [];

const BUCKET_LABEL = {
  overdue: 'Overdue',
  short_term: 'Short term',
  long_term: 'Long term',
};

const BUCKET_RISK_CLASS = {
  overdue: 'red',
  short_term: 'amber',
  long_term: 'green',
};

const STATUS_LABEL = {
  sent: 'Sent',
  in_progress: 'In progress',
  needs_quoting: 'Needs quoting',
  with_client: 'With client',
  on_hold: 'On hold',
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

  const fromUrl = new URLSearchParams(location.search).get('handler');
  const saved = fromUrl || localStorage.getItem('pipelineHandlerFilter') || '';

  select.innerHTML = '<option value="">All handlers</option>' +
    handlers.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');

  if (handlers.includes(saved)) {
    select.value = saved;
    localStorage.setItem('pipelineHandlerFilter', saved);
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
      status.textContent = `Synced ${result.pipeline_jobs} opportunities at ${now} (took ${result.duration_seconds}s)`;
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

function getActiveStatus() {
  return new URLSearchParams(location.search).get('status') || '';
}

function applyFilter() {
  const query = document.getElementById('pipelineSearch').value.trim().toLowerCase();
  const handler = document.getElementById('handlerFilter').value;
  const client = new URLSearchParams(location.search).get('client') || '';
  const activeStatus = getActiveStatus();

  let searchFiltered = handler ? allOpportunities.filter(o => o.handler_name === handler) : allOpportunities;
  if (client) {
    searchFiltered = searchFiltered.filter(o => o.client_name === client);
  }
  if (query) {
    searchFiltered = searchFiltered.filter(o =>
      (o.job_number || '').toLowerCase().includes(query) ||
      (o.title || '').toLowerCase().includes(query) ||
      (o.client_name || '').toLowerCase().includes(query)
    );
  }

  const onHoldCount = searchFiltered.filter(o => o.status === 'on_hold').length;

  // On hold opportunities are hidden from the default "open" view — the
  // On hold card is the only way to see them, so this count/tile logic
  // needs the full set (searchFiltered) while everything else works off
  // openFiltered.
  const openFiltered = activeStatus === 'on_hold'
    ? searchFiltered.filter(o => o.status === 'on_hold')
    : searchFiltered.filter(o => o.status !== 'on_hold');

  const activeBucket = getActiveBucket();
  const tableFiltered = activeBucket
    ? openFiltered.filter(o => o.bucket === activeBucket)
    : openFiltered;

  renderStats(openFiltered, activeBucket, onHoldCount, activeStatus);
  renderTable(tableFiltered);
}

function renderStats(rows, activeBucket, onHoldCount, activeStatus) {
  const counts = { overdue: 0, short_term: 0, long_term: 0 };
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] || 0) + 1;
  const noValueCount = rows.filter(r => r.quoted_value === null || r.quoted_value === undefined || Number(r.quoted_value) === 0).length;
  const totalValueForCard = rows.reduce((sum, r) => sum + Number(r.quoted_value || 0), 0);
  const distinctClients = new Set(rows.map(r => r.client_name).filter(Boolean)).size;
  const valuePerClient = distinctClients > 0 ? totalValueForCard / distinctClients : 0;

  const tile = (bucket, label, title, count, extraClass = '') => `
    <a class="profit-tile bucket-tile ${activeBucket === bucket ? 'bucket-tile-active' : ''}" href="pipeline.html?bucket=${bucket}">
      <span class="profit-label" title="${title}">${label}</span>
      <span class="profit-value ${extraClass}">${count}</span>
    </a>
  `;

  const el = document.getElementById('pipelineStats');
  el.innerHTML =
    `<div class="profit-tile">
      <span class="profit-label" title="Total number of open opportunities, before splitting by timeframe.">Total opportunities</span>
      <span class="profit-value">${rows.length}</span>
    </div>` +
    tile('short_term', 'Short term', 'Opportunities due within the next 6 weeks.', counts.short_term) +
    tile('long_term', 'Long term', 'Opportunities due more than 6 weeks out.', counts.long_term) +
    tile('overdue', 'Overdue', 'Due date has already passed (or no due date was ever set) without being won or lost in Synergist.', counts.overdue, counts.overdue > 0 ? 'negative' : '') +
    `<div class="profit-tile">
      <span class="profit-label" title="Opportunities with no quoted value entered in Synergist.">No value set</span>
      <span class="profit-value ${noValueCount > 0 ? 'negative' : ''}">${noValueCount}</span>
    </div>` +
    `<a class="profit-tile bucket-tile ${activeStatus === 'on_hold' ? 'bucket-tile-active' : ''}" href="pipeline.html?status=on_hold">
      <span class="profit-label" title="Opportunities marked On hold — hidden from the main view above. Click to see just these.">On hold</span>
      <span class="profit-value">${onHoldCount}</span>
    </a>` +
    `<a class="profit-tile bucket-tile" href="pipeline-clients.html">
      <span class="profit-label" title="Total pipeline value divided by number of distinct clients with an open opportunity. Click for the breakdown per client.">Value per client</span>
      <span class="profit-value">${money(valuePerClient)}</span>
    </a>` +
    `<a class="profit-tile bucket-tile pipeline-leaderboard-tile" href="pipeline-leaderboard.html">
      <span class="profit-label">Compare handlers</span>
      <span class="profit-value">Leaderboard &rarr;</span>
    </a>`;

  const clearEl = document.getElementById('pipelineClearFilter');
  if (activeStatus === 'on_hold') {
    clearEl.innerHTML = `Showing <strong>On hold</strong> opportunities only &middot; <a href="pipeline.html">Back to open &rarr;</a>`;
  } else if (activeBucket) {
    clearEl.innerHTML = `Showing <strong>${BUCKET_LABEL[activeBucket]}</strong> only &middot; <a href="pipeline.html">Show all &rarr;</a>`;
  } else {
    clearEl.innerHTML = '';
  }

  const totalValue = rows.reduce((sum, r) => sum + Number(r.quoted_value || 0), 0);
  document.getElementById('pipelineTotalValue').textContent = money(totalValue);
  document.getElementById('pipelineTotalCount').textContent = `${rows.length} open opportunit${rows.length === 1 ? 'y' : 'ies'}`;
}

function renderTable(rows) {
  const body = document.getElementById('pipelineTableBody');
  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="10" class="chart-note">No opportunities match.</td></tr>';
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    if (!a.date_due) return 1;
    if (!b.date_due) return -1;
    return a.date_due.localeCompare(b.date_due);
  });

  let lastYear = null;
  const html = [];

  for (const o of sorted) {
    const year = o.date_due ? o.date_due.slice(0, 4) : 'No date';
    if (year !== lastYear) {
      html.push(`<tr class="pipeline-year-divider"><td colspan="10">${year}</td></tr>`);
      lastYear = year;
    }

    const noValue = o.quoted_value === null || o.quoted_value === undefined || Number(o.quoted_value) === 0;
    const onHold = o.status === 'on_hold';
    const rowClass = onHold ? 'pipeline-row-on-hold' : (noValue ? 'job-row-unquoted' : '');
    html.push(`
    <tr class="${rowClass}" data-row-for="${o.job_number}">
      <td><span class="risk-dot ${BUCKET_RISK_CLASS[o.bucket]}"></span></td>
      <td>
        <span class="job-number">${o.job_number}</span>
        <span class="job-title">${escapeHtml(o.title || '')}</span>
      </td>
      <td class="client-cell">${escapeHtml(o.client_name || '')}</td>
      <td>${escapeHtml(o.handler_name || '')}</td>
      <td>${escapeHtml(o.job_type || '')}</td>
      <td>${o.date_in || '—'}</td>
      <td>${o.date_due || '—'} <span class="pct-chip ${BUCKET_RISK_CLASS[o.bucket]}">${BUCKET_LABEL[o.bucket]}</span></td>
      <td>${money(o.quoted_value)}</td>
      <td>
        <select class="pipeline-status-select" data-job="${o.job_number}">
          ${Object.entries(STATUS_LABEL).map(([value, label]) =>
            `<option value="${value}" ${o.status === value ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <textarea class="pipeline-notes-input" data-job="${o.job_number}" rows="1" placeholder="Add a note…">${escapeHtml(o.notes || '')}</textarea>
        <span class="pipeline-notes-status" data-status-for="${o.job_number}"></span>
      </td>
    </tr>
  `);
  }

  body.innerHTML = html.join('');
}

function initNotesSaving() {
  const body = document.getElementById('pipelineTableBody');
  body.addEventListener('blur', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('pipeline-notes-input')) return;
    const textarea = e.target;
    const jobNumber = textarea.dataset.job;
    const original = allOpportunities.find(o => o.job_number === jobNumber);
    if (original && (original.notes || '') === textarea.value) return;

    const status = body.querySelector(`[data-status-for="${jobNumber}"]`);
    status.textContent = 'Saving…';
    try {
      const res = await fetch('api/pipeline_note.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_number: jobNumber, notes: textarea.value }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error();
      if (original) original.notes = textarea.value;
      status.textContent = 'Saved';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (e) {
      status.textContent = 'Failed to save';
    }
  }, true);
}

function initStatusSaving() {
  const body = document.getElementById('pipelineTableBody');
  body.addEventListener('change', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('pipeline-status-select')) return;
    const select = e.target;
    const jobNumber = select.dataset.job;
    const row = body.querySelector(`tr[data-row-for="${jobNumber}"]`);

    try {
      const res = await fetch('api/pipeline_status.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_number: jobNumber, status: select.value }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error();
      const original = allOpportunities.find(o => o.job_number === jobNumber);
      if (original) original.status = select.value;
      if (row) {
        row.classList.remove('job-row-unquoted', 'pipeline-row-on-hold');
        if (select.value === 'on_hold') {
          row.classList.add('pipeline-row-on-hold');
        } else if (original && (original.quoted_value === null || Number(original.quoted_value) === 0)) {
          row.classList.add('job-row-unquoted');
        }
      }
    } catch (e) {
      // leave the dropdown as the user set it; next full reload will
      // reflect whatever's actually saved if this silently failed
    }
  });
}

initSyncButton();
initSearch();
initNotesSaving();
initStatusSaving();
loadPipeline();
