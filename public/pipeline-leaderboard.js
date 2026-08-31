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
    <tr class="job-row" data-href="pipeline.html?handler=${encodeURIComponent(h.handler_name)}">
      <td class="leaderboard-name">${escapeHtml(h.handler_name)}</td>
      <td class="leaderboard-count">${h.opportunity_count}</td>
      <td class="leaderboard-value">${money(h.total_value)}</td>
      <td>${h.no_value_count > 0 ? `<span class="pct-chip red">${h.no_value_count}</span>` : '—'}</td>
      <td>
        <textarea class="pipeline-notes-input pipeline-notes-input-autogrow" data-handler="${escapeHtml(h.handler_name)}" rows="1" placeholder="Add a note…">${escapeHtml(h.notes || '')}</textarea>
        <span class="pipeline-notes-status" data-status-for="${escapeHtml(h.handler_name)}"></span>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.pipeline-notes-input').forEach(autoGrow);
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function initRowNavigation() {
  const body = document.getElementById('leaderboardBody');
  body.addEventListener('click', (e) => {
    if (e.target.closest('textarea')) return;
    const row = e.target.closest('tr[data-href]');
    if (row) location.href = row.dataset.href;
  });
}

function initNotesSaving() {
  const body = document.getElementById('leaderboardBody');
  body.addEventListener('input', (e) => {
    if (!e.target.classList || !e.target.classList.contains('pipeline-notes-input')) return;
    autoGrow(e.target);
  });
  body.addEventListener('blur', async (e) => {
    if (!e.target.classList || !e.target.classList.contains('pipeline-notes-input')) return;
    const textarea = e.target;
    const handlerName = textarea.dataset.handler;
    const status = body.querySelector(`[data-status-for="${CSS.escape(handlerName)}"]`);
    if (status) status.textContent = 'Saving…';

    try {
      const res = await fetch('api/handler_note.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handler_name: handlerName, notes: textarea.value }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error();
      if (status) {
        status.textContent = 'Saved';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
    } catch (e) {
      if (status) status.textContent = 'Failed to save';
    }
  }, true);
}

loadLeaderboard();
initRowNavigation();
initNotesSaving();
