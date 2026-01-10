// Script de migración: schema viejo → schema nuevo
// Uso: node migrate-schema.js

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'sistemas', 'sistemas-index.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Alias para IDs renombrados
const ID_ALIASES = {
  'M-70-13-AQ-ST-2': 'M-70-13-AQSTD-2'
};

// Parsear perfil para extraer estructura, mm y zincado
function parsePerfil(perfil) {
  if (perfil.includes('Ω') || perfil.includes('OMEGA')) {
    return {
      estructura: 'omega',
      perfil_mm: 35,
      zincado: perfil.includes('Z2') ? 'Z2' : 'Z1'
    };
  }
  if (perfil.startsWith('TC')) {
    const match = perfil.match(/TC(\d+)/);
    return {
      estructura: 'tc',
      perfil_mm: match ? parseInt(match[1]) : null,
      zincado: perfil.includes('Z2') ? 'Z2' : 'Z1'
    };
  }
  // Montante/Rail
  const match = perfil.match(/(\d+)\s*Z(\d+)/);
  if (match) {
    return {
      estructura: 'montante_rail',
      perfil_mm: parseInt(match[1]),
      zincado: 'Z' + match[2]
    };
  }
  return {
    estructura: 'montante_rail',
    perfil_mm: null,
    zincado: 'Z1'
  };
}

// Convertir placa string a array de placas
function parsePlacas(placaStr, tipo) {
  if (!placaStr) return [];
  
  // Si ya es un array (schema nuevo), devolverlo
  if (Array.isArray(placaStr)) return placaStr;
  
  // Casos especiales
  if (placaStr.includes('AQUA-STD') || placaStr.includes('AQ-ST')) {
    // Sistema combinado: parsear espesor
    const espesorMatch = placaStr.match(/(\d+)/);
    const espesor = espesorMatch ? parseInt(espesorMatch[1]) : 13;
    return [
      { tipo: 'STD', espesor_mm: espesor },
      { tipo: 'AQUA', espesor_mm: espesor }
    ];
  }
  
  if (placaStr.startsWith('EXT')) {
    const espesorMatch = placaStr.match(/(\d+)/);
    const espesor = espesorMatch ? parseInt(espesorMatch[1]) : 13;
    return [{ tipo: 'EXTERNA_LIGHT', espesor_mm: espesor }];
  }
  
  // Placa simple
  const tipoMatch = placaStr.match(/^(STD|AQUA)/);
  const tipoPlaca = tipoMatch ? tipoMatch[1] : 'STD';
  const espesorMatch = placaStr.match(/(\d+)/);
  const espesor = espesorMatch ? parseInt(espesorMatch[1]) : 13;
  
  return [{ tipo: tipoPlaca, espesor_mm: espesor }];
}

// Migrar un sistema
function migrateSystem(sys) {
  const parsed = parsePerfil(sys.perfil);
  
  // Aplicar alias de ID si existe
  const newId = ID_ALIASES[sys.id] || sys.id;
  
  // Migrar capas
  const capasPorCara = sys.capas_por_cara !== undefined 
    ? sys.capas_por_cara 
    : (sys.capas || 1);
  
  // Asegurar que sea 1 o 2
  if (capasPorCara !== 1 && capasPorCara !== 2) {
    console.warn(`⚠️  Sistema ${sys.id}: capas=${sys.capas}, ajustando a 2`);
  }
  const capasFinal = (capasPorCara === 1 || capasPorCara === 2) ? capasPorCara : 2;
  
  // Migrar placas
  const placas = sys.placas || parsePlacas(sys.placa, sys.tipo);
  
  const migrated = {
    id: newId,
    tipo: sys.tipo,
    estructura: parsed.estructura,
    perfil_mm: parsed.perfil_mm,
    zincado: parsed.zincado,
    modulacion_mm: sys.modulacion_mm || 600,
    capas_por_cara: capasFinal,
    placas: placas,
    Hmax_m: sys.Hmax_m,
    csv: sys.csv,
    nombre_comercial: sys.name || sys.nombre_comercial || sys.id
  };
  
  // Añadir alias si el ID cambió
  if (ID_ALIASES[sys.id]) {
    migrated._alias = sys.id;
  }
  
  // Mantener perfil para compatibilidad (deprecated)
  if (sys.perfil) {
    migrated._perfil_deprecated = sys.perfil;
  }
  
  return migrated;
}

// Migrar todos los sistemas
const migratedSystems = json.systems.map(migrateSystem);

const result = {
  version: "Gypsotech V2 Caribe 2025 (normalizado)",
  schema_version: 2,
  systems: migratedSystems,
  _migration: {
    date: new Date().toISOString(),
    id_aliases: ID_ALIASES
  }
};

// Escribir resultado
const outputPath = path.join(__dirname, 'sistemas', 'sistemas-index.json');
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`✅ Migración completada: ${migratedSystems.length} sistemas`);
console.log(`📝 Alias aplicados:`, Object.keys(ID_ALIASES).length);
console.log(`📄 JSON guardado en: ${outputPath}`);

