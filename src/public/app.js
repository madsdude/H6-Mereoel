const products = [
  { sku: "ME-PILS-001", name: "Nordhavn Pilsner", type: "Flaske 33 cl", location: "A1-03", stock: 184, min: 80, capacity: 220, batch: "NP-2607" },
  { sku: "ME-IPA-014", name: "Humlebro IPA", type: "Dåse 44 cl", location: "B2-11", stock: 96, min: 120, capacity: 240, batch: "HI-2606" },
  { sku: "ME-STOUT-008", name: "Natport Stout", type: "Flaske 50 cl", location: "A3-02", stock: 42, min: 40, capacity: 140, batch: "NS-2605" },
  { sku: "ME-SOUR-021", name: "Rabarber Sour", type: "Dåse 33 cl", location: "C1-09", stock: 31, min: 70, capacity: 180, batch: "RS-2607" },
  { sku: "ME-KEG-030", name: "MEREØL Lager", type: "Fustage 20 l", location: "KØL-04", stock: 18, min: 12, capacity: 32, batch: "ML-2607" },
  { sku: "ME-KEG-031", name: "MEREØL IPA", type: "Fustage 30 l", location: "KØL-06", stock: 7, min: 10, capacity: 24, batch: "MI-2606" },
  { sku: "ME-GLAS-002", name: "Smageglas", type: "Emballage", location: "D4-01", stock: 620, min: 250, capacity: 800, batch: "SG-2604" },
  { sku: "ME-KASSE-010", name: "Transportkasse", type: "Emballage", location: "D1-08", stock: 58, min: 70, capacity: 180, batch: "TK-2603" }
];

const statusLabels = {
  ok: "OK",
  low: "Lav",
  critical: "Kritisk"
};

const state = {
  query: "",
  status: "all"
};

const formatter = new Intl.NumberFormat("da-DK");

function getStatus(item) {
  if (item.stock <= item.min * 0.5) return "critical";
  if (item.stock < item.min) return "low";
  return "ok";
}

function getFilteredProducts() {
  const query = state.query.trim().toLowerCase();

  return products.filter((item) => {
    const status = getStatus(item);
    const matchesStatus = state.status === "all" || status === state.status;
    const matchesQuery = !query || [item.sku, item.name, item.type, item.location, item.batch]
      .join(" ")
      .toLowerCase()
      .includes(query);

    return matchesStatus && matchesQuery;
  });
}

function renderSummary() {
  const totalUnits = products.reduce((sum, item) => sum + item.stock, 0);
  const totalCapacity = products.reduce((sum, item) => sum + item.capacity, 0);
  const attentionLines = products.filter((item) => getStatus(item) !== "ok").length;
  const capacityUsed = Math.round((totalUnits / totalCapacity) * 100);

  document.querySelector("#totalUnits").textContent = formatter.format(totalUnits);
  document.querySelector("#totalLines").textContent = formatter.format(products.length);
  document.querySelector("#attentionLines").textContent = formatter.format(attentionLines);
  document.querySelector("#capacityUsed").textContent = `${capacityUsed}%`;
}

function renderRows() {
  const rows = getFilteredProducts();
  const tbody = document.querySelector("#inventoryRows");
  document.querySelector("#resultCount").textContent = `${formatter.format(rows.length)} viste linjer`;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td class="empty-row" colspan="6">Ingen varer matcher filteret.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((item) => {
    const status = getStatus(item);
    const fill = Math.min(Math.round((item.stock / item.capacity) * 100), 100);

    return `
      <tr>
        <td>
          <span class="product-name">${item.name}</span>
          <span class="sku">${item.sku}</span>
        </td>
        <td>${item.type}</td>
        <td>${item.location}</td>
        <td class="stock-cell">
          <div class="stock-line">
            <strong>${formatter.format(item.stock)}</strong>
            <small>min. ${formatter.format(item.min)}</small>
          </div>
          <div class="stock-bar" aria-hidden="true"><span style="--fill: ${fill}%"></span></div>
        </td>
        <td><span class="status ${status}">${statusLabels[status]}</span></td>
        <td>${item.batch}</td>
      </tr>
    `;
  }).join("");
}

function renderTimestamp() {
  const now = new Date();
  const timestamp = document.querySelector("#lastUpdated");
  timestamp.dateTime = now.toISOString();
  timestamp.textContent = `Opdateret ${new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(now)}`;
}

function bindControls() {
  document.querySelector("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderRows();
  });

  document.querySelector("#statusFilter").addEventListener("change", (event) => {
    state.status = event.target.value;
    renderRows();
  });
}

renderSummary();
renderRows();
renderTimestamp();
bindControls();
