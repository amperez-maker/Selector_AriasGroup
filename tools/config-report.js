// Auditoría rápida de configuración
// Uso: node config-report.js

const fs = require('fs');
const path = require('path');

const sistemasPath = path.join(__dirname, 'sistemas', 'sistemas-index.json');
const ambientesPath = path.join(__dirname, 'ambientes.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatEntries(obj) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `   - ${k || 'sin valor'}: ${v}`)
    .join('\n');
}

function main() {
  const sistemasIndex = readJson(sistemasPath);
  const ambientes = readJson(ambientesPath);
  const systems = sistemasIndex.systems || [];

  console.log('\n=== REVISIÓN DE CONFIGURACIÓN ===\n');

  console.log('1) Resumen general');
  console.log(`   Sistemas totales: ${systems.length}`);
  console.log(`   Ambientes definidos: ${ambientes.length}`);
  console.log(`   CSV únicos: ${new Set(systems.map(s => s.csv)).size}`);

  console.log('\n2) Distribución de sistemas');
  console.log(' - Por tipo:');
  console.log(formatEntries(groupBy(systems, s => s.tipo)) || '   - (sin datos)');
  console.log(' - Por capas_por_cara:');
  console.log(formatEntries(groupBy(systems, s => s.capas_por_cara)) || '   - (sin datos)');
  console.log(' - Por perfil_mm:');
  console.log(formatEntries(groupBy(systems, s => s.perfil_mm)) || '   - (sin datos)');
  console.log(' - Por zincado:');
  console.log(formatEntries(groupBy(systems, s => s.zincado)) || '   - (sin datos)');

  const missingFields = [];
  const duplicateNames = new Set();
  const nameCounts = groupBy(systems, s => s.nombre_comercial);
  Object.entries(nameCounts).forEach(([name, count]) => {
    if (name && count > 1) duplicateNames.add(name);
  });

  systems.forEach(sys => {
    const sysId = sys.id;
    if (!sys.nombre_comercial) missingFields.push(`${sysId}: falta nombre_comercial`);
    if (!sys.descripcion_sistema) missingFields.push(`${sysId}: falta descripcion_sistema`);
    if (!sys.uso_recomendado) missingFields.push(`${sysId}: falta uso_recomendado`);
    if (!sys.Hmax_m) missingFields.push(`${sysId}: falta Hmax_m`);
    if (!sys.modulacion_mm) missingFields.push(`${sysId}: falta modulacion_mm`);
    if (!sys.placas || !Array.isArray(sys.placas) || sys.placas.length === 0) {
      missingFields.push(`${sysId}: placas[] vacío o faltante`);
    }
    if (!sys.capas_por_cara) missingFields.push(`${sysId}: falta capas_por_cara`);
    const csvPath = path.join(__dirname, 'sistemas', sys.csv || '');
    if (!sys.csv || !fs.existsSync(csvPath)) {
      missingFields.push(`${sysId}: CSV faltante (${sys.csv || 'no definido'})`);
    }
  });

  console.log('\n3) Campos faltantes/consistencia');
  if (missingFields.length === 0) {
    console.log('   ✅ No se detectaron campos faltantes críticos');
  } else {
    missingFields.slice(0, 25).forEach(m => console.log(`   - ${m}`));
    if (missingFields.length > 25) {
      console.log(`   ... ${missingFields.length - 25} registros adicionales`);
    }
  }

  console.log('\n4) Nombres comerciales duplicados');
  if (duplicateNames.size === 0) {
    console.log('   ✅ No hay duplicados');
  } else {
    [...duplicateNames].forEach(name => {
      console.log(`   - ${name}`);
    });
  }

  console.log('\n5) Ambientes configurados');
  ambientes.forEach(a => {
    console.log(`   - ${a.id}: ${a.nombre} (${a.descripcion})`);
  });

  console.log('\nFin de la revisión.\n');
}

main();
