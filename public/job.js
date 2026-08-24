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
  renderChart(snapshots);
  document.getElementById('notesInput').value = job.notes || '';
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
      <span class="profit-label">Net margin</span>
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

function renderChart(snapshots) {
  const note = document.getElementById('chartNote');
  const canvas = document.getElementById('trendChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const padL = 50, padR = 20, padT = 20, padB = 30;

  ctx.clearRect(0, 0, W, H);

  if (snapshots.length < 2) {
    note.textContent = 'Trend builds up as daily syncs accumulate — only ' +
      snapshots.length + ' day' + (snapshots.length === 1 ? '' : 's') + ' of history so far.';
  } else {
    note.textContent = '';
  }

  if (snapshots.length === 0) return;

  const marginVals = snapshots.map(s => Number(s.net_margin_pct ?? 0));
  const hoursVals = snapshots.map(s => Number(s.pct_actual_vs_estimate_hours ?? 0));
  const allVals = [...marginVals, ...hoursVals, 0, 100];
  const minY = Math.min(...allVals) - 10;
  const maxY = Math.max(...allVals) + 10;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xFor = i => snapshots.length === 1
    ? padL + plotW / 2
    : padL + (i / (snapshots.length - 1)) * plotW;
  const yFor = v => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;

  // axes
  ctx.strokeStyle = '#e4e1da';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // zero-margin reference line
  ctx.strokeStyle = '#e4e1da';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, yFor(0));
  ctx.lineTo(padL + plotW, yFor(0));
  ctx.stroke();
  ctx.setLineDash([]);

  function drawLine(vals, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xFor(i), y = yFor(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = color;
    vals.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(xFor(i), yFor(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine(marginVals, '#2d5c4d');
  drawLine(hoursVals, '#a3691a');

  // x labels (first/last date)
  ctx.fillStyle = '#6b7280';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(snapshots[0].snapshot_date, padL, H - 8);
  ctx.textAlign = 'right';
  ctx.fillText(snapshots.at(-1).snapshot_date, padL + plotW, H - 8);
}

initNotes();
loadJob();
