// ====================================================================
// STORAGE KEYS — MODULE
// ====================================================================
// APP_VERSION debe coincidir con el prefijo de CACHE_NAME en sw.js (lo valida tests/architecture.test.mjs).
export const APP_NOMBRE = 'LUSHIBOSCA';
export const APP_VERSION = 'v261031';

export const APP_STORAGE_PREFIX = 'horarios_';

export const STORAGE_KEYS = Object.freeze({
    TEMA_OSCURO: 'temaOscuro',
    VISTA_ACTUAL: 'vistaActual',
    MODO_ESTADISTICAS: 'modoEstadisticas',
    HOVER_POPUP: 'hoverPopupCalendario',
    RUEDA_CALENDARIO: 'ruedaCalendario',
    REDUCIR_ANIMACIONES: 'reducirAnimaciones',
    FORMATO_CORTO_STATS: 'formatoCortoStats',
    HINT_INTEGRADO: 'hintIntegrado',
    DIAS_HABILES: 'diasHabiles',
    HISTORIAL_DIAS_HABILES: 'historialDiasHabiles',
    HORAS_DIARIAS: 'horasDiarias',
    VISTA_HISTORICO_CAL: 'vistaHistoricoCalendario',
    IGNORAR_TF: 'ignorarTiempoFuera',
    IGNORAR_LOGICA_CUBIERTO: 'ignorarLogicaCubierto',
    IGNORAR_OBJETIVO_POR_REGISTRO: 'ignorarObjetivoPorRegistro',
    FONDO_CARD: 'fondoCard',
    PERSISTIR_TARJETAS: 'persistirTarjetas',
    ORDEN_CARDS: 'ordenCards',
    FORMULARIO_EXPANDIDO: 'formularioExpandido',
    STATS_EXPANDIDO: 'statsExpandido',
    HISTORICO_EXPANDIDO: 'historicoExpandido',
    PERFIL_ACTIVO: 'perfilActivo',
    PERFILES: 'perfiles',
    HISTORY: 'history',
    GIST_TOKEN: 'gistToken',
    BIENVENIDA_VISTA: 'bienvenidaVista',
    FERIADOS_PROCESADOS: 'feriadosAR_procesados',
    PUSH_ANTICIPACION_MIN: 'pushAnticipacionMin',
    PUSH_USAR_BUFFER_SEMANAL: 'pushUsarBufferSemanal',
    PUSH_BUFFER_SOLO_ULTIMO_DIA: 'pushBufferSoloUltimoDia',
    PUSH_HABILITADO: 'pushHabilitado',
    PUSH_INFO_ACTIVA: 'pushInfoActiva',
    PUSH_AVISOS_RESTANTES: 'pushAvisosRestantes',
    PUSH_INSTALL_ID: 'pushInstallId',
    PUSH_OWNER_TOKEN: 'pushOwnerToken',
    STATS_ID: 'statsId',
    STATS_ULTIMO_PING: 'statsUltimoPing',
    STATS_HABILITADO: 'statsHabilitado',

    BREAK_TIME: (perfilId) => `breakStartTime_${perfilId}`,
    GIST_LIMITE: (tipo) => `gistSyncLimite_${tipo}`,
    MES_EXPANDIDO: (clave) => `mes-${clave}-expandido`,
    ANIO_EXPANDIDO: (anioId) => `anio-${anioId}-expandido`,
    CARD_VISIBLE: (cual) => `cardVisible_${cual}`,
});

// Valores por defecto de opciones booleanas que se leen desde varios módulos (un solo lugar para que no se desincronicen)
export const DEFAULTS = Object.freeze({
    HINT_INTEGRADO: true,
    RUEDA_CALENDARIO: true,
});


// Estado de cada día de la semana en la tarjeta de fichaje (lo calcula el servicio; la vista lo traduce a colores y textos)
export const ESTADO_DIA = Object.freeze({
    ESPECIAL: 'especial',          // licencia, feriado... (sin horas)
    CERRADO: 'cerrado',            // jornada con entrada y salida
    ACTIVO: 'activo',              // jornada abierta que se está contando
    SIN_SALIDA: 'sin-salida',      // día pasado con entrada pero sin salida (jornada olvidada)
    SIN_REGISTRO: 'sin-registro',  // día laborable pasado sin registro
    FUTURO: 'futuro',              // hoy sin registro todavía o días que vienen
});

// Resultado de un día cerrado respecto de su objetivo
export const CUMPLIMIENTO = Object.freeze({
    CUMPLIDO: 'cumplido',
    CUBIERTO: 'cubierto',          // faltó, pero lo cubre el saldo de otro día
    FALTANTE: 'faltante',
});


// ====================================================================
// NUMERIC PRECISION — shared helper
// ====================================================================
export const EPS_HORAS = 1e-6;
export const horasGte = (valor, objetivo) => (valor - objetivo) > -EPS_HORAS;
export const horasEq = (valor, objetivo) => Math.abs(valor - objetivo) < EPS_HORAS;
