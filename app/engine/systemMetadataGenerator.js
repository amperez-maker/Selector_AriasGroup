/**
 * Sistema de Generación de Metadatos para Selector Arias Group - MVP2
 * 
 * OBJETIVO: Generar en runtime todas las descripciones técnicas usando
 * únicamente el catálogo CSV como fuente de verdad.
 * 
 * REGLAS:
 * - Catálogo CSV = ÚNICA fuente de verdad
 * - No dependencias de JSONs técnicos
 * - Lenguaje técnico neutro (estilo Pladur/Knauf)
 * - Cálculos de espesor según normativa
 */
export class SystemMetadataGenerator {
  constructor() {
    this.catalogo = new Map();
    this.catalogoLoaded = false;
  }

  /**
   * Cargar catálogo de materiales en memoria
   */
  async loadCatalogo(csvText) {
    this.catalogo.clear();
    
    // Parsear CSV (formato pipe-separated)
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return;
    
    // Saltar línea de encabezado
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('| --- |')) continue;
      
      // Parsear línea pipe-separated
      const match = line.match(/\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/);
      if (!match) continue;
      
      const [, codigo, concepto, unidad, precio, familia] = match;
      const codigoClean = codigo.trim();
      
      if (codigoClean && !codigoClean.includes('---')) {
        this.catalogo.set(codigoClean, {
          codigo: codigoClean,
          concepto: concepto.trim(),
          unidad: unidad.trim(),
          precio: parseFloat(precio.trim()) || 0,
          familia: familia.trim()
        });
      }
    }
    
    this.catalogoLoaded = true;
    console.log(`✅ Catálogo cargado: ${this.catalogo.size} materiales`);
  }

  /**
   * Parsear ID de sistema y extraer información técnica
   */
  parseSystemId(systemId) {
    const partes = systemId.split('-');
    if (partes.length < 3) {
      throw new Error(`ID de sistema inválido: ${systemId}`);
    }
    
    const tipoPrefix = partes[0];
    let tipo = '';
    let subtipo = '';
    
    // Determinar tipo de sistema
    switch (tipoPrefix) {
      case 'M':
        tipo = 'Muro';
        subtipo = 'interior';
        break;
      case 'TA':
        tipo = 'Trasdosado';
        subtipo = 'sobre muro';
        break;
      case 'T':
        tipo = 'Techo';
        subtipo = 'continuo';
        break;
      case 'TS':
        tipo = 'Techo';
        subtipo = 'sobre muro';
        break;
      case 'EL':
        tipo = 'Fachada ligera';
        subtipo = 'exterior';
        break;
      default:
        tipo = 'Sistema';
        subtipo = '';
    }
    
    // Extraer datos numéricos
    const perfilMm = parseInt(partes[1]) || 70;
    const espesorNominal = parseInt(partes[2]) || 13;
    const espesorReal = this.getEspesorReal(espesorNominal);
    
    // Determinar capas por cara (último dígito o prefijo especial)
    let capasPorCara = 1;
    let tipoPlaca = 'STD';
    let hasAqua = false;
    
    for (const parte of partes) {
      if (parte === 'AQUA' || parte === 'AQSTD') {
        tipoPlaca = 'AQUA';
        hasAqua = true;
      } else if (parte === 'DBL') {
        capasPorCara = 2;
      } else if (!isNaN(parseInt(parte)) && parseInt(parte) <= 4) {
        capasPorCara = parseInt(parte);
      }
    }
    
    // Tipo de estructura para techos
    let tipoEstructura = '';
    if (tipoPrefix === 'T' || tipoPrefix === 'TS') {
      for (const parte of partes) {
        if (parte.includes('TC')) {
          tipoEstructura = `tipo ${parte}`;
          break;
        } else if (parte.includes('OMEGA')) {
          tipoEstructura = 'Omega 35';
          break;
        }
      }
    }
    
    return {
      tipo,
      subtipo,
      perfilMm,
      espesorNominal,
      espesorReal,
      capasPorCara,
      tipoPlaca,
      hasAqua,
      tipoEstructura
    };
  }

  /**
   * Convertir espesor nominal a real según normativa
   */
  getEspesorReal(nominal) {
    switch (nominal) {
      case 13: return 12.7;
      case 15: return 15.0;
      default: return nominal;
    }
  }

  /**
   * Generar título para PDF
   */
  generarTitulo(systemId, metadata) {
    const { tipo, perfilMm, espesorNominal, tipoPlaca, capasPorCara } = metadata;
    
    let titulo = `${tipo} `;
    
    // Añadir perfilería
    if (systemId.startsWith('M-') || systemId.startsWith('TA-')) {
      titulo += `con perfilería metálica galvanizada de ${perfilMm} mm`;
    } else if (systemId.startsWith('T-')) {
      titulo += `continuo`;
      if (metadata.tipoEstructura) {
        titulo += ` ${metadata.tipoEstructura}`;
      }
    } else if (systemId.startsWith('EL-')) {
      titulo += `exterior`;
    }
    
    // Añadir placas
    const totalPlacas = capasPorCara * 2;
    titulo += ` y ${totalPlacas} placas de ${espesorNominal} mm`;
    
    // Tipo especial de placa
    if (tipoPlaca === 'AQUA') {
      titulo += ' AQUA';
    }
    
    return titulo;
  }

  /**
   * Generar descripción técnica corta
   */
  generarDescripcion(systemId, metadata, materiales = []) {
    const { tipo, perfilMm, espesorReal, capasPorCara, tipoPlaca } = metadata;
    
    let descripcion = '';
    
    // Descripción del sistema base
    if (systemId.startsWith('M-')) {
      descripcion = `Sistema de muro interior ligero formado por perfilería metálica galvanizada Z1 de ${perfilMm} mm`;
    } else if (systemId.startsWith('TA-')) {
      descripcion = `Sistema de trasdosado ligero sobre muro existente con perfilería metálica galvanizada Z1 de ${perfilMm} mm`;
    } else if (systemId.startsWith('T-')) {
      descripcion = `Sistema de techo continuo ligero`;
    } else if (systemId.startsWith('EL-')) {
      descripcion = `Sistema de fachada ligera exterior`;
    }
    
    // Añadir información de placas
    const totalPlacas = capasPorCara * 2;
    descripcion += ` y ${totalPlacas} placas de yeso laminado de ${espesorReal} mm de espesor`;
    
    // Tipo de placa
    if (tipoPlaca === 'AQUA') {
      descripcion += ' con aditivo hidrófugo para zonas húmedas';
    }
    
    // Medidas estándar
    descripcion += ' (formato estándar 1200 × 2500 mm)';
    
    return descripcion;
  }

  /**
   * Calcular espesor total aproximado
   */
  calcularEspesorTotal(systemId, metadata) {
    const { perfilMm, espesorReal, capasPorCara } = metadata;
    
    // Determinar caras (muros = 2, trasdosados y techos = 1)
    let caras = 1;
    if (systemId.startsWith('M-')) {
      caras = 2;
    }
    
    const espesorTotal = Math.round(perfilMm + (capasPorCara * caras * espesorReal));
    return espesorTotal;
  }

  /**
   * Extraer formato de placa del catálogo
   */
  getFormatoPlaca(codigoPlaca) {
    if (!this.catalogoLoaded) return '1200 × 2500 mm';
    
    const material = this.catalogo.get(codigoPlaca);
    if (!material) return '1200 × 2500 mm';
    
    // Intentar extraer formato del concepto
    const match = material.concepto.match(/(\d+)x(\d+)x(\d+)/i);
    if (match) {
      const [, espesor, ancho, largo] = match;
      return `${ancho} × ${largo} mm`;
    }
    
    return '1200 × 2500 mm';
  }

  /**
   * Validar que todos los materiales del sistema existen en catálogo
   */
  validarMateriales(materiales) {
    if (!this.catalogoLoaded) {
      return { valido: false, errores: ['Catálogo no cargado'] };
    }
    
    const errores = [];
    const noEncontrados = [];
    
    for (const material of materiales) {
      if (!this.catalogo.has(material.codigo)) {
        noEncontrados.push(material.codigo);
        errores.push(`Material no encontrado en catálogo: ${material.codigo}`);
      }
    }
    
    return {
      valido: noEncontrados.length === 0,
      noEncontrados,
      errores
    };
  }

  /**
   * Generar todos los metadatos para un sistema
   */
  generarMetadatos(systemId, materiales = []) {
    try {
      // Parsear ID
      const metadata = this.parseSystemId(systemId);
      
      // Validar materiales
      const validacion = this.validarMateriales(materiales);
      
      // Generar metadatos
      const metadatos = {
        systemId,
        titulo_pdf: this.generarTitulo(systemId, metadata),
        descripcion_tecnica_corta: this.generarDescripcion(systemId, metadata, materiales),
        espesor_total_mm: this.calcularEspesorTotal(systemId, metadata),
        tipo: metadata.tipo,
        subtipo: metadata.subtipo,
        perfil_mm: metadata.perfilMm,
        espesor_nominal_mm: metadata.espesorNominal,
        espesor_real_mm: metadata.espesorReal,
        capas_por_cara: metadata.capasPorCara,
        tipo_placa: metadata.tipoPlaca,
        validacion_catalogo: validacion,
        generado_en: new Date().toISOString()
      };
      
      return metadatos;
      
    } catch (error) {
      console.error(`Error generando metadatos para ${systemId}:`, error);
      return {
        systemId,
        error: error.message,
        titulo_pdf: `Sistema ${systemId}`,
        descripcion_tecnica_corta: 'Descripción no disponible',
        espesor_total_mm: 0
      };
    }
  }
}


// ESM default export
export default SystemMetadataGenerator;

// Optional global for debugging
if (typeof window !== 'undefined') {
  window.SystemMetadataGenerator = SystemMetadataGenerator;
}
