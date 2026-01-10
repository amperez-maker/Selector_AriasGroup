export async function initAriasFlow() {
  const root = document.querySelector("#arias-root");
  if (!root) return;

  // Carga config Arias
  const cfg = await fetch("./data/arias-systems.json").then(r => r.json());

  // Construye UI base
  root.innerHTML = `
    <div class="ag-card">
      <h2>Selector Arias Group</h2>
      <p class="muted">Familia → Sistema → Variante → Calcular</p>

      <div class="ag-grid">
        <div>
          <label>Familia</label>
          <select id="ag-familia"></select>
        </div>

        <div>
          <label>Sistema Arias</label>
          <select id="ag-sistema"></select>
        </div>

        <div>
          <label>Variante (sistema base)</label>
          <select id="ag-variante"></select>
        </div>
      </div>

      <div class="ag-actions">
        <button id="ag-calcular" class="primary">Calcular</button>
        <button id="ag-volver" class="ghost">Ver selector antiguo</button>
      </div>
    </div>
  `;

  const familiaSel = root.querySelector("#ag-familia");
  const sistemaSel = root.querySelector("#ag-sistema");
  const varianteSel = root.querySelector("#ag-variante");
  const btnCalc = root.querySelector("#ag-calcular");
  const btnVolver = root.querySelector("#ag-volver");

  // Helpers
  const setOptions = (sel, items, getValue, getLabel) => {
    sel.innerHTML = "";
    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = getValue(it);
      opt.textContent = getLabel(it);
      sel.appendChild(opt);
    }
  };

  // 1) Poblar Familias
  setOptions(familiaSel, cfg.familias, f => f.id, f => f.nombre);

  const getFamilia = () => cfg.familias.find(f => f.id === familiaSel.value);

  function refreshSistemas() {
    const fam = getFamilia();
    setOptions(sistemaSel, fam.sistemas, s => s.id, s => s.nombre);
    refreshVariantes();
  }

  function refreshVariantes() {
    const fam = getFamilia();
    const sis = fam.sistemas.find(s => s.id === sistemaSel.value);

    // Aquí, por ahora mostramos los systemIds directos.
    // Luego: lo traducimos a "variantes" bonitas (70/90, 1/2 capas, etc.) usando el index.
    const index = window.__sistemasIndex || [];

const variantes = sis.allowedSystemIds.map(id => {
  const meta = index.find(s => s.id === id);
  if (!meta) return { id, label: id };

  const placas = meta.capas_por_cara * 2;
  const placaTxt = meta.placa_tipo || "STD";
  const hmax = meta.altura_max ? `H máx ${meta.altura_max} m` : "";

  return {
    id,
    label: `${meta.perfil_mm} mm · ${placas} placas · ${placaTxt} · ${hmax}`
  };
});

setOptions(
  varianteSel,
  variantes,
  v => v.id,
  v => v.label
);

  }

  familiaSel.addEventListener("change", refreshSistemas);
  sistemaSel.addEventListener("change", refreshVariantes);

  refreshSistemas();

  // Calcular usando el motor existente
  btnCalc.addEventListener("click", () => {
    const systemId = varianteSel.value;

    if (!window.AriasEngine?.selectAndCalculateBySystemId) {
      alert("No encuentro el motor (AriasEngine). En el siguiente paso lo exponemos sin romper nada.");
      return;
    }

    window.AriasEngine.selectAndCalculateBySystemId(systemId);
  });

  btnVolver.addEventListener("click", () => {
    document.querySelector("#arias-root").style.display = "none";
    const legacy = document.querySelector("#legacy-root");
    if (legacy) legacy.style.display = "";
  });
}
