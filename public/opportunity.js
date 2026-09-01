const STATUS_LABEL = {
  in_progress: 'In progress',
  needs_quoting: 'Needs quoting',
  with_client: 'With client',
  on_hold: 'On hold',
};

const BUCKET_RISK_CLASS = {
  overdue: 'red',
  short_term: 'amber',
  long_term: 'green',
};

function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function bucketFor(o, today) {
  if (!o.date_due || o.date_due < today) return 'overdue';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 42);
  return o.date_due <= cutoff.toISOString().slice(0, 10) ? 'short_term' : 'long_term';
}

let currentJobNumber = null;

async function loadOpportunity() {
  const jobNumber = new URLSearchParams(location.search).get('job');
  if (!jobNumber) {
    document.getElementById('opportunityTitle').textContent = 'No opportunity specified';
    return;
  }
  currentJobNumber = jobNumber;

  const res = await fetch('api/opportunity.php?job=' + encodeURIComponent(jobNumber));
  if (!res.ok) {
    document.getElementById('opportunityTitle').textContent = 'Opportunity not found';
    return;
  }
  const { opportunity: o } = await res.json();

  document.title = `${o.job_number} — Job Health`;
  document.getElementById('opportunityTitle').textContent = `${o.job_number} — ${o.title || 'Untitled'}`;
  document.getElementById('opportunitySub').textContent =
    [o.client_name, o.handler_name, o.date_due ? `Due ${o.date_due}` : null]
      .filter(Boolean).join(' · ');

  const today = new Date().toISOString().slice(0, 10);
  const bucket = o.status === 'on_hold' ? null : bucketFor(o, today);
  const badge = document.getElementById('riskBadge');
  badge.textContent = STATUS_LABEL[o.status] || 'Unknown status';
  badge.className = 'risk-badge risk-badge-' + (o.status === 'on_hold' ? 'unquoted' : (bucket ? BUCKET_RISK_CLASS[bucket] : 'green'));

  renderStats(o);
  renderBillingTable(o.billing_lines || []);
  document.getElementById('opportunityNotes').value = o.notes || '';

  initNotesSaving();
}

function renderStats(o) {
  const el = document.getElementById('statPanel');
  const noValue = o.quoted_value === null || Number(o.quoted_value) === 0;

  el.innerHTML = `
    <div class="profit-tile">
      <span class="profit-label">Quoted value</span>
      <span class="profit-value ${noValue ? 'negative' : ''}">${money(o.quoted_value)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label" title="Synergist's own confidence-of-winning weighting for this opportunity.">Weighting</span>
      <span class="profit-value">${o.weighting === null || o.weighting === undefined ? '—' : `${o.weighting}%`}</span>
    </div>
    <div class="profit-tile profit-tile-emphasis profit-tile-red">
      <span class="profit-label" title="How long this opportunity has been open, from its start date in Synergist to today — i.e. turnaround so far.">Turnaround so far</span>
      <span class="profit-value">${o.days_open === null ? '—' : `${o.days_open} day${o.days_open === 1 ? '' : 's'}`}</span>
      ${o.date_in ? `<span class="profit-sub">since ${o.date_in}</span>` : ''}
    </div>
    <div class="profit-tile">
      <span class="profit-label" title="Total net invoiced to this client across all their jobs, ${o.fy_from} to ${o.fy_to}.">Client investment this FY</span>
      <span class="profit-value">${o.client_investment_fy === null ? '—' : money(o.client_investment_fy)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Date due</span>
      <span class="profit-value">${o.date_due || '—'}</span>
    </div>
  `;
}

function renderBillingTable(lines) {
  const body = document.getElementById('billingTableBody');
  if (lines.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="chart-note">No billing plan lines set up in Synergist for this opportunity.</td></tr>';
    return;
  }
  let running = 0;
  body.innerHTML = lines.map(l => {
    const cost = Number(l.planned_cost || 0);
    running += Number(l.planned_value || 0) - cost;
    const costTag = cost <= 0 ? '' : running >= 0
      ? '<span class="pct-chip" style="background:#e7eef7;color:#3f6fa8;">Covered by prior profit</span>'
      : '<span class="pct-chip red">Not fully covered</span>';
    return `
    <tr>
      <td>${l.billing_date || '—'}</td>
      <td>${money(l.planned_value)}</td>
      <td class="negative">${money(l.planned_cost)} ${costTag}</td>
      <td class="${running < 0 ? 'negative' : ''}">${money(running)}</td>
    </tr>
  `;
  }).join('');
}

function initNotesSaving() {
  const textarea = document.getElementById('opportunityNotes');
  const status = document.getElementById('opportunityNotesStatus');

  textarea.addEventListener('blur', async () => {
    status.textContent = 'Saving…';
    try {
      const res = await fetch('api/pipeline_note.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_number: currentJobNumber, notes: textarea.value }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error();
      status.textContent = 'Saved';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (e) {
      status.textContent = 'Failed to save';
    }
  });
}

function initBackLink() {
  const link = document.getElementById('backLink');
  if (document.referrer && new URL(document.referrer).origin === location.origin) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      history.back();
    });
  }
}

initBackLink();
loadOpportunity();
