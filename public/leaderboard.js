function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(0) + '%';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadLeaderboard() {
  const res = await fetch('api/leaderboard.php');
  const { handlers } = await res.json();

  const body = document.getElementById('leaderboardBody');
  body.innerHTML = handlers.map(h => `
    <tr class="job-row" onclick="location.href='dashboard.html?handler=${encodeURIComponent(h.handler_name)}'">
      <td><strong>${escapeHtml(h.handler_name)}</strong></td>
      <td>${h.job_count}</td>
      <td>${money(h.total_quoted)}</td>
      <td class="${h.total_net_margin < 0 ? 'negative' : ''}"><strong>${money(h.total_net_margin)}</strong></td>
      <td class="${h.blended_net_margin_pct !== null && h.blended_net_margin_pct < 0 ? 'negative' : ''}">${pct(h.blended_net_margin_pct)}</td>
      <td>${h.red_count > 0 ? `<span class="pct-chip red">${h.red_count}</span>` : '—'}</td>
      <td>${h.amber_count > 0 ? `<span class="pct-chip amber">${h.amber_count}</span>` : '—'}</td>
    </tr>
  `).join('');
}

loadLeaderboard();
