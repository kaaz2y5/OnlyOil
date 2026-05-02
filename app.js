const STORAGE_KEY = "onlyoil_specs_v1";
const THEME_KEY = "onlyoil_theme_v1";

const starterSpecs = [
  {
    id: "sample-2020-toyota-camry-25",
    year: "2020",
    make: "Toyota",
    model: "Camry",
    engine: "2.5L I4",
    oil: "0W-16 full synthetic",
    capacity: "Verify by engine; commonly listed around 4.8 qt with filter",
    filter: "Verify exact filter by engine/VIN before service",
    source: "Starter sample - verify before using",
    notes: "Use saved verified records for paid work. Sample entries are reminders, not a substitute for service data."
  },
  {
    id: "sample-2018-honda-accord-15",
    year: "2018",
    make: "Honda",
    model: "Accord",
    engine: "1.5L Turbo",
    oil: "0W-20 full synthetic",
    capacity: "Verify by engine; commonly listed around 3.7 qt with filter",
    filter: "Verify exact filter by engine/VIN before service",
    source: "Starter sample - verify before using",
    notes: "Turbo engines are sensitive to correct oil spec and interval. Confirm current service data."
  },
  {
    id: "sample-2021-ford-f150-50",
    year: "2021",
    make: "Ford",
    model: "F-150",
    engine: "5.0L V8",
    oil: "Verify current Ford spec by VIN",
    capacity: "Verify by engine/VIN",
    filter: "Verify exact filter by engine/VIN before service",
    source: "Starter sample - verify before using",
    notes: "F-150 capacities and filters vary heavily by engine and model year."
  }
];

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");
const vinPanel = document.querySelector("#vinPanel");
const vehiclePanel = document.querySelector("#vehiclePanel");
const addPanel = document.querySelector("#addPanel");
const statusCard = document.querySelector("#statusCard");
const vehicleCard = document.querySelector("#vehicleCard");
const savedList = document.querySelector("#savedList");
const savedItemTemplate = document.querySelector("#savedItemTemplate");
const jobNotes = document.querySelector("#jobNotes");
const themeToggle = document.querySelector("#themeToggle");

let specs = loadSpecs();
let currentVehicle = null;

init();

function init() {
  document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "light";
  renderSavedList();

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  vinPanel.addEventListener("submit", handleVinLookup);
  vehiclePanel.addEventListener("submit", handleVehicleLookup);
  addPanel.addEventListener("submit", handleAddSpec);
  document.querySelector("#copyJob").addEventListener("click", copyJobCard);
  document.querySelector("#exportSpecs").addEventListener("click", exportSpecs);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#importSpecs").addEventListener("change", importSpecs);
  document.querySelector("#quickSearch").addEventListener("input", handleQuickSearch);
  themeToggle.addEventListener("click", toggleTheme);
}

function setTab(name) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
}

async function handleVinLookup(event) {
  event.preventDefault();
  const vin = document.querySelector("#vinInput").value.trim().toUpperCase();

  if (vin.length !== 17) {
    showStatus("Check the VIN", "A VIN should be 17 characters. O, I, and Q are not used in VINs.");
    return;
  }

  showStatus("Decoding VIN", "Getting vehicle identity from the NHTSA decoder...");

  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`);
    if (!response.ok) throw new Error("VIN decoder request failed");
    const data = await response.json();
    const decoded = data.Results?.[0];
    if (!decoded || decoded.ErrorCode !== "0") {
      showStatus("VIN not decoded", decoded?.ErrorText || "The decoder did not return vehicle details.");
      return;
    }

    const vehicle = {
      year: decoded.ModelYear,
      make: decoded.Make,
      model: decoded.Model,
      engine: [decoded.DisplacementL ? `${decoded.DisplacementL}L` : "", decoded.EngineConfiguration || "", decoded.FuelTypePrimary || ""]
        .filter(Boolean)
        .join(" ")
    };

    currentVehicle = vehicle;
    fillVehicleForm(vehicle);
    const match = findBestSpec(vehicle);
    match ? showVehicleSpec(match, "VIN matched to saved spec") : showMissingSpec(vehicle);
  } catch (error) {
    showStatus("VIN decoder unavailable", "Internet may be off, or the NHTSA service did not respond. Try vehicle search or add a verified spec manually.");
  }
}

function handleVehicleLookup(event) {
  event.preventDefault();
  const vehicle = {
    year: document.querySelector("#yearInput").value.trim(),
    make: document.querySelector("#makeInput").value.trim(),
    model: document.querySelector("#modelInput").value.trim(),
    engine: document.querySelector("#engineInput").value.trim()
  };

  currentVehicle = vehicle;
  const match = findBestSpec(vehicle);
  match ? showVehicleSpec(match, "Saved catalog match") : showMissingSpec(vehicle);
}

function handleQuickSearch(event) {
  const query = event.target.value.trim();
  if (query.length < 2) {
    renderSavedList();
    return;
  }

  const matches = searchSpecs(query);
  renderSavedList(matches);

  if (matches.length === 1) {
    showVehicleSpec(matches[0], "Offline catalog match");
  } else if (matches.length > 1) {
    showStatus("Matches found", `${matches.length} saved specs match that search. Tap Use on the right record.`);
  } else {
    showStatus("No offline match", "That vehicle is not in your saved catalog yet. Add it once you verify the oil, capacity, and filter.");
  }
}

function handleAddSpec(event) {
  event.preventDefault();
  const spec = {
    id: crypto.randomUUID(),
    year: document.querySelector("#specYear").value.trim(),
    make: titleCase(document.querySelector("#specMake").value.trim()),
    model: titleCase(document.querySelector("#specModel").value.trim()),
    engine: document.querySelector("#specEngine").value.trim(),
    oil: document.querySelector("#specOil").value.trim(),
    capacity: document.querySelector("#specCapacity").value.trim(),
    filter: document.querySelector("#specFilter").value.trim(),
    source: document.querySelector("#specSource").value.trim() || "Verified by shop",
    notes: document.querySelector("#specNotes").value.trim()
  };

  specs = [spec, ...specs.filter((item) => item.id !== spec.id)];
  saveSpecs();
  renderSavedList();
  showVehicleSpec(spec, "New verified spec saved");
  addPanel.reset();
}

function findBestSpec(vehicle) {
  const exact = specs.find((spec) =>
    same(spec.year, vehicle.year) &&
    same(spec.make, vehicle.make) &&
    same(spec.model, vehicle.model) &&
    includesEither(spec.engine, vehicle.engine)
  );
  if (exact) return exact;

  return specs.find((spec) =>
    same(spec.year, vehicle.year) &&
    same(spec.make, vehicle.make) &&
    same(spec.model, vehicle.model)
  );
}

function searchSpecs(query) {
  const terms = cleanSearch(query).split(" ").filter(Boolean);
  return specs.filter((spec) => {
    const haystack = cleanSearch(`${spec.year} ${spec.make} ${spec.model} ${spec.engine} ${spec.oil} ${spec.filter}`);
    return terms.every((term) => haystack.includes(term));
  });
}

function showVehicleSpec(spec, label) {
  vehicleCard.classList.remove("hidden");
  statusCard.classList.add("hidden");

  document.querySelector("#matchType").textContent = label;
  document.querySelector("#vehicleTitle").textContent = `${spec.year} ${spec.make} ${spec.model}`;
  document.querySelector("#vehicleSubtitle").textContent = spec.engine || "Engine not specified";
  document.querySelector("#confidenceBadge").textContent = spec.source?.includes("Starter sample") ? "Verify" : "Saved";
  document.querySelector("#oilType").textContent = spec.oil;
  document.querySelector("#capacity").textContent = spec.capacity;
  document.querySelector("#filter").textContent = spec.filter;
  document.querySelector("#sourceLine").textContent = `Source: ${spec.source || "Not listed"}`;
  document.querySelector("#notesLine").textContent = spec.notes || "No extra notes saved.";

  currentVehicle = spec;
  jobNotes.value = buildJobText(spec);
}

function showMissingSpec(vehicle) {
  vehicleCard.classList.add("hidden");
  statusCard.classList.remove("hidden");
  showStatus(
    "No saved spec yet",
    `${vehicle.year || "Year"} ${vehicle.make || "Make"} ${vehicle.model || "Model"} ${vehicle.engine || ""} is not in your catalog. Verify the oil, capacity, and filter, then save it in Add Spec.`
  );
  prefillAddSpec(vehicle);
  setTab("add");
}

function showStatus(title, message) {
  statusCard.classList.remove("hidden");
  statusCard.innerHTML = `<p class="eyebrow">Status</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>`;
}

function fillVehicleForm(vehicle) {
  document.querySelector("#yearInput").value = vehicle.year || "";
  document.querySelector("#makeInput").value = vehicle.make || "";
  document.querySelector("#modelInput").value = vehicle.model || "";
  document.querySelector("#engineInput").value = vehicle.engine || "";
}

function prefillAddSpec(vehicle) {
  document.querySelector("#specYear").value = vehicle.year || "";
  document.querySelector("#specMake").value = vehicle.make || "";
  document.querySelector("#specModel").value = vehicle.model || "";
  document.querySelector("#specEngine").value = vehicle.engine || "";
}

function renderSavedList(items = specs) {
  savedList.innerHTML = "";
  items.forEach((spec) => {
    const node = savedItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("strong").textContent = `${spec.year} ${spec.make} ${spec.model}`;
    node.querySelector("span").textContent = `${spec.engine || "Engine not listed"} · ${spec.oil} · ${spec.capacity}`;
    node.querySelector("button").addEventListener("click", () => showVehicleSpec(spec, "Saved catalog match"));
    savedList.appendChild(node);
  });
}

function buildJobText(spec) {
  return [
    `${spec.year} ${spec.make} ${spec.model} ${spec.engine || ""}`.trim(),
    `Oil: ${spec.oil}`,
    `Capacity: ${spec.capacity}`,
    `Filter: ${spec.filter}`,
    spec.notes ? `Notes: ${spec.notes}` : "",
    `Source: ${spec.source || "Not listed"}`
  ].filter(Boolean).join("\n");
}

async function copyJobCard() {
  const lines = [
    document.querySelector("#customerName").value ? `Customer: ${document.querySelector("#customerName").value}` : "",
    document.querySelector("#mileage").value ? `Mileage: ${document.querySelector("#mileage").value}` : "",
    document.querySelector("#appointment").value ? `Appointment: ${document.querySelector("#appointment").value}` : "",
    jobNotes.value
  ].filter(Boolean);

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showStatus("Copied", "Job card copied to your clipboard.");
  } catch {
    showStatus("Copy blocked", "Your browser blocked clipboard access. Select the job notes and copy them manually.");
  }
}

function exportSpecs() {
  const blob = new Blob([JSON.stringify(specs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `onlyoil-specs-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const headers = ["year", "make", "model", "engine", "oil", "capacity", "filter", "source", "notes"];
  const rows = specs.map((spec) => headers.map((key) => csvCell(spec[key] || "")).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `onlyoil-specs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function importSpecs(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = file.name.toLowerCase().endsWith(".csv")
        ? parseCsv(reader.result)
        : JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Expected an array");
      specs = mergeSpecs(imported, specs);
      saveSpecs();
      renderSavedList();
      showStatus("Imported", `${imported.length} specs were imported into your catalog.`);
    } catch {
      showStatus("Import failed", "That file was not a valid OnlyOil specs export.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function mergeSpecs(imported, existing) {
  const byKey = new Map();
  [...imported, ...existing].forEach((spec) => {
    if (!spec.year || !spec.make || !spec.model) return;
    byKey.set(`${spec.year}-${clean(spec.make)}-${clean(spec.model)}-${clean(spec.engine)}`, {
      id: spec.id || crypto.randomUUID(),
      year: String(spec.year),
      make: spec.make,
      model: spec.model,
      engine: spec.engine || "",
      oil: spec.oil || "",
      capacity: spec.capacity || "",
      filter: spec.filter || "",
      source: spec.source || "",
      notes: spec.notes || ""
    });
  });
  return [...byKey.values()];
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);

  const headers = rows.shift()?.map((header) => cleanHeader(header)) || [];
  return rows.map((values) => {
    const spec = {};
    headers.forEach((header, index) => {
      spec[header] = values[index] || "";
    });
    return spec;
  });
}

function loadSpecs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : starterSpecs;
  } catch {
    return starterSpecs;
  }
}

function saveSpecs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(specs));
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
}

function same(a, b) {
  return clean(a) === clean(b);
}

function includesEither(a, b) {
  if (!a || !b) return true;
  return clean(a).includes(clean(b)) || clean(b).includes(clean(a));
}

function clean(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanSearch(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ");
}

function cleanHeader(value) {
  const key = clean(value);
  const aliases = {
    oiltype: "oil",
    oilweight: "oil",
    oilcapacity: "capacity",
    quarts: "capacity",
    oilfilter: "filter",
    filternumber: "filter",
    partnumber: "filter"
  };
  return aliases[key] || key;
}

function csvCell(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function titleCase(value) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
