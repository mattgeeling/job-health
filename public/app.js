async function loadJobs() {
  const res = await fetch('api/jobs.php');
  const { jobs } = await res.json();
  renderSummary(jobs);
  renderTable(jobs);
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
    return (b.pct_actual_vs_estimate_hours ?? 0) - (a.pct_actual_vs_estimate_hours ?? 0);
  });

  const body = document.getElementById('jobTableBody');
  body.innerHTML = sorted.map(j => `
    <tr>
      <td><span class="risk-dot ${j.risk}"></span></td>
      <td>
        <span class="job-number">${j.job_number}</span>
        <span class="job-title">${escapeHtml(j.title || '')}</span>
      </td>
      <td>${escapeHtml(j.client_name || '')}</td>
      <td>${escapeHtml(j.handler_name || '')}</td>
      <td>${j.date_due || '—'}</td>
      <td>${money(j.quoted_value)}</td>
      <td>${j.actual_hours ?? '—'} / ${j.estimate_hours ?? '—'}</td>
      <td>${pctChip(j.pct_actual_vs_estimate_hours, j.risk)}</td>
      <td class="${j.net_margin < 0 ? 'negative' : ''}">${money(j.net_margin)}</td>
      <td>${pct(j.net_margin_pct)}</td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadJobs();
