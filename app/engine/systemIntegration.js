/**
 * Módulo de Integración - Selector Arias Group MVP2
 * 
 * Integra SystemMetadataGenerator con el motor existente
 * sin romper funcionalidad.
 */
export class SystemIntegration {
  constructor(metadataGenerator) {
    this.metadataGenerator = metadataGenerator;
    this.catalogoLoaded = false;
  }

  /**
   * Inicializar el sistema con el catálogo
   */
  async initialize() {
    try {
      // Cargar catálogo CSV
      const response = await fetch('./data/catalogo_materiales_sistemas_arias_selector.csv');
      const csvText = await response.text();
      await this.metadataGenerator.loadCatalogo(csvText);
      this.catalogoLoaded = true;
      console.log('✅ Sistema de metadatos inicializado');
    } catch (error) {
      console.error('❌ Error inicializando sistema:', error);
      // Continuar sin catálogo (modo fallback)
    }
  }

  /**
   * Cargar sistema CSV y generar metadatos
   */
  async loadSystem(systemId) {
    try {
      // Cargar CSV del sistema
      const response = await fetch(`./data/sistemas/${systemId}.csv`);
      const csvText = await response.text();
      
      // Parsear materiales del sistema
      const materiales = this.parseSystemCSV(csvText);
      
      // Generar metadatos
      const metadatos = this.metadataGenerator.generarMetadatos(systemId, materiales);
      
      // Retornar sistema completo
      return {
        id: systemId,
        metadatos,
        materiales,
        cargado: true
      };
      
    } catch (error) {
      console.error(`❌ Error cargando sistema ${systemId}:`, error);
      return {
        id: systemId,
        error: error.message,
        cargado: false,
        metadatos: {
          systemId,
          titulo_pdf: `Sistema ${systemId}`,
          descripcion_tecnica_corta: 'Sistema no disponible',
          espesor_total_mm: 0
        },
        materiales: []
      };
    }
  }

  /**
   * Parsear CSV de sistema
   */
  parseSystemCSV(csvText) {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    // Saltar encabezado
    const materiales = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const [codigo, concepto, unidad, rendimiento] = line.split(',');
      
      if (codigo && codigo.trim()) {
        materiales.push({
          codigo: codigo.trim(),
          concepto: concepto ? concepto.trim() : '',
          unidad: unidad ? unidad.trim() : 'ud',
          rendimiento_m2: parseFloat(rendimiento) || 0
        });
      }
    }
    
    return materiales;
  }

  /**
   * Obtener sistema con metadatos para el motor
   * 
   * Esta función es compatible con la API anterior
   * pero genera los metadatos en runtime.
   */
  async getSystemForEngine(systemId) {
    const sistema = await this.loadSystem(systemId);
    
    if (!sistema.cargado) {
      return {
        id: systemId,
        name: systemId,
        error: sistema.error,
        csv: [],
        // Metadatos fallback
        title: `Sistema ${systemId}`,
        description: 'Sistema no disponible',
        totalThickness: 0
      };
    }
    
    // Mapear al formato esperado por el motor
    return {
      id: systemId,
      name: sistema.metadatos.titulo_pdf,
      title: sistema.metadatos.titulo_pdf,
      description: sistema.metadatos.descripcion_tecnica_corta,
      totalThickness: sistema.metadatos.espesor_total_mm,
      type: sistema.metadatos.tipo,
      profile: sistema.metadatos.perfil_mm,
      layers: sistema.metadatos.capas_por_cara,
      csv: sistema.materiales.map(mat => ({
        codigo: mat.codigo,
        concepto: mat.concepto,
        unidad: mat.unidad,
        rendimiento_m2: mat.rendimiento_m2
      })),
      // Metadatos completos para debugging
      metadata: sistema.metadatos,
      // Validación de catálogo
      validation: sistema.metadatos.validacion_catalogo
    };
  }

  /**
   * Función de compatibilidad para reemplazar
   * la carga de sistemas-index.json
   */
  async getSystemMetadata(systemId) {
    const sistema = await this.getSystemForEngine(systemId);
    return sistema.metadata || {
      id: systemId,
      error: sistema.error
    };
  }

  /**
   * Batch loading para múltiples sistemas
   */
  async loadMultipleSystems(systemIds) {
    const resultados = {};
    
    const promesas = systemIds.map(async (systemId) => {
      try {
        const sistema = await this.getSystemForEngine(systemId);
        resultados[systemId] = sistema;
      } catch (error) {
        resultados[systemId] = {
          id: systemId,
          error: error.message,
          cargado: false
        };
      }
    });
    
    await Promise.all(promesas);
    return resultados;
  }

  /**
   * Verificar integridad del sistema
   */
  async validateSystem(systemId) {
    const sistema = await this.getSystemForEngine(systemId);
    
    return {
      id: systemId,
      cargado: sistema.error === undefined,
      errores: sistema.error ? [sistema.error] : [],
      materiales_count: sistema.csv ? sistema.csv.length : 0,
      catalogo_valido: sistema.validation ? sistema.validation.valido : false,
      materiales_faltantes: sistema.validation ? 
        sistema.validation.noEncontrados || [] : []
    };
  }
}


// ESM default export
export default SystemIntegration;

// Optional global for debugging
if (typeof window !== 'undefined') {
  window.SystemIntegration = SystemIntegration;
}
