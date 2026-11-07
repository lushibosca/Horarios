// ====================================================================
// STORAGE KEYS — MODULE
// ====================================================================
// APP_VERSION debe coincidir con el prefijo de CACHE_NAME en sw.js (lo valida tests/architecture.test.mjs).
export const APP_NOMBRE = 'LUSHIBOSCA';
export const APP_VERSION = 'v261107';

export const APP_STORAGE_PREFIX = 'horarios_';

export const STORAGE_KEYS = Object.freeze({
    TEMA_OSCURO: 'temaOscuro',
    VISTA_ACTUAL: 'vistaActual',
    MODO_ESTADISTICAS: 'modoEstadisticas',
    HOVER_POPUP: 'hoverPopupCalendario',
    RUEDA_CALENDARIO: 'ruedaCalendario',
    REDUCIR_ANIMACIONES: 'reducirAnimaciones',
    FORMATO_CORTO_STATS: 'formatoCortoStats',
    ESTILO_CALENDARIO: 'estiloCalendario',
    HINT_INTEGRADO: 'hintIntegrado',
    DESC_HITOS_NUMERO: 'descHitosNumero',   // con el hint integrado: el nombre del hito enfocado va en el número grande en vez de desplegarse en la barra
    CICLO_HINT_AUTO: 'cicloHintAuto',       // con el hint integrado: el ciclo automático de fases del número grande (al tocarlo o al fichar)
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
    ORDEN_CARDS_MOVIL: 'ordenCardsMovil',
    COLUMNAS_CARDS: 'columnasCards',   // cuántas tarjetas hay en cada columna de escritorio (se corta el orden de ORDEN_CARDS)
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

// Tarjetas que se pueden ocultar y reordenar, en su orden por defecto (la de fichaje con la barra de progreso va siempre arriba y no cuenta).
// En escritorio las dos últimas pasan a la columna derecha.
export const CARDS = Object.freeze(['registrar', 'estadisticas', 'historico']);
// Tarjetas que se pueden ubicar: las anteriores más la de estado ("Hoy", id `stats-card`), que se mueve pero no se oculta. Va primera por defecto.
export const CARDS_ORDEN = Object.freeze(['estado', ...CARDS]);

// Valores por defecto de opciones booleanas que se leen desde varios módulos (un solo lugar para que no se desincronicen)
export const DEFAULTS = Object.freeze({
    HINT_INTEGRADO: true,
    DESC_HITOS_NUMERO: true,
    CICLO_HINT_AUTO: true,
    RUEDA_CALENDARIO: true,
});


// Duración (ms) de los toasts según la importancia del mensaje
export const TOAST_MS = Object.freeze({
    NORMAL: 3000,
    LARGO: 4000,
    AVISO: 5000,
});

// Demora (ms) de las tareas que se lanzan al arrancar la app, para no competir con el primer render
export const DEMORA_ARRANQUE_MS = Object.freeze({
    AVISO_PUSH: 2000,
    REGISTRAR_USO: 3000,
    FERIADOS: 4000,
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
