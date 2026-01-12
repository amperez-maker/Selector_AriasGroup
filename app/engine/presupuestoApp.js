// Helpers de formato numérico ES-ES
function fmtNumber(value, decimals = 2) {
const n = Number(value);
if (!Number.isFinite(n)) return "-";
return n.toLocaleString("es-ES", {
minimumFractionDigits: decimals,
maximumFractionDigits: decimals
});
}
function fmtEUR(value) {
const n = Number(value);
if (!Number.isFinite(n)) return "- €";
return n.toLocaleString("es-ES", {
minimumFractionDigits: 2,
maximumFractionDigits: 2
}) + " €";
}
// Mantener EUR para compatibilidad temporal (deprecated)
const EUR = n => fmtEUR(n);
// Logo corporativo (usar PNG oficial con “arias”)
// Logo corporativo (versión recortada/apaisada para PDF y cabecera)
const LOGO_URL = './assets/logo-arias-wide.png';
// Schema adapter: compatibilidad v1/v2
function normalizeSystemToV1(sys) {
if (sys.capas !== undefined && sys.placa !== undefined && typeof sys.placa === 'string') {
return sys;
}
const placasStr = Array.isArray(sys.placas) && sys.placas.length > 0
? sys.placas.map(p => `${p.tipo}-${p.espesor_mm}`).join('+')
: 'STD-13';
return {
id: sys.id,
tipo: sys.tipo,
perfil: sys._perfil_deprecated || (sys.perfil_mm ? `${sys.perfil_mm} ${sys.zincado || 'Z1'}` : '70 Z1'),
modulacion_mm: sys.modulacion_mm || 600,
placa: placasStr,
capas: sys.capas_por_cara || sys.capas || 1,
Hmax_m: sys.Hmax_m,
csv: sys.csv,
name: sys.nombre_comercial || sys.name || sys.id,
placas: sys.placas,
capas_por_cara: sys.capas_por_cara,
estructura: sys.estructura,
perfil_mm: sys.perfil_mm,
zincado: sys.zincado
};
}
async function loadIndex(){
const res = await fetch('data/sistemas/sistemas-index.json');
const idx = await res.json();
const systems = idx.systems || [];
return systems.map(normalizeSystemToV1);
}
function detectarFormatoCSV(header) {
const h = header.map(x => x.trim().toLowerCase());
if (h.includes('precio_catalogo_almeria') && h.includes('familia_precio')) {
return 'nuevo';
}
if (h.includes('rendimiento_m2') || h.includes('coef')) {
return 'sistema';
}
return 'legacy';
}
function detectarFamilia(concepto, codigo) {
const upper = (concepto || '').toUpperCase();
const codUpper = (codigo || '').toUpperCase();
if (upper.includes('PLACA') || upper.includes('GYPSOTECH') || codUpper.startsWith('L00')) {
return 'PLACA';
}
return 'RESTO';
}
let catalogByCode = new Map();
let catalogLoaded = false;
function parseCatalogCSV(text) {
const lines = text.trim().split(/\r?\n/).filter(Boolean);
if (lines.length === 0) return new Map();
const header = lines.shift().split(',');
const index = {};
header.forEach((h, i) => {
index[h.trim().toLowerCase()] = i;
});
const map = new Map();
lines.forEach(line => {
if (!line.trim()) return;
const cols = line.split(',');
const codigo = (cols[index.codigo] || '').trim();
if (!codigo) return;
map.set(codigo, {
codigo,
concepto: (cols[index.concepto] || '').trim(),
unidad: (cols[index.unidad] || '').trim(),
precio_catalogo_almeria: (cols[index.precio_catalogo_almeria] || '').trim(),
familia_precio: (cols[index.familia_precio] || '').trim()
});
});
return map;
}
async function ensureCatalogLoaded() {
if (catalogLoaded) return;
const res = await fetch('data/catalogo_materiales_sistemas_arias_selector.csv');
if (!res.ok) throw new Error('No se pudo cargar catalogo_materiales_sistemas_arias_selector.csv');
const text = await res.text();
catalogByCode = parseCatalogCSV(text);
catalogLoaded = true;
}
function esPlaca(sku) {
return typeof sku === "string" && sku.toUpperCase().startsWith("L00");
}
function esPerfileria(sku) {
if (typeof sku !== "string") return false;
const skuUpper = sku.toUpperCase();
return skuUpper.startsWith("C") || skuUpper.startsWith("U") || skuUpper.startsWith("E");
}
// ========== FLUJO DE SELECCIÓN PASO A PASO ==========
let systemsIndexEnriched = [];
let systemsIndexBase = [];
let sistemaActualMeta = null;
let selectionFlowInitialized = false;
function setStepVisible(stepId, visible) {
const el = document.getElementById(stepId);
if (!el) {
console.error(`Elemento ${stepId} no encontrado`);
return;
}
// Los contenedores siempre están visibles ahora, solo habilitamos/deshabilitamos los selects
const select = el.querySelector('select');
if (select) {
if (visible) {
select.disabled = false;
} else {
select.disabled = true;
if (select.id !== 'selectAmbiente') { // No resetear el primer selector
select.value = '';
}
}
}
}
function clearSelectionResult() {
const resultadoContainer = document.getElementById('resultadoContainer');
if (resultadoContainer) resultadoContainer.innerHTML = '';
setStepVisible('stepResult', false);
sistemaActualMeta = null;
}
function hideSistemaOutputs() {
const resumen = document.getElementById('resumenSistema');
const ficha = document.getElementById('fichaTecnica');
const desc = document.getElementById('descripcionTecnica');
if (resumen) resumen.style.display = 'none';
if (ficha) ficha.style.display = 'none';
if (desc) desc.style.display = 'none';
}
async function loadIndexEnriched() {
const res = await fetch('data/sistemas/sistemas-index.enriched.json');
const idx = await res.json();
return idx.systems || [];
}
async function loadIndexBase() {
const res = await fetch('data/sistemas/sistemas-index.json');
const idx = await res.json();
// Build the base systems array
const systems = idx.systems || [];
// Expose the base index globally so that other modules (e.g. the Arias selector UI)
// can lookup system metadata by id without refetching the index.  Without this
// assignment, window.__sistemasIndex would be undefined and the selector
// would not be able to render human‑friendly variant names or locate the
// complete system objects when calculating directly from a system ID.
window.__sistemasIndex = systems;
return systems;
}
document.addEventListener('DOMContentLoaded', async () => {
if (systemsIndexEnriched.length === 0) {
systemsIndexEnriched = await loadIndexEnriched();
}
if (systemsIndexBase.length === 0) {
systemsIndexBase = await loadIndexBase();
}
initSelectionFlow();
});
async function cargarCSV(systemId) {
if (systemsIndexBase.length === 0) {
systemsIndexBase = await loadIndexBase();
}
const sistema = systemsIndexBase.find(s => s.id === systemId);
if (!sistema) {
throw new Error(`Sistema ${systemId} no encontrado`);
}
sistemaActualMeta = sistema;
await calcularYMostrarConSistema(sistema, false);
}
async function calcularYMostrarConSistema(meta, addToProject = false) {
const area = toNum(document.getElementById('area').value);
const waste = toNum(document.getElementById('waste').value);
const logisticaPct = toNum(document.getElementById('logisticaPct').value);
const margenPct = toNum(document.getElementById('margenPct').value);
const incoterm = document.getElementById('incoterm').value;
if (!meta || area <= 0) {
document.getElementById('resumenSistema').style.display = 'none';
document.getElementById('fichaTecnica').style.display = 'none';
document.getElementById('descripcionTecnica').style.display = 'none';
return null;
}
renderFichaTecnica(meta);
renderDescripcionTecnica(meta);
await ensureCatalogLoaded();
const csvText = await loadCSV(meta.csv);
const rows = parseCSV(csvText);
const tbody = document.querySelector('#tbl tbody');
tbody.innerHTML = '';
let costeNetoSistema = 0;
const rowsData = [];
for(const r of rows){
try {
const sku = (r.codigo || r.sku || '').toString();
const catalogEntry = catalogByCode.get(sku) || {};
const concepto = r.concepto || catalogEntry.concepto || '';
const unidad = r.unidad || catalogEntry.unidad || '';
const precioCatalogo = toNum(catalogEntry.precio_catalogo_almeria || r.precio_catalogo_almeria);
const familia = (catalogEntry.familia_precio || r.familia_precio || detectarFamilia(concepto, sku)).trim().toUpperCase();
if (!precioCatalogo) {
throw new Error(`Falta precio_catalogo_almeria para ${sku || concepto}`);
}
if (!familia || (familia !== 'PLACA' && familia !== 'RESTO')) {
throw new Error(`Falta o inválida familia_precio para ${sku || concepto}`);
}
const dtoDistribuidorPct = familia === 'PLACA' ? 60 : 55;
const precioNeto = precioCatalogo * (1 - dtoDistribuidorPct / 100);
const rendimiento = toNum(r.rendimiento_m2);
const aplicarDesperdicio = esPlaca(sku) || esPerfileria(sku);
const factorDesperdicio = aplicarDesperdicio ? (1 + waste/100) : 1;
const qty = area * rendimiento * factorDesperdicio;
const importeNeto = qty * precioNeto;
costeNetoSistema += importeNeto;
rowsData.push({
...r,
concepto,
unidad,
codigo: sku,
precioCatalogo,
familia,
dtoDistribuidorPct,
precioNeto,
rendimiento,
qty,
importeNeto,
aplicarDesperdicio
});
const tr = document.createElement('tr');
const decimalsQty = unidad === 'ud' ? 0 : 3;
tr.innerHTML = `
<td data-label="Descripción">${concepto}</td>
<td class="num" data-label="Código / SKU">${sku}</td>
<td class="num" data-label="Unidad de venta">${unidad}</td>
<td class="num" data-label="Precio cat. (€)">${fmtEUR(precioCatalogo)}</td>
<td class="num" data-label="Dto. distrib. %">${dtoDistribuidorPct}%</td>
<td class="num" data-label="Precio neto (€)">${fmtEUR(precioNeto)}</td>
<td class="num" data-label="Rendimiento (coef.)">${fmtNumber(rendimiento, 2)}</td>
<td class="num" data-label="Cantidad requerida">${fmtNumber(qty, decimalsQty)}</td>
<td class="num" data-label="Coste neto (€)">${fmtEUR(importeNeto)}</td>
`;
tbody.appendChild(tr);
} catch(err) {
console.error('Error procesando fila:', err, r);
}
}
const costeTotalSistema = costeNetoSistema * (1 + logisticaPct / 100);
const precioVentaSistema = costeTotalSistema / (1 - margenPct / 100);
const precioVentaM2 = precioVentaSistema / area;
document.getElementById('resumenCosteNeto').textContent = fmtEUR(costeNetoSistema);
document.getElementById('resumenLogistica').textContent = `${incoterm} ${fmtNumber(logisticaPct, 1)}% (${fmtEUR(costeTotalSistema - costeNetoSistema)})`;
document.getElementById('resumenCosteTotal').textContent = fmtEUR(costeTotalSistema);
document.getElementById('resumenMargen').textContent = `${fmtNumber(margenPct, 1)}%`;
document.getElementById('resumenIncotermLabel').textContent = incoterm;
document.getElementById('resumenVentaM2').textContent = fmtEUR(precioVentaM2);
document.getElementById('resumenTotal').textContent = fmtEUR(precioVentaSistema);
document.getElementById('resumenSistema').style.display = 'block';
const result = {
system: meta.id,
systemName: meta.nombre_comercial || meta.id,
area,
waste,
incoterm,
logisticaPct,
margenPct,
costeNetoSistema,
costeTotalSistema,
precioVentaSistema,
costeTotalM2: costeTotalSistema / area,
ventaM2: precioVentaM2,
rows: rowsData,
meta
};
if(addToProject){
proyecto.push(result);
renderProyecto();
}
return result;
}
// ✅ FUNCIÓN ACTUALIZADA: updateElementoOptions
async function updateElementoOptions(ambiente) {
const selectElemento = document.getElementById('selectElemento');
const selectPlaca = document.getElementById('selectPlaca');
const selectEstructura = document.getElementById('selectEstructura');
const selectCapas = document.getElementById('selectCapas');
if (!selectElemento) return;
if (systemsIndexEnriched.length === 0) {
systemsIndexEnriched = await loadIndexEnriched();
}
const sistemasFiltrados = systemsIndexEnriched.filter(sys => {
if (!sys.ambiente_tags?.length) return false;
return sys.ambiente_tags.includes(ambiente);
});
const elementosUnicos = new Set();
sistemasFiltrados.forEach(sys => {
const elem = sys.elemento?.toUpperCase() || sys.tipo?.toUpperCase();
if (elem && ['MURO', 'TRASDOSADO', 'TECHO', 'EXTERIOR'].includes(elem)) {
elementosUnicos.add(elem);
}
});
const orden = ['MURO', 'TRASDOSADO', 'TECHO', 'EXTERIOR'];
const elementosOrdenados = Array.from(elementosUnicos).sort((a, b) =>
(orden.indexOf(a) === -1 ? 99 : orden.indexOf(a)) - (orden.indexOf(b) === -1 ? 99 : orden.indexOf(b))
);
selectElemento.innerHTML = '<option value="">Seleccionar...</option>';
elementosOrdenados.forEach(elem => {
const opt = document.createElement('option');
opt.value = elem;
if (elem === 'EXTERIOR' && ambiente === 'semi-intemperie') {
opt.textContent = 'Semi-intemperie (fachada ligera)';
} else {
opt.textContent = elem.charAt(0) + elem.slice(1).toLowerCase();
}
selectElemento.appendChild(opt);
});
selectElemento.disabled = elementosOrdenados.length === 0;
[selectPlaca, selectEstructura, selectCapas].forEach(sel => {
if (sel) {
sel.innerHTML = '<option value="">Seleccionar...</option>';
sel.disabled = true;
}
});
}
async function filtrarYMostrarSistemas() {
const selectAmbiente = document.getElementById('selectAmbiente');
const selectElemento = document.getElementById('selectElemento');
const selectPlaca = document.getElementById('selectPlaca');
const selectEstructura = document.getElementById('selectEstructura');
const selectCapas = document.getElementById('selectCapas');
if (!selectAmbiente || !selectElemento || !selectPlaca || !selectEstructura || !selectCapas) return;
const ambiente = selectAmbiente.value;
const elemento = selectElemento.value;
const placa = selectPlaca.value;
const estructura = selectEstructura.value;
const capas = selectCapas.value;
if (!ambiente || !elemento || !placa || !estructura || !capas) {
clearSelectionResult();
hideSistemaOutputs();
return;
}
if (systemsIndexEnriched.length === 0) systemsIndexEnriched = await loadIndexEnriched();
if (systemsIndexBase.length === 0) systemsIndexBase = await loadIndexBase();
const sistemasFiltrados = systemsIndexEnriched.filter(sys => {
if (!sys.ambiente_tags?.length) return false;
let matchAmbiente = false;
if (ambiente === 'seco') matchAmbiente = sys.ambiente_tags.includes('seco');
else if (ambiente === 'humedo') matchAmbiente = sys.ambiente_tags.includes('humedo');
else if (ambiente === 'semi-intemperie') matchAmbiente = sys.ambiente_tags.includes('semi-intemperie');
if (!matchAmbiente) return false;
const sysElemento = sys.elemento || sys.tipo;
if (sysElemento !== elemento) return false;
const placaTipos = sys.placa_tipos || (sys.placas ? sys.placas.map(p => p.tipo) : []);
if (!placaTipos.includes(placa)) return false;
const estructuraTipo = sys.estructura_tipo || sys.estructura;
if (estructura.includes('TC')) {
if (estructuraTipo !== 'tc' && !estructuraTipo.startsWith('tc')) return false;
const perfil = estructura.match(/TC(\d+)/)?.[1];
if (perfil && sys.perfil_mm != perfil) return false;
} else if (estructura === 'Ω35') {
if (estructuraTipo !== 'omega') return false;
if (sys.perfil_mm !== 35) return false;
} else if (estructura.includes('Z2')) {
if (sys.zincado !== 'Z2') return false;
const perfil = estructura.match(/(\d+)/)?.[1];
if (perfil && sys.perfil_mm != perfil) return false;
} else {
const perfil = estructura.match(/(\d+)/)?.[1];
if (perfil && sys.perfil_mm != perfil) return false;
if (estructura.includes('Z2') && sys.zincado !== 'Z2') return false;
if (estructura.includes('Z1') && sys.zincado !== 'Z1') return false;
}
if (sys.capas_por_cara != capas) return false;
if (sys.modulacion_mm != 600) return false;
return true;
});
const resultadoContainer = document.getElementById('resultadoContainer');
const stepResult = document.getElementById('stepResult');
if (sistemasFiltrados.length === 0) {
resultadoContainer.innerHTML = '<div style="padding: 0.75rem; background: #fee; color: #c33; border-radius: 4px;">No hay sistemas disponibles para esta combinación.</div>';
stepResult.style.display = 'block';
sistemaActualMeta = null;
return;
}
if (sistemasFiltrados.length === 1) {
const sistemaEnriched = sistemasFiltrados[0];
const sistemaBase = systemsIndexBase.find(s => s.id === sistemaEnriched.id);
if (sistemaBase) {
sistemaActualMeta = sistemaBase;
resultadoContainer.innerHTML = `<div style="padding: 0.75rem; background: #d4edda; color: #155724; border-radius: 4px; font-weight: 600;">Sistema seleccionado: ${sistemaBase.nombre_comercial || sistemaBase.id}</div>`;
stepResult.style.display = 'block';
await cargarCSV(sistemaBase.id);
}
} else {
let html = '<div style="font-weight: 600; margin-bottom: 0.5rem;">Selecciona un sistema:</div>';
html += '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
sistemasFiltrados.forEach(sysEnriched => {
const sys = systemsIndexBase.find(s => s.id === sysEnriched.id);
const nombre = sys ? (sys.nombre_comercial || sys.id) : (sysEnriched.nombre_comercial || sysEnriched.id);
html += `<div style="border: 1px solid #ddd; padding: 0.75rem; border-radius: 4px; background: #fff; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#fff'" onclick="seleccionarSistemaFinal('${sysEnriched.id}')">
<div style="font-weight: 600; margin-bottom: 0.25rem;">${nombre}</div>
<button style="padding: 0.5rem 1rem; background: #1050B0; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">Seleccionar</button>
</div>`;
});
html += '</div>';
resultadoContainer.innerHTML = html;
stepResult.style.display = 'block';
sistemaActualMeta = null;
}
}
window.seleccionarSistemaFinal = async function(systemId) {
await cargarCSV(systemId);
}
async function updatePlacaOptions(ambiente, elemento) {
const selectPlaca = document.getElementById('selectPlaca');
const selectEstructura = document.getElementById('selectEstructura');
const selectCapas = document.getElementById('selectCapas');
if (!selectPlaca) return;
if (systemsIndexEnriched.length === 0) systemsIndexEnriched = await loadIndexEnriched();
const sistemasFiltrados = systemsIndexEnriched.filter(sys => {
if (!sys.ambiente_tags?.length) return false;
let matchAmbiente = false;
if (ambiente === 'seco') matchAmbiente = sys.ambiente_tags.includes('seco');
else if (ambiente === 'humedo') matchAmbiente = sys.ambiente_tags.includes('humedo');
else if (ambiente === 'semi-intemperie') matchAmbiente = sys.ambiente_tags.includes('semi-intemperie');
if (!matchAmbiente) return false;
const sysElemento = sys.elemento || sys.tipo;
return sysElemento === elemento;
});
const placasUnicas = new Set();
sistemasFiltrados.forEach(sys => {
if (sys.placa_tipos && Array.isArray(sys.placa_tipos)) {
sys.placa_tipos.forEach(tipo => placasUnicas.add(tipo));
} else if (sys.placas && Array.isArray(sys.placas)) {
sys.placas.forEach(p => {
if (p.tipo) placasUnicas.add(p.tipo);
});
}
});
const ordenPlacas = ['STD', 'AQUA', 'LIGNUM', 'EXTERNA_LIGHT'];
const placasOrdenadas = Array.from(placasUnicas).sort((a, b) => {
const idxA = ordenPlacas.indexOf(a); const idxB = ordenPlacas.indexOf(b);
if (idxA === -1 && idxB === -1) return a.localeCompare(b);
if (idxA === -1) return 1;
if (idxB === -1) return -1;
return idxA - idxB;
});
selectPlaca.innerHTML = '<option value="">Seleccionar...</option>';
placasOrdenadas.forEach(placa => {
const option = document.createElement('option');
option.value = placa;
option.textContent = placa;
selectPlaca.appendChild(option);
});
selectPlaca.disabled = placasOrdenadas.length === 0;
if (selectEstructura) {
selectEstructura.innerHTML = '<option value="">Seleccionar...</option>';
selectEstructura.disabled = true;
}
if (selectCapas) {
selectCapas.innerHTML = '<option value="">Seleccionar...</option>';
selectCapas.disabled = true;
}
}
// ✅ FUNCIÓN ACTUALIZADA: updateEstructuraOptions (añade espacio)
async function updateEstructuraOptions(ambiente, elemento, placa) {
const selectEstructura = document.getElementById('selectEstructura');
const selectCapas = document.getElementById('selectCapas');
if (!selectEstructura) return;
if (systemsIndexEnriched.length === 0) systemsIndexEnriched = await loadIndexEnriched();
const sistemasFiltrados = systemsIndexEnriched.filter(sys => {
if (!sys.ambiente_tags?.length) return false;
let matchAmbiente = false;
if (ambiente === 'seco') matchAmbiente = sys.ambiente_tags.includes('seco');
else if (ambiente === 'humedo') matchAmbiente = sys.ambiente_tags.includes('humedo');
else if (ambiente === 'semi-intemperie') matchAmbiente = sys.ambiente_tags.includes('semi-intemperie');
if (!matchAmbiente) return false;
const sysElemento = sys.elemento || sys.tipo;
if (sysElemento !== elemento) return false;
const placaTipos = sys.placa_tipos || (sys.placas ? sys.placas.map(p => p.tipo) : []);
return placaTipos.includes(placa);
});
const estructurasUnicas = new Set();
sistemasFiltrados.forEach(sys => {
const estructuraTipo = sys.estructura_tipo || sys.estructura;
if (!estructuraTipo) return;
if (estructuraTipo === 'montante_rail') {
const perfil = sys.perfil_mm;
const zinc = sys.zincado || '';
if (perfil) {
estructurasUnicas.add(`${perfil} ${zinc}`.trim()); // ✅ Añade espacio
}
} else if (estructuraTipo === 'omega') {
estructurasUnicas.add('Ω35');
} else if (estructuraTipo.startsWith('tc')) {
const perfil = sys.perfil_mm;
if (perfil) {
estructurasUnicas.add(`TC${perfil}`);
}
} else if (estructuraTipo === 'semi-intemperie') {
const perfil = sys.perfil_mm;
if (perfil && sys.zincado === 'Z2') {
estructurasUnicas.add(`${perfil} Z2`);
}
}
});
const estructurasOrdenadas = Array.from(estructurasUnicas).sort((a, b) => {
const numA = parseInt(a.match(/\d+/)?.[0] || '0');
const numB = parseInt(b.match(/\d+/)?.[0] || '0');
if (numA !== numB) return numA - numB;
return a.localeCompare(b);
});
selectEstructura.innerHTML = '<option value="">Seleccionar...</option>';
estructurasOrdenadas.forEach(estructura => {
const option = document.createElement('option');
option.value = estructura;
option.textContent = estructura;
selectEstructura.appendChild(option);
});
selectEstructura.disabled = estructurasOrdenadas.length === 0;
if (selectCapas) {
selectCapas.innerHTML = '<option value="">Seleccionar...</option>';
selectCapas.disabled = true;
}
}
async function updateCapasOptions(ambiente, elemento, placa, estructura) {
const selectCapas = document.getElementById('selectCapas');
if (!selectCapas) return;
if (systemsIndexEnriched.length === 0) systemsIndexEnriched = await loadIndexEnriched();
const sistemasFiltrados = systemsIndexEnriched.filter(sys => {
if (!sys.ambiente_tags?.length) return false;
let matchAmbiente = false;
if (ambiente === 'seco') matchAmbiente = sys.ambiente_tags.includes('seco');
else if (ambiente === 'humedo') matchAmbiente = sys.ambiente_tags.includes('humedo');
else if (ambiente === 'semi-intemperie') matchAmbiente = sys.ambiente_tags.includes('semi-intemperie');
if (!matchAmbiente) return false;
const sysElemento = sys.elemento || sys.tipo;
if (sysElemento !== elemento) return false;
const placaTipos = sys.placa_tipos || (sys.placas ? sys.placas.map(p => p.tipo) : []);
if (!placaTipos.includes(placa)) return false;
const estructuraTipo = sys.estructura_tipo || sys.estructura;
if (estructura.includes('TC')) {
if (estructuraTipo !== 'tc' && !estructuraTipo.startsWith('tc')) return false;
const perfil = estructura.match(/TC(\d+)/)?.[1];
if (perfil && sys.perfil_mm != perfil) return false;
} else if (estructura === 'Ω35') {
if (estructuraTipo !== 'omega') return false;
if (sys.perfil_mm !== 35) return false;
} else if (estructura.includes('Z2')) {
if (sys.zincado !== 'Z2') return false;
const perfil = estructura.match(/(\d+)/)?.[1];
if (perfil && sys.perfil_mm != perfil) return false;
} else {
const perfil = estructura.match(/(\d+)/)?.[1];
if (perfil && sys.perfil_mm != perfil) return false;
if (estructura.includes('Z2') && sys.zincado !== 'Z2') return false;
if (estructura.includes('Z1') && sys.zincado !== 'Z1') return false;
}
return true;
});
const capasUnicas = new Set();
sistemasFiltrados.forEach(sys => {
const capas = sys.capas_por_cara;
if (capas === 1 || capas === 2) capasUnicas.add(capas);
});
const capasOrdenadas = Array.from(capasUnicas).sort((a, b) => a - b);
selectCapas.innerHTML = '<option value="">Seleccionar...</option>';
capasOrdenadas.forEach(capa => {
const option = document.createElement('option');
option.value = capa;
option.textContent = `${capa} (${capa}+${capa})`;
selectCapas.appendChild(option);
});
selectCapas.disabled = capasOrdenadas.length === 0;
}
function initSelectionFlow() {
if (selectionFlowInitialized) return;
selectionFlowInitialized = true;
const selectAmbiente = document.getElementById('selectAmbiente');
const selectElemento = document.getElementById('selectElemento');
const selectPlaca = document.getElementById('selectPlaca');
const selectEstructura = document.getElementById('selectEstructura');
const selectCapas = document.getElementById('selectCapas');
if (!selectAmbiente || !selectElemento || !selectPlaca || !selectEstructura || !selectCapas) return;
// Todos los selectores están visibles ahora, solo los deshabilitamos
setStepVisible('step2', false);
setStepVisible('step3', false);
setStepVisible('step4', false);
setStepVisible('step5', false);
clearSelectionResult();
hideSistemaOutputs();
selectAmbiente.addEventListener('change', async () => {
const ambiente = selectAmbiente.value;
clearSelectionResult();
hideSistemaOutputs();
// Resetear todos los selectores posteriores
setStepVisible('step3', false);
setStepVisible('step4', false);
setStepVisible('step5', false);
if (ambiente) {
setStepVisible('step2', true);
await updateElementoOptions(ambiente);
await filtrarYMostrarSistemas();
} else {
setStepVisible('step2', false);
}
});
selectElemento.addEventListener('change', async () => {
const ambiente = selectAmbiente.value;
const elemento = selectElemento.value;
clearSelectionResult();
hideSistemaOutputs();
// Resetear selectores posteriores
setStepVisible('step4', false);
setStepVisible('step5', false);
if (ambiente && elemento) {
setStepVisible('step3', true);
await updatePlacaOptions(ambiente, elemento);
await filtrarYMostrarSistemas();
} else {
setStepVisible('step3', false);
}
});
selectPlaca.addEventListener('change', async () => {
const ambiente = selectAmbiente.value;
const elemento = selectElemento.value;
const placa = selectPlaca.value;
clearSelectionResult();
hideSistemaOutputs();
// Resetear selector posterior
setStepVisible('step5', false);
if (ambiente && elemento && placa) {
setStepVisible('step4', true);
await updateEstructuraOptions(ambiente, elemento, placa);
await filtrarYMostrarSistemas();
} else {
setStepVisible('step4', false);
}
});
selectEstructura.addEventListener('change', async () => {
const ambiente = selectAmbiente.value;
const elemento = selectElemento.value;
const placa = selectPlaca.value;
const estructura = selectEstructura.value;
clearSelectionResult();
hideSistemaOutputs();
if (ambiente && elemento && placa && estructura) {
setStepVisible('step5', true);
await updateCapasOptions(ambiente, elemento, placa, estructura);
await filtrarYMostrarSistemas();
} else {
setStepVisible('step5', false);
}
});
selectCapas.addEventListener('change', async () => {
clearSelectionResult();
hideSistemaOutputs();
await filtrarYMostrarSistemas();
});
}
function parseCSV(text){
const lines = text.trim().split(/\r?\n/);
const header = lines.shift().split(',');
const formato = detectarFormatoCSV(header);
return lines.map(l=>{
const cols = l.split(',');
const obj = {};
header.forEach((h,i)=> obj[h.trim()] = (cols[i]||'').trim());
if (formato === 'legacy') {
obj.rendimiento_m2 = obj.coef || obj.rendimiento_m2 || '0';
obj.precio_catalogo_almeria = obj.precio || obj.precio_catalogo_almeria || '0';
obj.familia_precio = obj.familia_precio || detectarFamilia(obj.concepto, obj.sku || obj.codigo);
obj.codigo = obj.codigo || obj.sku || '';
} else if (formato === 'sistema') {
obj.rendimiento_m2 = obj.coef || obj.rendimiento_m2 || '0';
obj.codigo = obj.codigo || obj.sku || '';
}
obj._formato = formato;
return obj;
});
}
async function loadCSV(filename){
const res = await fetch('data/sistemas/'+filename);
if(!res.ok) throw new Error('No se pudo cargar '+filename);
return await res.text();
}
function toNum(x){ return Number(String(x).replace(',','.'))||0; }
function renderFichaTecnica(meta) {
const container = document.getElementById('fichaTecnica');
const content = document.getElementById('fichaTecnicaContent');
if (!meta || !meta.id) {
container.style.display = 'none';
return;
}
const items = [];
if (meta.tipo_sistema || meta.tipo) items.push(`<div><strong>Tipo de sistema:</strong> ${meta.tipo_sistema || meta.tipo}</div>`);
if (meta.capas_por_cara !== undefined && meta.capas_por_cara !== null) items.push(`<div><strong>Configuración:</strong> ${meta.capas_por_cara} placas por cara</div>`);
if (meta.placa_tipo) items.push(`<div><strong>Tipo de placa:</strong> ${meta.placa_tipo}</div>`);
else if (meta.placas && meta.placas.length > 0) {
const tiposPlaca = [...new Set(meta.placas.map(p => p.tipo))].join('/');
if (tiposPlaca) items.push(`<div><strong>Tipo de placa:</strong> ${tiposPlaca}</div>`);
}
if (meta.perfil_mm !== undefined && meta.perfil_mm !== null) {
let perfilText = `${meta.perfil_mm} mm`;
if (meta.zincado) perfilText += ` (${meta.zincado})`;
items.push(`<div><strong>Perfilería:</strong> ${perfilText}</div>`);
}
if (meta.hmax_m || meta.Hmax_m) items.push(`<div><strong>Altura máxima del sistema:</strong> ${meta.hmax_m || meta.Hmax_m} m</div>`);
if (meta.uso_recomendado) items.push(`<div><strong>Uso recomendado:</strong> ${meta.uso_recomendado}</div>`);
if (items.length > 0) {
content.innerHTML = items.join('');
container.style.display = 'block';
} else container.style.display = 'none';
}
function renderDescripcionTecnica(meta) {
const container = document.getElementById('descripcionTecnica');
const content = document.getElementById('descripcionTecnicaContent');
const desc = meta?.descripcion_tecnica_corta;
const long = meta?.descripcion_sistema || meta?.descripcion_tecnica_pdf;
if (!meta || (!desc && !long)) {
container.style.display = 'none';
return;
}
let html = '';
if (desc) html += `<div style="font-weight: 500; margin-bottom: 0.5rem;">${desc}</div>`;
if (long) html += `<div style="margin-top: ${desc ? '0.5' : '0'}rem;">${long}</div>`;
content.innerHTML = html;
container.style.display = 'block';
}
let proyecto = [];
async function calcularYMostrar(addToProject = false){
if (sistemaActualMeta) return await calcularYMostrarConSistema(sistemaActualMeta, addToProject);
document.getElementById('resumenSistema').style.display = 'none';
document.getElementById('fichaTecnica').style.display = 'none';
document.getElementById('descripcionTecnica').style.display = 'none';
return null;
}
function renderProyecto(){
const tbody = document.querySelector('#projTable tbody');
tbody.innerHTML = '';
let projTotalVenta = 0;
proyecto.forEach((p, idx)=>{
const precioVenta = p.ventaM2 || (p.precioVentaSistema / p.area) || 0;
const totalVenta = p.precioVentaSistema || 0;
projTotalVenta += totalVenta;
const tr = document.createElement('tr');
tr.innerHTML = `
<td>${p.system}</td>
<td class="num">${fmtNumber(p.area, 2)}</td>
<td class="num">${fmtEUR(precioVenta)}</td>
<td class="num">${fmtEUR(totalVenta)}</td>
<td>
<button onclick="eliminarSistema(${idx})" class="btn-small" style="background:#1050B0" aria-label="Eliminar sistema"><i class="fas fa-trash" aria-hidden="true"></i></button>
</td>
`;
tbody.appendChild(tr);
});
document.getElementById('projTotal').textContent = fmtEUR(projTotalVenta);
}
window.eliminarSistema = function(idx){
proyecto.splice(idx, 1);
renderProyecto();
}

// Carga una imagen (png/jpg) y la convierte a DataURL (para jsPDF)
async function loadImageDataURL(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('No se pudo cargar el logo:', e);
    return null;
  }
}

function svgToImageData(svgDataUri, callback) {
const canvas = document.createElement('canvas');
canvas.width = 800; canvas.height = 200;
const ctx = canvas.getContext('2d');
const img = new Image();
img.onload = function() {
ctx.drawImage(img, 0, 0);
const imageData = canvas.toDataURL('image/png', 1.0);
callback(imageData);
};
img.onerror = function() { callback(null); };
img.src = svgDataUri;
}
function getDescripcionComercial(meta) {
const tipo = meta.tipo;
const placa = meta.placa;
const capas = meta.capas;
const perfil = meta.perfil;
let desc = '';
if(tipo === 'MURO') {
if(placa.includes('AQUA')) desc = capas === 1 ? 'Tabique interior hidrófugo · Simple placa' : 'Tabique interior hidrófugo · Doble placa';
else if(placa.includes('MIX') || placa.includes('AQ-ST')) desc = 'Tabique interior mixto (hidrófugo/estándar) · Doble placa';
else desc = capas === 1 ? 'Tabique interior · Simple placa' : 'Tabique interior · Doble placa';
desc += ` · Perfilería ${perfil}`;
} else if(tipo === 'TRASDOSADO') {
if(meta.perfil.includes('Ω')) desc = placa.includes('AQUA') ? 'Trasdosado semidirecto hidrófugo · Perfil Ω35' : 'Trasdosado semidirecto · Perfil Ω35';
else {
if(placa.includes('AQUA')) desc = capas === 1 ? 'Trasdosado autoportante hidrófugo · Simple placa' : 'Trasdosado autoportante hidrófugo · Doble placa';
else desc = capas === 1 ? 'Trasdosado autoportante · Simple placa' : 'Trasdosado autoportante · Doble placa';
desc += ` · Perfilería ${perfil}`;
}
} else if(tipo === 'TECHO') {
if(placa.includes('AQUA')) desc = `Techo continuo hidrófugo · Perfil ${perfil}`;
else desc = `Techo continuo · Perfil ${perfil}`;
desc += ' · Simple placa';
} else if(tipo === 'EXTERIOR') {
desc = `Fachada ventilada · Perfilería ${perfil} · Placa externa`;
}
return desc || 'Sistema constructivo FassaBortolo';
}
async function exportPDF(){
if(proyecto.length === 0){ alert('No hay sistemas en el proyecto'); return; }
if (systemsIndexBase.length === 0) systemsIndexBase = await loadIndexBase();
const systemsIndex = systemsIndexBase;
const { jsPDF } = window.jspdf;
const doc = new jsPDF({orientation:'p',unit:'mm',format:'a4'});
const date = new Date().toLocaleDateString('es-ES');
const projectName = document.getElementById('projectName').value || 'Proyecto';
const total = proyecto.reduce((t,p)=>t+(p.precioVentaSistema || 0),0);

const logoData = await loadImageDataURL(LOGO_URL);
if (logoData) {
  // Mantener proporción (logo apaisado). Evita que se "aplasten" las letras.
  doc.addImage(logoData, 'PNG', 14, 10, 60, 16);
}
doc.setFontSize(20);
doc.setTextColor('#1050B0');
doc.text('Presupuesto', 14, logoData ? 34 : 22);
doc.setFontSize(11);
doc.setTextColor('#666');
doc.text(`Proyecto: ${projectName}`, 14, logoData ? 40 : 32);
doc.text(`Fecha: ${date}`, 14, logoData ? 46 : 38);
let y = logoData ? 58 : 48;
const resumenData = [];
proyecto.forEach((p, idx) => {
if(y > 240) { doc.addPage(); y = 20; }
const precioPorM2 = p.ventaM2 || (p.precioVentaSistema || 0) / p.area;
const totalSistema = p.precioVentaSistema || 0;
const incotermSistema = p.incoterm || 'CIF';
const sistemaId = p.system || p.meta?.id;
const metaFresh = systemsIndex.find(s => s.id === sistemaId) || p.meta || {};
const tituloPdf = metaFresh.titulo_pdf || metaFresh.nombre_comercial || metaFresh.name || sistemaId;
resumenData.push({sistema: `${sistemaId} — ${tituloPdf}`,m2: p.area,precioM2: precioPorM2,total: totalSistema,incoterm: incotermSistema});
doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 8;
doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor('#2c3e50');
doc.text(`Sistema: ${sistemaId} — ${tituloPdf}`, 14, y);
y += 8;
const descripcionCorta = metaFresh.descripcion_tecnica_corta || '';
const descripcionLarga = metaFresh.descripcion_sistema || metaFresh.descripcion_tecnica_pdf || '';
const descripcionMostrar = descripcionCorta || descripcionLarga;
if (descripcionMostrar && descripcionMostrar.trim()) {
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor('#555'); doc.text('Descripción del sistema:', 14, y); y += 5;
doc.setFont(undefined, 'normal');
const descLines = doc.splitTextToSize(descripcionMostrar, 180);
doc.text(descLines, 14, y); y += descLines.length * 4 + 4;
}
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor('#555'); doc.text('Datos principales:', 14, y); y += 5;
doc.setFont(undefined, 'normal'); doc.setTextColor('#666');
const perfilMm = metaFresh.perfil_mm || metaFresh.perfil || p.meta?.perfil_mm || p.meta?.perfil || '—';
const capasPorCara = metaFresh.capas_por_cara || metaFresh.capas || p.meta?.capas_por_cara || p.meta?.capas || '—';
const hmax = metaFresh.Hmax_m || metaFresh.hmax || p.meta?.Hmax_m || p.meta?.hmax || '—';
doc.text(`• Superficie: ${fmtNumber(p.area, 2)} m²`, 14, y); y += 5;
doc.text(`• Perfil: ${perfilMm}${typeof perfilMm === 'number' ? ' mm' : ''}`, 14, y); y += 5;
doc.text(`• Capas: ${capasPorCara} por cara`, 14, y); y += 5;
doc.text(`• Hmax: ${typeof hmax === 'number' ? fmtNumber(hmax, 1) : hmax}${typeof hmax === 'number' ? ' m' : ''}`, 14, y); y += 8;
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor('#555'); doc.text('Precio:', 14, y); y += 5;
doc.setFont(undefined, 'normal'); doc.setTextColor('#666');
doc.text(`• Precio ${incotermSistema} €/m² **: ${fmtEUR(precioPorM2)}`, 14, y); y += 5;
doc.setFont(undefined, 'bold'); doc.setTextColor('#2c3e50');
doc.text(`• Importe total sistema **: ${fmtEUR(totalSistema)}`, 14, y); y += 12;
});
doc.setDrawColor(220, 220, 220); doc.setLineWidth(1); doc.line(14, y, 196, y); y += 10;
doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.setTextColor('#2c3e50'); doc.text('RESUMEN DEL PROYECTO', 14, y); y += 8;
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor('#555');
doc.text('Sistema', 14, y); doc.text('m²', 70, y); doc.text(`Precio ${resumenData[0]?.incoterm || 'CIF'} €/m²`, 85, y); doc.text('Total', 155, y); y += 5;
doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(14, y, 196, y); y += 5;
doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor('#666');
resumenData.forEach(item => {
if(y > 270) { doc.addPage(); y = 20;
doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor('#555');
doc.text('Sistema', 14, y); doc.text('m²', 70, y); doc.text(`Precio ${item.incoterm} €/m²`, 85, y); doc.text('Total', 155, y); y += 5;
doc.setDrawColor(200, 200, 200); doc.line(14, y, 196, y); y += 5;
doc.setFontSize(8); doc.setFont(undefined, 'normal');
}
const sistemaTexto = doc.splitTextToSize(item.sistema, 50);
const alturaFila = Math.max(sistemaTexto.length * 4, 5);
doc.text(sistemaTexto, 14, y + (alturaFila - sistemaTexto.length * 4) / 2);
doc.text(fmtNumber(item.m2, 2), 70, y);
doc.text(fmtEUR(item.precioM2), 85, y);
doc.text(fmtEUR(item.total), 155, y);
y += alturaFila + 2;
});
y += 3; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 6;
doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor('#1050B0');
// Evitar solapes: etiqueta a la izquierda, total alineado a la derecha
doc.text('TOTAL PROYECTO:', 14, y);
doc.text(fmtEUR(total), 196, y, { align: 'right' });
y += 12;
let notaLegal = '';
const primerIncoterm = resumenData[0]?.incoterm || 'CIF';
if (primerIncoterm === 'EXW') notaLegal = '** Precio EXW. No incluye transporte ni impuestos.';
else if (primerIncoterm === 'FOB') notaLegal = '** Precio FOB. No incluye transporte ni impuestos.';
else notaLegal = '** Precio CIF. No incluye impuestos.';
doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor('#666');
// Evitar que la nota legal se solape al final de página
if (y > 285) { doc.addPage(); y = 20; }
doc.text(notaLegal, 14, y);
doc.save(`Presupuesto_${projectName.replace(/\s+/g,'_')}_${date.replace(/\//g,'-')}.pdf`);
}
function exportExcel(){
if(proyecto.length === 0){ alert('No hay sistemas en el proyecto'); return; }
for (const p of proyecto) {
if (!p.rows || p.rows.length === 0) { alert(`Error: El sistema ${p.system} no tiene datos de materiales.`); return; }
for (const r of p.rows) {
if (r.precioCatalogo === undefined || r.dtoDistribuidorPct === undefined ||
r.precioNeto === undefined || r.importeNeto === undefined) {
alert(`Error: El sistema ${p.system} tiene datos incompletos.`); return;
}
}
if (p.costeNetoSistema === undefined || p.costeTotalSistema === undefined ||
p.precioVentaSistema === undefined) {
alert(`Error: El sistema ${p.system} no tiene cálculos completos.`); return;
}
}
const wb = XLSX.utils.book_new();
const date = new Date().toLocaleDateString('es-ES');
const projectName = document.getElementById('projectName').value || 'Proyecto';
const wsResumen = XLSX.utils.aoa_to_sheet([
['PROYECTO:', projectName],
['FECHA:', date],
[''],
['Sistema','m²','Precio venta/m²','Total €'],
...proyecto.map(p => {
const precioM2 = p.ventaM2 || (p.precioVentaSistema / p.area);
return [p.system, p.area, precioM2, p.precioVentaSistema];
}),
[''],
['TOTAL PROYECTO', '', '', proyecto.reduce((t,p)=>t+(p.precioVentaSistema || 0),0)]
]);
XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
proyecto.forEach(p => {
const incoterm = p.incoterm || 'CIF';
const logisticaPct = p.logisticaPct || 0;
const margenPct = p.margenPct || 0;
const costeNeto = p.costeNetoSistema || 0;
const costeTotal = p.costeTotalSistema || 0;
const precioVenta = p.precioVentaSistema || 0;
const precioM2 = p.ventaM2 || (precioVenta / p.area);
const ws = XLSX.utils.aoa_to_sheet([
['SISTEMA:', p.system],
['m²:', p.area],
['Desperdicio %:', p.waste || 0],
['Descuento placas:', '60%'],
['Descuento resto:', '55%'],
['Incoterm:', incoterm],
['Logística %:', logisticaPct],
['Margen %:', margenPct],
['Coste neto sistema €:', costeNeto],
['Coste total sistema €:', costeTotal],
['Precio venta €/m²:', precioM2],
['Total sistema €:', precioVenta],
[''],
['Código / SKU','Descripción','Unidad de venta','Rendimiento (coef.)','Cantidad requerida','Precio cat. (€)','Dto. distrib. %','Precio neto (€)','Coste neto (€)'],
...p.rows.map(r => {
const precioCatalogo = r.precioCatalogo || 0;
const dtoPct = r.dtoDistribuidorPct || 0;
const precioNeto = r.precioNeto || 0;
const rendimiento = r.rendimiento || r.rendimiento_m2 || 0;
const qty = r.qty || 0;
const importeNeto = r.importeNeto || 0;
return [
r.codigo || r.sku || '',
r.concepto || '',
r.unidad || '',
rendimiento,
qty,
precioCatalogo,
dtoPct,
precioNeto,
importeNeto
];
}),
[''],
['COSTE NETO SISTEMA', '', '', '', '', '', '', '', costeNeto],
['COSTE TOTAL SISTEMA', '', '', '', '', '', '', '', costeTotal],
['PRECIO VENTA SISTEMA', '', '', '', '', '', '', '', precioVenta]
]);
XLSX.utils.book_append_sheet(wb, ws, p.system.slice(0,31));
});
XLSX.writeFile(wb, `Proyecto_${projectName.replace(/\s+/g,'_')}_${date.replace(/\//g,'-')}.xlsx`);
}
(async()=>{
if (systemsIndexEnriched.length === 0) systemsIndexEnriched = await loadIndexEnriched();
if (systemsIndexBase.length === 0) systemsIndexBase = await loadIndexBase();
document.getElementById('addBtn').addEventListener('click', async()=> await calcularYMostrar(true));
document.getElementById('pdfBtn').addEventListener('click', exportPDF);
document.getElementById('excelBtn').addEventListener('click', exportExcel);
initSelectionFlow();
const inputsReactivos = ['area', 'waste', 'logisticaPct', 'margenPct', 'incoterm'];
inputsReactivos.forEach(id => {
const el = document.getElementById(id);
if (el) {
el.addEventListener('input', async() => await calcularYMostrar(false));
el.addEventListener('change', async() => await calcularYMostrar(false));
}
});
renderProyecto();
})();
// =======================================================
// ARIAS ENGINE – API PÚBLICA PARA SELECTOR ARIAS v2
// =======================================================

window.AriasEngine = window.AriasEngine || {};

/**
 * Ejecuta el cálculo directamente a partir de un systemId
 * (ej: "M-70-13-2")
 */
window.AriasEngine.selectAndCalculateBySystemId = function (systemId) {
  if (!systemId) {
    console.error("AriasEngine: systemId vacío");
    return;
  }

  // 1️⃣ Guardamos el sistema seleccionado (si el motor usa estado)
  window.__selectedSystemId = systemId;

  // 2️⃣ Buscar la metadata del sistema en el índice base y llamar al cálculo con meta
  const index = window.__sistemasIndex || [];
  const meta = index.find(s => s.id === systemId);
  if (!meta) {
    console.error(`AriasEngine: systemId no encontrado: ${systemId}`);
    return;
  }
  if (typeof window.calcularYMostrarConSistema === "function") {
    // Pasamos el objeto meta en vez del id, la función espera el objeto completo
    window.calcularYMostrarConSistema(meta, false);
    return;
  }
  // 3️⃣ Fallback: intenta disparar el flujo actual
  console.warn(
    "AriasEngine: no se encontró calcularYMostrarConSistema(meta). " +
    "Revisa el nombre de la función de cálculo."
  );
};
