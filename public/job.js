function moneyStr(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pctStr(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(0) + '%';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function computeRisk(hoursPct, netMarginPct) {
  const h = hoursPct === null || hoursPct === undefined ? null : Number(hoursPct);
  const m = netMarginPct === null || netMarginPct === undefined ? null : Number(netMarginPct);
  if ((h !== null && h >= 100) || (m !== null && m < 0)) return 'red';
  if ((h !== null && h >= 90) || (m !== null && m < 15)) return 'amber';
  return 'green';
}

const riskLabel = { red: 'Over budget', amber: 'Approaching risk', green: 'Healthy' };

let currentJobNumber = null;

async function loadJob() {
  const jobNumber = new URLSearchParams(location.search).get('job');
  if (!jobNumber) {
    document.getElementById('jobTitle').textContent = 'No job specified';
    return;
  }
  currentJobNumber = jobNumber;

  const res = await fetch('api/job.php?job=' + encodeURIComponent(jobNumber));
  if (!res.ok) {
    document.getElementById('jobTitle').textContent = 'Job not found';
    return;
  }
  const { job, snapshots } = await res.json();

  document.title = `${job.job_number} — Job Health`;
  document.getElementById('jobTitle').textContent = `${job.job_number} — ${job.title || 'Untitled'}`;
  document.getElementById('jobSub').textContent =
    [job.client_name, job.handler_name, job.date_due ? `Due ${job.date_due}` : null]
      .filter(Boolean).join(' · ');

  const latest = snapshots.at(-1);
  const risk = latest ? computeRisk(latest.pct_actual_vs_estimate_hours, latest.net_margin_pct) : 'green';
  const badge = document.getElementById('riskBadge');
  badge.textContent = riskLabel[risk];
  badge.className = 'risk-badge risk-badge-' + risk;

  renderStats(latest, risk);
  renderBurnBars(latest);
  document.getElementById('notesInput').value = job.notes || '';
}

function renderBurnBars(latest) {
  const el = document.getElementById('burnBars');
  if (!latest) {
    el.innerHTML = '<p class="chart-note">No data yet.</p>';
    return;
  }

  const rows = [
    {
      label: 'Hours',
      estimate: Number(latest.estimate_hours ?? 0),
      actual: Number(latest.actual_hours ?? 0),
      fmt: v => v.toFixed(1) + 'h',
    },
    {
      label: 'Cost',
      estimate: Number(latest.estimate_cost ?? 0),
      actual: Number(latest.actual_cost ?? 0),
      fmt: v => moneyStr(v),
    },
  ];

  el.innerHTML = rows.map(row => {
    const scaleMax = Math.max(row.estimate, row.actual, 1) * 1.15;
    const actualPct = Math.min(100, (row.actual / scaleMax) * 100);
    const estimatePct = Math.min(100, (row.estimate / scaleMax) * 100);
    const usedPct = row.estimate > 0 ? (row.actual / row.estimate) * 100 : 0;
    const risk = computeRisk(usedPct, null);

    return `
      <div class="burn-row">
        <div class="burn-row-header">
          <span class="burn-label">${row.label}</span>
          <span class="burn-values">${row.fmt(row.actual)} of ${row.fmt(row.estimate)} estimated &middot; ${usedPct.toFixed(0)}%</span>
        </div>
        <div class="burn-track">
          <div class="burn-fill burn-fill-${risk}" style="width:${actualPct}%"></div>
          <div class="burn-marker" style="left:${estimatePct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function initNotes() {
  const textarea = document.getElementById('notesInput');
  const btn = document.getElementById('notesSaveBtn');
  const status = document.getElementById('notesStatus');

  btn.addEventListener('click', async () => {
    if (!currentJobNumber) return;
    btn.disabled = true;
    status.textContent = 'Saving…';
    try {
      const res = await fetch('api/note.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_number: currentJobNumber, notes: textarea.value }),
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

function renderStats(latest, risk) {
  const el = document.getElementById('statPanel');
  if (!latest) {
    el.innerHTML = '<div class="profit-tile"><span class="profit-label">No data yet</span></div>';
    return;
  }

  const hoursPct = latest.pct_actual_vs_estimate_hours;
  const hoursRisk = computeRisk(hoursPct, null);
  const marginRisk = computeRisk(null, latest.net_margin_pct);

  el.innerHTML = `
    <div class="profit-tile">
      <span class="profit-label">Quoted</span>
      <span class="profit-value">${moneyStr(latest.quoted_value)}</span>
    </div>
    <div class="profit-tile profit-tile-emphasis profit-tile-${risk}">
      <span class="profit-label">Net profit</span>
      <span class="profit-value ${latest.net_margin < 0 ? 'negative' : ''}">${moneyStr(latest.net_margin)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Net margin %</span>
      <span class="profit-value tile-${marginRisk}">${pctStr(latest.net_margin_pct)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Gross margin</span>
      <span class="profit-value">${moneyStr(latest.gross_margin)}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Hours (act/est)</span>
      <span class="profit-value">${latest.actual_hours ?? '—'} / ${latest.estimate_hours ?? '—'}</span>
    </div>
    <div class="profit-tile">
      <span class="profit-label">Hours used %</span>
      <span class="profit-value tile-${hoursRisk}">${pctStr(hoursPct)}</span>
    </div>
  `;
}

initNotes();
loadJob();
