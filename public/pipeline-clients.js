function money(v) {
  if (v === null || v === undefined) return '—';
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const VALUE_BANDS = [
  { min: 100000, label: 'Above £100,000' },
  { min: 50000, label: '£50,000 – £100,000' },
  { min: 30000, label: '£30,000 – £50,000' },
  { min: 0, label: 'Below £30,000' },
];

function bandFor(value) {
  const v = Number(value || 0);
  return VALUE_BANDS.find(b => v >= b.min) || VALUE_BANDS[VALUE_BANDS.length - 1];
}

async function loadClients() {
  const res = await fetch('api/pipeline_clients.php');
  const { clients } = await res.json();

  const grid = document.getElementById('clientCardGrid');
  let lastBand = null;
  const html = [];

  for (const c of clients) {
    const band = bandFor(c.total_value);
    if (band.label !== lastBand) {
      html.push(`<div class="client-band-divider">${band.label}</div>`);
      lastBand = band.label;
    }
    html.push(`
      <a class="client-card" href="pipeline.html?client=${encodeURIComponent(c.client_name)}">
        <div class="client-card-logo">${escapeHtml(c.client_name.slice(0, 1).toUpperCase())}</div>
        <span class="client-card-name">${escapeHtml(c.client_name)}</span>
        <span class="client-card-value">${money(c.total_value)}</span>
        <span class="client-card-count">${c.opportunity_count} opportunit${c.opportunity_count === 1 ? 'y' : 'ies'}</span>
      </a>
    `);
  }

  grid.innerHTML = html.join('');
}

loadClients();
