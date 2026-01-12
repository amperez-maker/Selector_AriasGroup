// Script de migración CSV: formato viejo → nuevo modelo de costes
// Uso: node migrate-csv-costs.js

const fs = require('fs');
const path = require('path');

const sistemasDir = path.join(__dirname, 'sistemas');
const sistemasIndex = JSON.parse(fs.readFileSync(path.join(sistemasDir, 'sistemas-index.json'), 'utf8'));

// Detectar familia por concepto/sku
function detectarFamilia(concepto, codigo) {
  const upper = (concepto || '').toUpperCase();
  const codUpper = (codigo || '').toUpperCase();
  
  // PLACAS
  if (upper.includes('PLACA') || upper.includes('GYPSOTECH') || 
      codUpper.startsWith('L00')) {
    return 'PLACA';
  }
  
  return 'RESTO';
}

// Migrar un CSV
function migrateCSV(csvPath, sistemaId) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  
  // Encontrar índices de columnas viejas
  const idxSku = header.indexOf('sku');
  const idxConcepto = header.indexOf('concepto');
  const idxUnidad = header.indexOf('unidad');
  const idxPrecio = header.indexOf('precio');
  const idxCoef = header.indexOf('coef');
  
  if (idxSku === -1 || idxConcepto === -1) {
    console.warn(`⚠️  ${sistemaId}: CSV no tiene formato esperado, saltando...`);
    return null;
  }
  
  const newLines = [];
  // Nuevo header (4 columnas según especificación)
  newLines.push('codigo,concepto,unidad,rendimiento_m2');
  
  // Migrar cada línea
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split(',');
    const codigo = cols[idxSku]?.trim() || '';
    const concepto = cols[idxConcepto]?.trim() || '';
    const unidad = cols[idxUnidad]?.trim() || '';
    const rendimiento = cols[idxCoef]?.trim() || '0';

    newLines.push([
      codigo,
      concepto,
      unidad,
      rendimiento
    ].join(','));
  }
  
  return newLines.join('\n') + '\n';
}

// Migrar todos los CSV
let migrated = 0;
let errors = 0;

sistemasIndex.systems.forEach(sys => {
  const csvPath = path.join(sistemasDir, sys.csv);
  if (!fs.existsSync(csvPath)) {
    console.warn(`⚠️  ${sys.id}: CSV no encontrado: ${sys.csv}`);
    errors++;
    return;
  }
  
  try {
    const newContent = migrateCSV(csvPath, sys.id);
    if (newContent) {
      // Hacer backup primero
      const backupPath = csvPath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(csvPath, backupPath);
      }
      
      // Escribir nuevo formato
      fs.writeFileSync(csvPath, newContent, 'utf8');
      migrated++;
      console.log(`✅ ${sys.id}: Migrado`);
    } else {
      errors++;
    }
  } catch (err) {
    console.error(`❌ ${sys.id}: Error migrando CSV: ${err.message}`);
    errors++;
  }
});

console.log(`\n✅ Migración completada:`);
console.log(`   - Migrados: ${migrated} CSV`);
console.log(`   - Errores: ${errors}`);
console.log(`\n📝 Backups creados: *.backup`);
