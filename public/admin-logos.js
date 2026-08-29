function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadAdmin() {
  const [clientsRes, logosRes] = await Promise.all([
    fetch('api/pipeline_clients.php'),
    fetch('api/client_logos.php'),
  ]);
  const { clients } = await clientsRes.json();
  const { logos } = await logosRes.json();

  const grid = document.getElementById('adminLogoGrid');
  grid.innerHTML = clients.map(c => {
    const filename = logos[c.client_name];
    const preview = filename
      ? `<img class="admin-logo-preview" src="client-logos/${encodeURIComponent(filename)}?t=${Date.now()}" alt="${escapeHtml(c.client_name)}">`
      : `<div class="admin-logo-placeholder">${escapeHtml(c.client_name.slice(0, 1).toUpperCase())}</div>`;

    return `
      <div class="admin-logo-card" data-client="${escapeHtml(c.client_name)}">
        ${preview}
        <span class="admin-logo-name">${escapeHtml(c.client_name)}</span>
        <input type="file" class="admin-logo-file" accept=".png,.jpg,.jpeg,.svg,.webp">
        <span class="admin-logo-status"></span>
      </div>
    `;
  }).join('');
}

function initUploads() {
  const grid = document.getElementById('adminLogoGrid');
  grid.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('admin-logo-file')) return;
    const input = e.target;
    const card = input.closest('.admin-logo-card');
    const clientName = card.dataset.client;
    const status = card.querySelector('.admin-logo-status');
    const file = input.files[0];
    if (!file) return;

    status.textContent = 'Uploading…';
    const formData = new FormData();
    formData.append('client_name', clientName);
    formData.append('logo', file);

    try {
      const res = await fetch('api/upload_client_logo.php', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || 'Upload failed');

      const preview = card.querySelector('.admin-logo-preview, .admin-logo-placeholder');
      const img = document.createElement('img');
      img.className = 'admin-logo-preview';
      img.src = `client-logos/${encodeURIComponent(result.filename)}?t=${Date.now()}`;
      img.alt = clientName;
      preview.replaceWith(img);

      status.textContent = 'Saved';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (err) {
      status.textContent = 'Upload failed — try again';
    }
  });
}

initUploads();
loadAdmin();
