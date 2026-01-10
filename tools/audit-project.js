const fs = require('fs');
const path = require('path');

const sistemasDir = './sistemas';
const indexPath = path.join(sistemasDir, 'sistemas-index.json');

console.log('=== AUDITORÍA TÉCNICA DEL PROYECTO ===\n');

const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const systems = index.systems || [];

const errors = [];
const warnings = [];

// A) Consistencia sistema (JSON)
console.log('A) Verificando consistencia sistema (JSON)...\n');

const ids = [];
const csvs = [];

systems.forEach((sys, idx) => {
  const sysId = sys.id;
  const prefix = sysId.split('-')[0];
  
  // 1. IDs únicos
  if (ids.includes(sysId)) {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `ID duplicado: ${sysId}` });
  }
  ids.push(sysId);
  
  // 2. CSV únicos y existentes
  if (!sys.csv) {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: 'Campo CSV faltante' });
  } else {
    if (csvs.includes(sys.csv)) {
      errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `CSV duplicado: ${sys.csv}` });
    }
    csvs.push(sys.csv);
    
    const csvPath = path.join(sistemasDir, sys.csv);
    if (!fs.existsSync(csvPath)) {
      errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `CSV no existe: ${sys.csv}` });
    }
  }
  
  // 3. Tipo coherente con prefijo
  const tipoEsperado = prefix === 'M' ? 'MURO' :
                       (prefix === 'TA' || prefix === 'TS') ? 'TRASDOSADO' :
                       prefix === 'T' ? 'TECHO' :
                       prefix === 'EL' ? 'EXTERIOR' : null;
  
  if (tipoEsperado && sys.tipo !== tipoEsperado) {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `Tipo incoherente: prefijo ${prefix} espera ${tipoEsperado}, tiene ${sys.tipo}` });
  }
  
  // 4. EXTERIOR => zincado = Z2 obligatorio
  if (sys.tipo === 'EXTERIOR' && sys.zincado !== 'Z2') {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `EXTERIOR requiere zincado Z2, tiene ${sys.zincado || 'faltante'}` });
  }
  
  // 5. capas_por_cara ∈ {1,2} (OBLIGATORIO)
  if (sys.capas_por_cara === undefined) {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: 'capas_por_cara faltante (obligatorio)' });
  } else if (sys.capas_por_cara !== 1 && sys.capas_por_cara !== 2) {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `capas_por_cara inválido: ${sys.capas_por_cara} (debe ser 1 o 2)` });
  }
  
  // 6. modulacion_mm presente (400/600)
  if (!sys.modulacion_mm) {
    warnings.push({ tipo: 'WARNING', sistema: sysId, mensaje: 'modulacion_mm faltante' });
  } else if (sys.modulacion_mm !== 400 && sys.modulacion_mm !== 600) {
    warnings.push({ tipo: 'WARNING', sistema: sysId, mensaje: `modulacion_mm no estándar: ${sys.modulacion_mm}` });
  }
  
  // 7. placas[] presente y válido
  if (!sys.placas || !Array.isArray(sys.placas) || sys.placas.length === 0) {
    errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: 'placas[] faltante o vacío' });
  } else {
    sys.placas.forEach((placa, pIdx) => {
      if (!placa.tipo) {
        errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `placas[${pIdx}].tipo faltante` });
      } else if (!['STD', 'AQUA', 'EXTERNA', 'EXTERNA_LIGHT'].includes(placa.tipo)) {
        errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `placas[${pIdx}].tipo inválido: ${placa.tipo}` });
      }
      
      if (!placa.espesor_mm) {
        errors.push({ tipo: 'ERROR', sistema: sysId, mensaje: `placas[${pIdx}].espesor_mm faltante` });
      } else if (![13, 15, 18].includes(placa.espesor_mm)) {
        warnings.push({ tipo: 'WARNING', sistema: sysId, mensaje: `placas[${pIdx}].espesor_mm no estándar: ${placa.espesor_mm}` });
      }
    });
  }
  
  // 8. TECHO: estructura/perfil coherente
  if (sys.tipo === 'TECHO') {
    if (sysId.includes('TC47') && sys.perfil_mm !== 47) {
      warnings.push({ tipo: 'WARNING', sistema: sysId, mensaje: `TC47 espera perfil_mm=47, tiene ${sys.perfil_mm}` });
    }
    if (sysId.includes('TC60') && sys.perfil_mm !== 60) {
      warnings.push({ tipo: 'WARNING', sistema: sysId, mensaje: `TC60 espera perfil_mm=60, tiene ${sys.perfil_mm}` });
    }
  }
  
  // 9. TS: Omega 35 coherente
  if (prefix === 'TS' && sys.perfil_mm !== 35) {
    warnings.push({ tipo: 'WARNING', sistema: sysId, mensaje: `TS espera perfil_mm=35 (Omega), tiene ${sys.perfil_mm}` });
  }
});

console.log(`   Sistemas verificados: ${systems.length}`);
console.log(`   Errores encontrados: ${errors.filter(e => e.tipo === 'ERROR').length}`);
console.log(`   Warnings encontrados: ${warnings.filter(w => w.tipo === 'WARNING').length}\n`);

// B) Consistencia CSV (por sistema)
console.log('B) Verificando consistencia CSV...\n');

const headersEsperados = ['codigo', 'concepto', 'unidad', 'rendimiento_m2'];

systems.forEach(sys => {
  if (!sys.csv) return;
  const csvPath = path.join(sistemasDir, sys.csv);
  if (!fs.existsSync(csvPath)) return;
  
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) {
    errors.push({ tipo: 'ERROR', sistema: sys.id, csv: sys.csv, mensaje: 'CSV vacío o sin datos' });
    return;
  }
  
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  // Verificar cabecera
  headersEsperados.forEach(h => {
    if (!header.includes(h)) {
      errors.push({ tipo: 'ERROR', sistema: sys.id, csv: sys.csv, mensaje: `Falta columna en cabecera: ${h}` });
    }
  });
  if (header.includes('precio_catalogo_almeria') || header.includes('familia_precio')) {
    warnings.push({ tipo: 'WARNING', sistema: sys.id, csv: sys.csv, mensaje: 'CSV contiene precios/familia; deben estar solo en catálogo maestro' });
  }
  
  // Verificar datos
  const placasEnCSV = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(c => c.trim());
    if (row.length < header.length) continue;
    
    const codigoIdx = header.indexOf('codigo');
    const conceptoIdx = header.indexOf('concepto');
    const rendimientoIdx = header.indexOf('rendimiento_m2');
    
    // codigo no vacío (bloqueante)
    if (codigoIdx >= 0 && (!row[codigoIdx] || row[codigoIdx] === '')) {
      errors.push({ tipo: 'ERROR', sistema: sys.id, csv: sys.csv, linea: i+1, mensaje: 'Código vacío' });
    }
    
    // rendimiento_m2 numérico
    if (rendimientoIdx >= 0) {
      const rendimiento = parseFloat(row[rendimientoIdx]);
      if (isNaN(rendimiento) || rendimiento <= 0) {
        errors.push({ tipo: 'ERROR', sistema: sys.id, csv: sys.csv, linea: i+1, mensaje: `Rendimiento inválido: ${row[rendimientoIdx]}` });
      }
    }
    
    // Detectar placas para verificar sistema mixto (por concepto)
    if (conceptoIdx >= 0) {
      const concepto = row[conceptoIdx] || '';
      if (concepto.toUpperCase().includes('STD')) placasEnCSV.push('STD');
      if (concepto.toUpperCase().includes('AQUA')) placasEnCSV.push('AQUA');
    }
  }
  
  // Sistema mixto AQSTD: debe tener 2 líneas de placa separadas
  if (sys.id.includes('AQSTD')) {
    const tiposPlaca = sys.placas ? sys.placas.map(p => p.tipo) : [];
    const tieneSTD = tiposPlaca.includes('STD');
    const tieneAQUA = tiposPlaca.includes('AQUA');
    
    if (!tieneSTD || !tieneAQUA) {
      errors.push({ tipo: 'ERROR', sistema: sys.id, csv: sys.csv, mensaje: 'Sistema AQSTD debe tener placas STD y AQUA en JSON' });
    }
    
    // Verificar que hay líneas de placa en CSV (verificación básica)
    const placasUnicas = [...new Set(placasEnCSV)];
    if (placasUnicas.length < 2 && tieneSTD && tieneAQUA) {
      warnings.push({ tipo: 'WARNING', sistema: sys.id, csv: sys.csv, mensaje: 'Sistema AQSTD: verificar que hay líneas separadas para STD y AQUA en CSV' });
    }
  }
});

console.log(`   CSVs verificados: ${systems.length}`);
console.log(`   Errores encontrados: ${errors.filter(e => e.tipo === 'ERROR' && e.csv).length}`);
console.log(`   Warnings encontrados: ${warnings.filter(w => w.tipo === 'WARNING' && w.csv).length}\n`);

// C) Coherencia "ambiente vs placa"
console.log('C) Verificando coherencia ambiente vs placa...\n');

systems.forEach(sys => {
  if (!sys.placas || !Array.isArray(sys.placas)) return;
  
  const tieneAQUA = sys.placas.some(p => p.tipo === 'AQUA');
  const tieneEXT = sys.placas.some(p => p.tipo === 'EXTERNA' || p.tipo === 'EXTERNA_LIGHT');
  const soloSTD = sys.placas.every(p => p.tipo === 'STD');
  
  // Verificación básica (no bloqueante, para modo guiado)
  if (tieneEXT && sys.tipo !== 'EXTERIOR') {
    warnings.push({ tipo: 'WARNING', sistema: sys.id, mensaje: 'Placa EXTERNA en sistema no EXTERIOR' });
  }
  
  if (sys.tipo === 'EXTERIOR' && !tieneEXT) {
    warnings.push({ tipo: 'WARNING', sistema: sys.id, mensaje: 'Sistema EXTERIOR sin placa EXTERNA' });
  }
});

console.log(`   Coherencias verificadas: ${systems.length}`);
console.log(`   Warnings encontrados: ${warnings.filter(w => w.tipo === 'WARNING' && w.mensaje.includes('ambiente')).length}\n`);

// REPORTE FINAL
console.log('=== REPORTE FINAL ===\n');

const errorCount = errors.filter(e => e.tipo === 'ERROR').length;
const warningCount = warnings.filter(w => w.tipo === 'WARNING').length;

if (errorCount > 0) {
  console.log(`❌ ERRORES ENCONTRADOS: ${errorCount}\n`);
  errors.filter(e => e.tipo === 'ERROR').forEach(err => {
    const loc = err.linea ? ` (línea ${err.linea})` : '';
    const csv = err.csv ? ` [${err.csv}]` : '';
    console.log(`  [ERROR] ${err.sistema || ''}${csv}${loc}: ${err.mensaje}`);
  });
  console.log('');
}

if (warningCount > 0) {
  console.log(`⚠️  WARNINGS ENCONTRADOS: ${warningCount}\n`);
  warnings.filter(w => w.tipo === 'WARNING').forEach(warn => {
    const loc = warn.linea ? ` (línea ${warn.linea})` : '';
    const csv = warn.csv ? ` [${warn.csv}]` : '';
    console.log(`  [WARNING] ${warn.sistema || ''}${csv}${loc}: ${warn.mensaje}`);
  });
  console.log('');
}

if (errorCount === 0 && warningCount === 0) {
  console.log('✅ Auditoría pasada sin errores ni warnings\n');
  process.exit(0);
} else if (errorCount === 0) {
  console.log(`✅ Auditoría pasada (${warningCount} warnings no bloqueantes)\n`);
  process.exit(0);
} else {
  console.log(`❌ Auditoría fallida: ${errorCount} errores bloqueantes\n`);
  process.exit(1);
}
