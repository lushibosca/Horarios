import { Preferencias } from '../core/preferencias.js';
import { EstiloTarjeta, ESTILOS_TARJETA, DISPOSICIONES_LINEA, MOSAICOS_LINEA, DISPOSICIONES_ANILLO } from '../core/estilo-tarjeta.js';
import { STORAGE_KEYS, CARDS, DESDE_SIEMPRE, FONDO_CARD_POR_DEFECTO } from '../core/constantes.js';
import { EstiloCalendario, ESTILOS_CALENDARIO } from '../core/estilo-calendario.js';
import { PosicionHeader, posicionesPermitidas } from '../core/posicion-header.js';
import { FONDOS_SVG } from '../data/fondos.js';
import { Movimiento } from '../core/movimiento.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { EventosApp } from '../core/eventos.js';
import { Cambios } from './cambios.js';
import { TiposRegistro } from './tipos-registro.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp as D } from './estado-app.js';
import { normalizarOrdenCards, leerLayout, columnasDesdeOrden, tamanosDeColumnas, esTamanosColumnasValidos } from './orden-cards.js';
import { DiasHabiles } from './dias-habiles.js';
import { Objetivos } from './objetivos.js';

// ====================================================================
//           IMPORT / EXPORT & BACKUP NORMALIZATION MODULE
// ====================================================================
// Qué tarjetas se ven: no es una clave de almacenamiento (se guarda una por tarjeta y por perfil), solo el nombre en el archivo
const CLAVE_TARJETAS_VISIBLES = 'tarjetasVisibles';

// Diseño de la interfaz (orden y visibilidad de tarjetas). Un archivo de otra versión puede traer ids que esta no conoce:
// se aceptan mientras sean textos cortos y pocos, y al aplicarlos se descartan los desconocidos (el orden vuelve a filtrar al leer).
const MAX_ITEMS_LISTA_UI = 64;
const MAX_LARGO_ID_UI = 40;
const _esListaDeIds = (v) => Array.isArray(v) && v.length <= MAX_ITEMS_LISTA_UI && v.every(x => typeof x === 'string' && x.length > 0 && x.length <= MAX_LARGO_ID_UI);
const _esMapaDeBooleanos = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= MAX_ITEMS_LISTA_UI && Object.values(v).every(x => typeof x === 'boolean');

const _leer = (clave) => Almacenamiento.getObject(clave, null, true);
const _ordenActual = () => leerLayout(2, _leer).orden;
// Sin orden propio para móvil o para 3 columnas se usa el de 2 columnas (con sus tamaños): ver leerLayout
const _ordenMovilActual = () => leerLayout(1, _leer).orden;
const _orden3Actual = () => leerLayout(3, _leer).orden;
// Tamaños de las columnas de escritorio (sin tamaños guardados, el reparto por defecto)
const _tamanosActuales = (modo) => { const { orden, tamanos } = leerLayout(modo, _leer); return tamanosDeColumnas(columnasDesdeOrden(orden, tamanos)); };
const _columnasActuales = () => _tamanosActuales(2);
const _columnas3Actuales = () => _tamanosActuales(3);
const _visiblesActuales = () => Object.fromEntries(CARDS.map(c => [c, Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE(c), true, true)]));

const _avisarHint = () => EventosApp.emit('config:hint-integrado');

/** @param {any} pref @param {string} etiqueta @param {any} [alAplicar] */
const _opcion = (pref, etiqueta, alAplicar = null) => ({
    clave: pref.clave,
    etiqueta,
    esValido: (v) => typeof v === 'boolean',
    actual: pref.get,
    aplicar: (v) => { pref.set(v); alAplicar?.(v); },
});

/** @param {string} clave @param {string} etiqueta @param {() => string[]} actual @param {any} [alAplicar] */
const _ordenDeTarjetas = (clave, etiqueta, actual, alAplicar = null) => ({
    clave,
    etiqueta,
    tarjetas: true,
    esValido: _esListaDeIds,
    actual,
    distinto: (v) => normalizarOrdenCards(v).join() !== actual().join(),
    aplicar: (v, data) => { Almacenamiento.setItem(clave, normalizarOrdenCards(v), true); alAplicar?.(data); },
});

/**
 * Configuración que viaja en un respaldo. Cada campo sabe validarse, leerse, aplicarse y decir si cambió
 * (`distinto`: por defecto, comparar con lo actual); `tarjetas` indica que al aplicarlo hay que redibujar las tarjetas.
 * Lo que un archivo no trae (o trae inválido) no se toca: los respaldos viejos no incluyen todo.
 * @type {any[]}
 */
const CONFIG_RESPALDO = [
    { ..._opcion(Preferencias.IGNORAR_TF, 'tiempo fuera', (v) => D.setIgnorarTiempoFuera(v)), actual: () => D.getIgnorarTiempoFuera() },
    _opcion(Preferencias.IGNORAR_LOGICA_CUBIERTO, 'banco de horas'),
    _opcion(Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO, 'objetivo diario global'),
    {
        clave: STORAGE_KEYS.REDUCIR_ANIMACIONES,
        etiqueta: 'animaciones',
        esValido: (v) => ['auto', 'on', 'off'].includes(v),
        actual: () => Movimiento.modo(),
        aplicar: (v) => Movimiento.setModo(v),
    },
    // Un respaldo viejo solo trae el interruptor del hint integrado (= barra con hitos o clásica); uno nuevo trae además el estilo, que se aplica después y manda
    _opcion(Preferencias.HINT_INTEGRADO, 'hint integrado', (v) => { EstiloTarjeta.desdeHintIntegrado(v); _avisarHint(); }),
    {
        clave: STORAGE_KEYS.ESTILO_TARJETA,
        etiqueta: 'estilo de la tarjeta de estado',
        esValido: (v) => ESTILOS_TARJETA.some(e => e.id === v),
        actual: EstiloTarjeta.actual,
        aplicar: (v) => { EstiloTarjeta.setEstilo(v); _avisarHint(); },
    },
    {
        clave: STORAGE_KEYS.LINEA_DISPOSICION,
        etiqueta: 'disposición de la línea de tiempo',
        esValido: (v) => DISPOSICIONES_LINEA.some(d => d.id === v),
        actual: EstiloTarjeta.disposicion,
        aplicar: (v) => { EstiloTarjeta.setDisposicion(v); _avisarHint(); },
    },
    {
        clave: STORAGE_KEYS.LINEA_MOSAICOS,
        etiqueta: 'posición de los mosaicos de la línea de tiempo',
        esValido: (v) => MOSAICOS_LINEA.some(m => m.id === v),
        actual: EstiloTarjeta.mosaicos,
        aplicar: (v) => { EstiloTarjeta.setMosaicos(v); _avisarHint(); },
    },
    {
        clave: STORAGE_KEYS.ANILLO_DISPOSICION,
        etiqueta: 'disposición del anillo',
        esValido: (v) => DISPOSICIONES_ANILLO.some(d => d.id === v),
        actual: EstiloTarjeta.anillo,
        aplicar: (v) => { EstiloTarjeta.setAnillo(v); _avisarHint(); },
    },
    _opcion(Preferencias.DESC_HITOS_NUMERO, 'nombre del hito en el número', _avisarHint),
    _opcion(Preferencias.CICLO_HINT_AUTO, 'ciclo automático del hint', _avisarHint),
    // Apariencia y comportamiento del resto de la app (ver CLAVES_AJUSTES_INSTALACION: lo que está ahí viaja acá y "Restablecer" lo borra)
    _opcion(Preferencias.FORMATO_CORTO_STATS, 'formato de tiempo corto', () => EventosApp.emit('config:formato-corto-stats')),
    {
        clave: STORAGE_KEYS.ESTILO_CALENDARIO,
        etiqueta: 'estilo del calendario',
        esValido: (v) => ESTILOS_CALENDARIO.some(e => e.id === v),
        actual: EstiloCalendario.actual,
        aplicar: (v) => EstiloCalendario.setEstilo(v),
    },
    {
        clave: STORAGE_KEYS.POSICION_HEADER,
        etiqueta: 'posición del encabezado (PC)',
        esValido: (v) => posicionesPermitidas(true).includes(v),
        actual: () => PosicionHeader.guardada(true),
        aplicar: (v) => PosicionHeader.fijar(true, v),
    },
    {
        clave: STORAGE_KEYS.POSICION_HEADER_MOVIL,
        etiqueta: 'posición del encabezado (móvil)',
        esValido: (v) => posicionesPermitidas(false).includes(v),
        actual: () => PosicionHeader.guardada(false),
        aplicar: (v) => PosicionHeader.fijar(false, v),
    },
    _opcion(Preferencias.HOVER_POPUP, 'popup del calendario (PC)'),
    _opcion(Preferencias.RUEDA_CALENDARIO, 'rueda del calendario (PC)', () => EventosApp.emit('config:rueda-calendario')),
    _opcion(Preferencias.PERSISTIR_TARJETAS, 'recordar estado de tarjetas'),
    // El fondo es del perfil (cada perfil tiene el suyo); un id que esta versión no conoce se descarta
    {
        clave: STORAGE_KEYS.FONDO_CARD,
        etiqueta: 'fondo de la tarjeta de estado',
        esValido: (v) => v === 'ninguno' || FONDOS_SVG.some(f => f.id === v),
        actual: () => Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, FONDO_CARD_POR_DEFECTO, true),
        aplicar: (v) => { Almacenamiento.setItem(STORAGE_KEYS.FONDO_CARD, v, true); EventosApp.emit('config:fondo-card'); },
    },
    // Un respaldo con orden pero sin columnas (versiones anteriores) usa el reparto por defecto: los tamaños viejos no corresponderían al orden nuevo
    _ordenDeTarjetas(STORAGE_KEYS.ORDEN_CARDS, 'orden de tarjetas', _ordenActual, (data) => {
        if (!Array.isArray(data[STORAGE_KEYS.COLUMNAS_CARDS])) Almacenamiento.removeItem(STORAGE_KEYS.COLUMNAS_CARDS, true);
    }),
    _ordenDeTarjetas(STORAGE_KEYS.ORDEN_CARDS_MOVIL, 'orden de tarjetas (móvil)', _ordenMovilActual),
    _ordenDeTarjetas(STORAGE_KEYS.ORDEN_CARDS_3, 'orden de tarjetas (3 columnas)', _orden3Actual, (data) => {
        if (!Array.isArray(data[STORAGE_KEYS.COLUMNAS_CARDS_3])) Almacenamiento.removeItem(STORAGE_KEYS.COLUMNAS_CARDS_3, true);
    }),
    {
        clave: STORAGE_KEYS.COLUMNAS_CARDS,
        etiqueta: 'columnas de tarjetas',
        tarjetas: true,
        esValido: (v) => esTamanosColumnasValidos(v),
        actual: _columnasActuales,
        distinto: (v) => v.join() !== _columnasActuales().join(),
        aplicar: (v) => Almacenamiento.setItem(STORAGE_KEYS.COLUMNAS_CARDS, v, true),
    },
    {
        clave: STORAGE_KEYS.COLUMNAS_CARDS_3,
        etiqueta: 'columnas de tarjetas (3 columnas)',
        tarjetas: true,
        esValido: (v) => esTamanosColumnasValidos(v),
        actual: _columnas3Actuales,
        distinto: (v) => v.join() !== _columnas3Actuales().join(),
        aplicar: (v) => Almacenamiento.setItem(STORAGE_KEYS.COLUMNAS_CARDS_3, v, true),
    },
    {
        clave: CLAVE_TARJETAS_VISIBLES,
        etiqueta: 'tarjetas visibles',
        tarjetas: true,
        esValido: _esMapaDeBooleanos,
        actual: _visiblesActuales,
        distinto: (v) => {
            const actuales = _visiblesActuales();
            return CARDS.some(c => typeof v[c] === 'boolean' && v[c] !== actuales[c]);
        },
        aplicar: (v) => CARDS.forEach(c => {
            if (typeof v[c] === 'boolean') Almacenamiento.setItem(STORAGE_KEYS.CARD_VISIBLE(c), v[c], true);
        }),
    },
];

function obtenerConfigExportable() {
    return Object.fromEntries(CONFIG_RESPALDO.map(c => [c.clave, c.actual()]));
}

function validarCamposConfigImport(data) {
    if (!data || typeof data !== 'object') return false;
    return CONFIG_RESPALDO.every(c => data[c.clave] === undefined || c.esValido(data[c.clave]));
}

/** @param {any} [registrosParaRecalcular] */
function aplicarConfigImportada(data, registrosParaRecalcular = null) {
    if (!data || typeof data !== 'object') return;
    const dias = S.sanitizarDiasHabiles(data.diasHabiles);
    if (dias) D.setDiasHabiles(dias);
    if (data.horasDiarias !== undefined && data.horasDiarias !== null) {
        const h = typeof data.horasDiarias === 'string' ? parseFloat(data.horasDiarias) : data.horasDiarias;
        if (Number.isFinite(h) && h >= 0 && h <= 24) D.setHorasDiarias(h);
    }
    const historialImportado = DiasHabiles.sanitizarHistorialDiasHabiles(data.historialDiasHabiles);
    D._setHistorialDiasHabilesRaw(historialImportado || [{ desde: DESDE_SIEMPRE, dias: D.diasHabiles() }]);
    D.setDiasHabiles(DiasHabiles.diasHabilesEnFecha(TiempoUtils.obtenerFechaHoy()));

    const aplicados = CONFIG_RESPALDO.filter(c => c.esValido(data[c.clave]));
    aplicados.forEach(c => c.aplicar(data[c.clave], data));
    if (aplicados.some(c => c.tarjetas)) EventosApp.emit('config:tarjetas');

    if (Array.isArray(registrosParaRecalcular)) {
        registrosParaRecalcular.forEach(r => {
            if (TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) return;
            D._aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera || null, r.credito || null);
        });
    }
}

function calcularCambiosConfigImport(data) {
    const cambios = [];
    if (!data || typeof data !== 'object') return cambios;
    if (Array.isArray(data.diasHabiles)) {
        const diasGist = [...data.diasHabiles].sort().join(',');
        const diasLocal = [...D.diasHabiles()].sort().join(',');
        if (diasGist !== diasLocal) cambios.push('días laborales');
    }
    if (data.horasDiarias != null && parseFloat(data.horasDiarias) !== D.horasDiarias()) {
        cambios.push(`horas diarias (${D.horasDiarias()}h → ${parseFloat(data.horasDiarias)}h)`);
    }
    CONFIG_RESPALDO.forEach(c => {
        const v = data[c.clave];
        if (c.esValido(v) && (c.distinto ? c.distinto(v) : v !== c.actual())) cambios.push(c.etiqueta);
    });
    return cambios;
}

function normalizarRegistrosImportados(rawList) {
    const validarHora = (h) => (typeof h === 'string' && TiempoUtils.validarHora(h)) ? h : null;
    const hoy = TiempoUtils.obtenerFechaHoy();
    const validos = rawList.filter(r => S.validarRegistroSeguro(r));
    const vigentes = validos.filter(r => r.fecha <= hoy || TiposRegistro.esRegistroEspecial(r.entrada, r.salida));
    const descartadosFuturos = validos.length - vigentes.length;
    if (descartadosFuturos > 0)
        D._notify().mostrarToast(`${TiempoUtils.contar(descartadosFuturos, 'registro')} normal${descartadosFuturos > 1 ? 'es' : ''} con fecha futura omitido${TiempoUtils.pluralizar(descartadosFuturos)}`, 'warning');
    // validarRegistroSeguro ya garantizó el id y los rangos de horas, minutos y total
    const normalizados = vigentes.map(r => ({
        id: r.id,
        fecha: r.fecha,
        entrada: validarHora(r.entrada), salida: validarHora(r.salida), tiempoFuera: validarHora(r.tiempoFuera),
        horas: r.horas,
        minutos: r.minutos,
        total: r.total,
        credito: validarHora(r.credito),
        notas: S.normalizarNotas(r.notas),
        objetivoHoras: S.esObjetivoHorasValido(r.objetivoHoras) ? r.objetivoHoras : undefined,
        referenciaCompensatorio: (typeof r.referenciaCompensatorio === 'string' && TiempoUtils.validarFecha(r.referenciaCompensatorio))
            ? r.referenciaCompensatorio
            : undefined,
    }));

    const unicos = _sinDuplicados(normalizados);
    const descartadosDuplicados = normalizados.length - unicos.length;
    if (descartadosDuplicados > 0)
        D._notify().mostrarToast(`${TiempoUtils.contar(descartadosDuplicados, 'registro')} con fecha repetida omitido${TiempoUtils.pluralizar(descartadosDuplicados)}`, 'warning');

    unicos.forEach(r => {
        if (TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) return;
        D._aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera || null, r.credito || null);
    });
    return unicos;
}

// Un registro por fecha (la app lo da por hecho: registroPorFecha) e ids únicos. Ante fechas repetidas queda el
// registro más completo (con salida antes que sin ella); a igualdad, el primero del archivo.
function _sinDuplicados(lista) {
    const porFecha = new Map();
    for (const r of lista) {
        const previo = porFecha.get(r.fecha);
        if (!previo || (!previo.salida && r.salida)) porFecha.set(r.fecha, r);
    }
    const ids = new Set();
    return lista.filter(r => porFecha.get(r.fecha) === r).map(r => {
        const id = ids.has(r.id) ? S.generarIDSeguro() : r.id;
        ids.add(id);
        return id === r.id ? r : { ...r, id };
    });
}

/**
 * Contenido de un respaldo (archivo completo, por rango o Gist): los registros dados, la configuración actual,
 * versión del esquema y hash SHA-256 de los registros. Es el formato que lee prepararRespaldo.
 * @param {any[]} registros
 * @param {Record<string, any>} [extra] metadatos adicionales (p. ej. rangoExportado)
 */
async function armarRespaldo(registros, extra = {}) {
    return {
        registros, diasHabiles: D.diasHabiles(), horasDiarias: D.horasDiarias(), historialDiasHabiles: D.historialDiasHabiles(),
        ...obtenerConfigExportable(),
        fecha: TiempoUtils.fechaLocalISOFull(), version: S.SECURITY_LIMITS.SCHEMA_VERSION,
        hash: await S.calcularHashSHA256(registros), timestamp: Date.now(),
        ...extra
    };
}

async function exportarJSON() {
    const data = await armarRespaldo(D.registros());
    try {
        const nombreSafe = D._notify().obtenerNombrePerfilSafe();
        const fechaHoy = TiempoUtils.fechaLocalISOFull().slice(0, 10);
        D._notify().descargarJSON(data, `Horarios_${nombreSafe}_${fechaHoy}.json`);
        D._notify().mostrarToast('Datos exportados', 'success');
        D._notify().cerrarTodosModales();
    } catch (e) {
        console.error(e);
        D._notify().mostrarToast('Error al exportar', 'error');
    }
}

// Claves que puede traer un respaldo (archivo local o Gist): cualquier otra se considera sospechosa
const CLAVES_RAIZ_RESPALDO = ['registros', STORAGE_KEYS.DIAS_HABILES, STORAGE_KEYS.HORAS_DIARIAS, STORAGE_KEYS.HISTORIAL_DIAS_HABILES, ...CONFIG_RESPALDO.map(c => c.clave), 'fecha', 'version', 'hash', 'timestamp', 'rangoExportado'];
const _NOMBRE_ORIGEN = { archivo: 'archivo', gist: 'Gist' };

/** Chequeo estructural de un respaldo ya parseado. Devuelve el mensaje de error o null si es válido. */
function errorEstructuraRespaldo(data, nombre = 'archivo') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return `Estructura del ${nombre} inválida`;
    if (!Array.isArray(data.registros)) return `${nombre[0].toUpperCase()}${nombre.slice(1)} inválido o corrupto`;
    if (Object.keys(data).some(k => !CLAVES_RAIZ_RESPALDO.includes(k)) || !validarCamposConfigImport(data)) return `${nombre[0].toUpperCase()}${nombre.slice(1)} con estructura sospechosa`;
    if (data.registros.length > S.SECURITY_LIMITS.MAX_REGISTROS) return `Máximo ${S.SECURITY_LIMITS.MAX_REGISTROS} registros permitidos`;
    if (data.rangoExportado !== undefined &&
        (typeof data.rangoExportado !== 'string' || data.rangoExportado.length > 100 || !/^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-:]+$/.test(data.rangoExportado))) {
        return 'Metadatos de rango inválidos';
    }
    return null;
}

async function _confirmarIntegridad(data, nombre) {
    const notify = D._notify();
    if (!data.hash) return notify.confirmarModal(`Este ${nombre} no tiene verificación de integridad. ¿Restaurar de todas formas?`, 'Restaurar', '#icon-upload');
    if (await S.calcularHashSHA256(data.registros) === data.hash) return true;
    notify.mostrarToast(`⚠️ El ${nombre} puede estar corrupto o modificado`, 'warning');
    return notify.confirmarModal('El hash de integridad no coincide. ¿Restaurar de todas formas?', 'Restaurar', '#icon-upload');
}

/**
 * Valida un respaldo (estructura, versión e integridad, con confirmación del usuario si hace falta) y devuelve
 * { registros } con los registros normalizados, o { error } si no se puede usar (ya se avisó al usuario). Mismo camino para archivo y Gist.
 * @param {'archivo'|'gist'} [origen]
 */
async function prepararRespaldo(data, origen = 'archivo') {
    const notify = D._notify();
    const nombre = _NOMBRE_ORIGEN[origen] || 'archivo';
    const error = errorEstructuraRespaldo(data, nombre);
    if (error) { notify.mostrarToast(error, 'error'); return { error }; }
    if (data.version && data.version > S.SECURITY_LIMITS.SCHEMA_VERSION) {
        notify.mostrarToast(`El ${nombre} es de una versión más nueva (v${data.version}). Algunos datos pueden no importarse correctamente.`, 'warning', 4000);
    }
    if (!(await _confirmarIntegridad(data, nombre))) return { error: 'Restauración cancelada' };
    const registros = normalizarRegistrosImportados(data.registros);
    if (registros.length === 0) {
        notify.mostrarToast('No se encontraron registros válidos', 'warning');
        return { error: 'No se encontraron registros válidos' };
    }
    return { registros };
}

// Un registro importado completa al local de la misma fecha si le aporta la salida o el tiempo fuera
const _completaAlLocal = (local, imp) => (!local.salida && imp.salida) || (!local.tiempoFuera && imp.tiempoFuera);

/** Compara los registros importados con los locales (por fecha). */
function calcularDiferencias(importados) {
    const locales = D.registros();
    const localesPorFecha = new Map(locales.map(r => [r.fecha, r]));
    const importadosPorFecha = new Map(importados.map(r => [r.fecha, r]));
    const enAmbos = importados.filter(r => localesPorFecha.has(r.fecha));
    return {
        soloImportados: importados.filter(r => !localesPorFecha.has(r.fecha)),
        enAmbos,
        soloLocal: locales.filter(r => !importadosPorFecha.has(r.fecha)),
        complementarios: enAmbos.filter(imp => _completaAlLocal(localesPorFecha.get(imp.fecha), imp))
    };
}

/**
 * Resultado de combinar los importados con los locales, sin tocar el estado:
 * `{ vacio: true }`, `{ error }` o `{ registros, mensaje }`.
 * @returns {{ vacio?: boolean, error?: string, registros?: any[], mensaje?: string }}
 */
function calcularCombinacion(importados) {
    const { soloImportados, complementarios } = calcularDiferencias(importados);
    if (soloImportados.length === 0 && complementarios.length === 0) return { vacio: true };
    if (!D._hayEspacioParaRegistros(soloImportados.length)) {
        return { error: `Límite alcanzado. Solo se pueden agregar ${S.SECURITY_LIMITS.MAX_REGISTROS - D.registros().length} registros más` };
    }
    const compPorFecha = new Map(complementarios.map(c => [c.fecha, c]));
    const actualizados = D.registros().map(local => {
        const imp = compPorFecha.get(local.fecha);
        if (!imp) return local;
        const actualizado = { ...local };
        if (!actualizado.salida && imp.salida) actualizado.salida = imp.salida;
        if (!actualizado.tiempoFuera && imp.tiempoFuera) actualizado.tiempoFuera = imp.tiempoFuera;
        D._recalcularHorasSiValido(actualizado);
        return actualizado;
    });
    const p = (n, sustantivo, adjetivo) => `${n} ${sustantivo}${TiempoUtils.pluralizar(n)} ${adjetivo}${TiempoUtils.pluralizar(n)}`;
    const partes = [];
    if (soloImportados.length > 0) partes.push(p(soloImportados.length, 'día', 'nuevo'));
    if (complementarios.length > 0) partes.push(p(complementarios.length, 'registro', 'completado'));
    return { registros: [...actualizados, ...soloImportados], mensaje: `Combinado: ${partes.join(', ')}` };
}

/**
 * Aplica un respaldo ya preparado: 'merge' combina con los registros locales; 'replace' los reemplaza y aplica la configuración.
 * @param {'merge'|'replace'} modo
 * @param {{ etiqueta?: string, cerrarImportar?: boolean }} [opciones] etiqueta: texto para el historial de deshacer ("con Gist")
 * @returns {Promise<{ ok: boolean, vacio?: boolean }>}
 */
async function restaurarRespaldo(data, importados, modo, opciones = {}) {
    const { etiqueta = 'con archivo local', cerrarImportar = true } = opciones;
    const notify = D._notify();
    if (modo === 'merge') {
        const c = calcularCombinacion(importados);
        if (c.vacio) { notify.mostrarToast('No hay días nuevos ni datos para completar', 'info'); return { ok: false, vacio: true }; }
        if (c.error || !c.registros) { notify.mostrarToast(c.error || 'No se pudo combinar', 'error'); return { ok: false }; }
        return { ok: await _guardarRegistrosImportados(c.registros, c.mensaje || 'Combinado', `combinar ${etiqueta}`, cerrarImportar) };
    }
    aplicarConfigImportada(data, importados);
    const n = importados.length;
    const mensaje = `Se reemplazaron los datos por ${n === 1 ? '1 registro' : `${n} registros`}`;
    return { ok: await _guardarRegistrosImportados(importados, mensaje, `reemplazar ${etiqueta}`, cerrarImportar) };
}

/** @param {File|undefined} file archivo elegido por el usuario (lo obtiene la UI del input) */
function importarDatos(file, modo = 'replace') {
    if (!file) { D._notify().mostrarToast('Seleccioná un archivo primero', 'error'); return; }
    if (file.size > S.SECURITY_LIMITS.MAX_JSON_SIZE) { D._notify().mostrarToast('Archivo muy grande', 'error'); return; }
    // Algunos navegadores informan un tipo vacío o genérico para un .json: alcanza con la extensión (el contenido se valida igual después)
    if (file.type !== 'application/json' && !/\.json$/i.test(file.name ?? '')) { D._notify().mostrarToast('Solo se permiten archivos JSON', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const contenido = String(e.target?.result ?? '');
            if (!contenido || contenido.trim().length === 0) { D._notify().mostrarToast('Archivo vacío', 'error'); return; }
            if (contenido.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) { D._notify().mostrarToast('Contenido del archivo demasiado grande', 'error'); return; }

            const data = JSON.parse(contenido, S.reviverJSONSeguro);
            const preparado = await prepararRespaldo(data, 'archivo');
            if ('error' in preparado) return;
            await restaurarRespaldo(data, preparado.registros, modo === 'merge' ? 'merge' : 'replace');
        } catch (err) {
            console.error('Error en importación:', err);
            D._notify().mostrarToast(err instanceof SyntaxError ? 'Archivo JSON mal formado' : 'Error al procesar el archivo', 'error');
        }
    };
    reader.onerror = () => { D._notify().mostrarToast('Error al leer el archivo', 'error'); };
    reader.readAsText(file);
}

async function _guardarRegistrosImportados(registros, mensajeExito, descripcion, cerrarImportar) {
    D._setRegistros(registros);
    D.ordenarRegistros();
    Objetivos.migrarObjetivoHorasFaltante();
    D.sincronizarPushHoy();
    if (!(await Cambios.confirmar(descripcion))) return false;
    const notify = D._notify();
    notify.mostrarToast(mensajeExito, 'success');
    if (cerrarImportar) notify.cerrarImportar();
    notify.refrescarConfigSiVisible();
    return true;
}

export const ImportarExportar = {
    obtenerConfigExportable,
    validarCamposConfigImport,
    aplicarConfigImportada,
    calcularCambiosConfigImport,
    normalizarRegistrosImportados,
    armarRespaldo,
    exportarJSON,
    errorEstructuraRespaldo,
    prepararRespaldo,
    calcularDiferencias,
    restaurarRespaldo,
    importarDatos
};
