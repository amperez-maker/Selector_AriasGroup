/**
 * Script para enriquecer sistemas-index.json sin modificar el archivo base
 * Genera sistemas-index.enriched.json con campos adicionales para filtrado
 */

const fs = require('fs');
const path = require('path');

function enrichSystem(system) {
  const enriched = { ...system };
  
  // 1. ambiente_tags: array según placas[] y tipo
  const ambienteTags = [];
  const placasTipos = system.placas?.map(p => p.tipo) || [];
  
  // Si tiene AQUA => humedo
  if (placasTipos.includes('AQUA')) {
    ambienteTags.push('humedo');
  }
  
  // Si tipo EXTERIOR => semi-intemperie
  if (system.tipo === 'EXTERIOR') {
    ambienteTags.push('semi-intemperie');
    // Exterior siempre Z2
    if (!enriched.zincado) enriched.zincado = 'Z2';
  }
  
  // Si no es EXTERIOR y no tiene EXTERNA_LIGHT => seco (si tiene STD o LIGNUM)
  if (system.tipo !== 'EXTERIOR' && !placasTipos.includes('EXTERNA_LIGHT')) {
    if (placasTipos.includes('STD') || placasTipos.includes('LIGNUM')) {
      ambienteTags.push('seco');
    }
  }
  
  // Si tiene AQUA pero también STD/LIGNUM => también seco (mixto)
  if (placasTipos.includes('AQUA') && (placasTipos.includes('STD') || placasTipos.includes('LIGNUM'))) {
    if (!ambienteTags.includes('seco')) ambienteTags.push('seco');
    if (!ambienteTags.includes('humedo')) ambienteTags.push('humedo');
  }
  
  enriched.ambiente_tags = ambienteTags.length > 0 ? ambienteTags : ['seco']; // fallback
  
  // 2. placa_tipos: array de tipos únicos de placas
  enriched.placa_tipos = [...new Set(placasTipos)];
  
  // 3. elemento: mapear tipo a elemento
  enriched.elemento = system.tipo || 'MURO';
  
  // 4. estructura_tipo: determinar tipo de estructura
  if (system.estructura === 'montante_rail') {
    enriched.estructura_tipo = 'montante_rail';
  } else if (system.estructura === 'omega') {
    enriched.estructura_tipo = 'omega';
  } else if (system.estructura === 'tc') {
    // Determinar si es TC47 o TC60
    if (system.perfil_mm === 47) {
      enriched.estructura_tipo = 'tc47';
    } else if (system.perfil_mm === 60) {
      enriched.estructura_tipo = 'tc60';
    } else {
      enriched.estructura_tipo = `tc${system.perfil_mm || ''}`;
    }
  } else {
    enriched.estructura_tipo = system.estructura || 'montante_rail';
  }
  
  // 5. Asegurar campos básicos
  if (!enriched.perfil_mm && system.perfil) {
    // Intentar extraer número del perfil si es string
    const match = String(system.perfil).match(/(\d+)/);
    if (match) enriched.perfil_mm = parseInt(match[1]);
  }
  
  if (!enriched.capas_por_cara && system.capas) {
    // Si capas es número total, calcular por cara (asumiendo simétrico)
    enriched.capas_por_cara = system.capas;
  }
  
  return enriched;
}

async function main() {
  const indexPath = path.join(__dirname, 'sistemas', 'sistemas-index.json');
  const outputPath = path.join(__dirname, 'sistemas', 'sistemas-index.enriched.json');
  
  console.log('Leyendo sistemas-index.json...');
  const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  
  if (!data.systems || !Array.isArray(data.systems)) {
    throw new Error('sistemas-index.json debe tener una propiedad "systems" con array');
  }
  
  console.log(`Enriqueciendo ${data.systems.length} sistemas...`);
  const enrichedSystems = data.systems.map(enrichSystem);
  
  const output = {
    ...data,
    systems: enrichedSystems,
    _enriched: true,
    _enriched_at: new Date().toISOString()
  };
  
  console.log('Escribiendo sistemas-index.enriched.json...');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  
  console.log(`✅ Generado: ${outputPath}`);
  console.log(`   ${enrichedSystems.length} sistemas enriquecidos`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

