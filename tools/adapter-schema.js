// Adapter para compatibilidad: schema nuevo → schema viejo
// Este código debe incluirse en presupuesto.html

(function() {
  'use strict';
  
  // Mapa de alias de IDs
  const ID_ALIASES = {
    'M-70-13-AQ-ST-2': 'M-70-13-AQSTD-2'
  };
  
  // Crear mapa inverso para búsqueda rápida
  const ID_ALIASES_REVERSE = {};
  Object.keys(ID_ALIASES).forEach(oldId => {
    ID_ALIASES_REVERSE[ID_ALIASES[oldId]] = oldId;
  });
  
  // Convertir sistema nuevo a formato viejo (compatibilidad)
  window.normalizeSystemToV1 = function(sys) {
    // Si ya tiene formato viejo, devolverlo
    if (sys.capas !== undefined && sys.placa !== undefined && typeof sys.placa === 'string') {
      return sys;
    }
    
    // Convertir de nuevo a viejo
    const v1 = {
      id: sys.id,
      tipo: sys.tipo,
      perfil: sys._perfil_deprecated || `${sys.perfil_mm || ''} ${sys.zincado || 'Z1'}`.trim(),
      modulacion_mm: sys.modulacion_mm || 600,
      placa: Array.isArray(sys.placas) && sys.placas.length > 0
        ? sys.placas.map(p => `${p.tipo}-${p.espesor_mm}`).join('+')
        : 'STD-13',
      capas: sys.capas_por_cara || sys.capas || 1,
      Hmax_m: sys.Hmax_m,
      csv: sys.csv,
      name: sys.nombre_comercial || sys.name || sys.id
    };
    
    return v1;
  };
  
  // Resolver ID con alias
  window.resolveSystemId = function(id) {
    return ID_ALIASES[id] || id;
  };
  
  // Buscar sistema por ID (soporta alias)
  window.findSystemById = function(systems, id) {
    // Buscar directo
    let sys = systems.find(s => s.id === id);
    if (sys) return sys;
    
    // Buscar por alias
    const resolvedId = ID_ALIASES[id] || id;
    sys = systems.find(s => s.id === resolvedId);
    if (sys) return sys;
    
    // Buscar por alias inverso
    const aliasId = ID_ALIASES_REVERSE[id];
    if (aliasId) {
      sys = systems.find(s => s.id === aliasId);
      if (sys) return sys;
    }
    
    return null;
  };
  
  console.log('✅ Schema adapter cargado (compatibilidad v1/v2)');
})();

