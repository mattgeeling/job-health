function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadLeaderboard() {
  const res = await fetch('api/pipeline_leaderboard.php');
  const { handlers } = await res.json();

  const body = document.getElementById('leaderboardBody');
  body.innerHTML = handlers.map(h => `
    <tr class="job-row" onclick="location.href='pipeline.html?handler=${encodeURIComponent(h.handler_name)}'">
      <td><strong>${escapeHtml(h.handler_name)}</strong></td>
      <td>${h.opportunity_count}</td>
      <td><strong>${money(h.total_value)}</strong></td>
      <td>${h.no_value_count > 0 ? `<span class="pct-chip red">${h.no_value_count}</span>` : '—'}</td>
    </tr>
  `).join('');
}

loadLeaderboard();
