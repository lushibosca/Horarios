import { STORAGE_KEYS, DEFAULTS, CARDS } from '../core/constantes.js';
import { Movimiento } from '../core/movimiento.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { EventosApp } from '../core/eventos.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp as D } from './estado-app.js';
import { Compensatorios } from './compensatorios.js';
import { normalizarOrdenCards, columnasDesdeOrden, tamanosDeColumnas, esTamanosColumnasValidos } from './orden-cards.js';

// ====================================================================
//           IMPORT / EXPORT & BACKUP NORMALIZATION MODULE
// ====================================================================
// Qué tarjetas se ven: no es una clave de almacenamiento (se guarda una por tarjeta y por perfil), solo el nombre en el archivo
const CLAVE_TARJETAS_VISIBLES = 'tarjetasVisibles';

const KEYS_CONFIG_EXPORTABLE = [
    STORAGE_KEYS.IGNORAR_TF,
    STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO,
    STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO,
    STORAGE_KEYS.REDUCIR_ANIMACIONES,
    STORAGE_KEYS.HINT_INTEGRADO,
    STORAGE_KEYS.DESC_HITOS_NUMERO,
    STORAGE_KEYS.CICLO_HINT_AUTO,
    STORAGE_KEYS.ORDEN_CARDS,
    STORAGE_KEYS.ORDEN_CARDS_MOVIL,
    STORAGE_KEYS.COLUMNAS_CARDS,
    CLAVE_TARJETAS_VISIBLES
];

// Diseño de la interfaz (orden y visibilidad de tarjetas). Un archivo de otra versión puede traer ids que esta no conoce:
// se aceptan mientras sean textos cortos y pocos, y al aplicarlos se descartan los desconocidos (el orden vuelve a filtrar al leer).
const MAX_ITEMS_LISTA_UI = 64;
const MAX_LARGO_ID_UI = 40;
const _esListaDeIds = (v) => Array.isArray(v) && v.length <= MAX_ITEMS_LISTA_UI && v.every(x => typeof x === 'string' && x.length > 0 && x.length <= MAX_LARGO_ID_UI);
const _esMapaDeBooleanos = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= MAX_ITEMS_LISTA_UI && Object.values(v).every(x => typeof x === 'boolean');

const _ordenActual = () => normalizarOrdenCards(Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS, null, true));
// Sin orden propio para móvil se usa el de escritorio (así era antes de separarlos)
const _ordenMovilActual = () => normalizarOrdenCards(Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS_MOVIL, null, true) ?? Almacenamiento.getObject(STORAGE_KEYS.ORDEN_CARDS, null, true));
// Tamaños de las columnas de escritorio (sin tamaños guardados, el reparto por defecto)
const _columnasActuales = () => tamanosDeColumnas(columnasDesdeOrden(_ordenActual(), Almacenamiento.getObject(STORAGE_KEYS.COLUMNAS_CARDS, null, true)));
const _visiblesActuales = () => Object.fromEntries(CARDS.map(c => [c, Almacenamiento.getBoolean(STORAGE_KEYS.CARD_VISIBLE(c), true, true)]));

function obtenerConfigExportable() {
    return {
        [STORAGE_KEYS.IGNORAR_TF]: D.getIgnorarTiempoFuera(),
        [STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO]: Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true),
        [STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO]: Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true),
        [STORAGE_KEYS.REDUCIR_ANIMACIONES]: Movimiento.modo(),
        [STORAGE_KEYS.HINT_INTEGRADO]: Almacenamiento.getBoolean(STORAGE_KEYS.HINT_INTEGRADO, DEFAULTS.HINT_INTEGRADO),
        [STORAGE_KEYS.DESC_HITOS_NUMERO]: Almacenamiento.getBoolean(STORAGE_KEYS.DESC_HITOS_NUMERO, DEFAULTS.DESC_HITOS_NUMERO),
        [STORAGE_KEYS.CICLO_HINT_AUTO]: Almacenamiento.getBoolean(STORAGE_KEYS.CICLO_HINT_AUTO, DEFAULTS.CICLO_HINT_AUTO),
        [STORAGE_KEYS.ORDEN_CARDS]: _ordenActual(),
        [STORAGE_KEYS.ORDEN_CARDS_MOVIL]: _ordenMovilActual(),
        [STORAGE_KEYS.COLUMNAS_CARDS]: _columnasActuales(),
        [CLAVE_TARJETAS_VISIBLES]: _visiblesActuales()
    };
}

function validarCamposConfigImport(data) {
    if (!data || typeof data !== 'object') return false;
    const boolKeys = [
        STORAGE_KEYS.IGNORAR_TF,
        STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO,
        STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO,
        STORAGE_KEYS.HINT_INTEGRADO,
        STORAGE_KEYS.DESC_HITOS_NUMERO,
        STORAGE_KEYS.CICLO_HINT_AUTO
    ];
    for (const k of boolKeys) {
        if (data[k] !== undefined && typeof data[k] !== 'boolean') return false;
    }
    if (data[STORAGE_KEYS.REDUCIR_ANIMACIONES] !== undefined &&
        !['auto', 'on', 'off'].includes(data[STORAGE_KEYS.REDUCIR_ANIMACIONES])) {
        return false;
    }
    if (data[STORAGE_KEYS.ORDEN_CARDS] !== undefined && !_esListaDeIds(data[STORAGE_KEYS.ORDEN_CARDS])) return false;
    if (data[STORAGE_KEYS.ORDEN_CARDS_MOVIL] !== undefined && !_esListaDeIds(data[STORAGE_KEYS.ORDEN_CARDS_MOVIL])) return false;
    if (data[STORAGE_KEYS.COLUMNAS_CARDS] !== undefined && !esTamanosColumnasValidos(data[STORAGE_KEYS.COLUMNAS_CARDS])) return false;
    if (data[CLAVE_TARJETAS_VISIBLES] !== undefined && !_esMapaDeBooleanos(data[CLAVE_TARJETAS_VISIBLES])) return false;
    return true;
}

/** @param {any} [registrosParaRecalcular] */
function aplicarConfigImportada(data, registrosParaRecalcular = null) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.diasHabiles)) {
        const diasValidos = data.diasHabiles.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
        if (diasValidos.length > 0) D.setDiasHabiles(diasValidos);
    }
    if (data.horasDiarias !== undefined && data.horasDiarias !== null) {
        const h = typeof data.horasDiarias === 'string' ? parseFloat(data.horasDiarias) : data.horasDiarias;
        if (Number.isFinite(h) && h >= 0 && h <= 24) D.setHorasDiarias(h);
    }
    const historialImportado = Compensatorios.sanitizarHistorialDiasHabiles(data.historialDiasHabiles);
    D._setHistorialDiasHabilesRaw(historialImportado || [{ desde: '0001-01-01', dias: D.diasHabiles() }]);
    D.setDiasHabiles(Compensatorios.diasHabilesEnFecha(TiempoUtils.obtenerFechaHoy()));

    if (typeof data[STORAGE_KEYS.IGNORAR_TF] === 'boolean') {
        D.setIgnorarTiempoFuera(data[STORAGE_KEYS.IGNORAR_TF]);
        Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_TF, data[STORAGE_KEYS.IGNORAR_TF], true);
    }
    if (typeof data[STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO] === 'boolean') {
        Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, data[STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO], true);
    }
    if (typeof data[STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO] === 'boolean') {
        Almacenamiento.setItem(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, data[STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO], true);
    }
    if (['auto', 'on', 'off'].includes(data[STORAGE_KEYS.REDUCIR_ANIMACIONES])) {
        Movimiento.setModo(data[STORAGE_KEYS.REDUCIR_ANIMACIONES]);
    }
    if (typeof data[STORAGE_KEYS.HINT_INTEGRADO] === 'boolean') {
        Almacenamiento.setItem(STORAGE_KEYS.HINT_INTEGRADO, data[STORAGE_KEYS.HINT_INTEGRADO]);
        EventosApp.emit('config:hint-integrado');
    }
    if (typeof data[STORAGE_KEYS.DESC_HITOS_NUMERO] === 'boolean') {
        Almacenamiento.setItem(STORAGE_KEYS.DESC_HITOS_NUMERO, data[STORAGE_KEYS.DESC_HITOS_NUMERO]);
        EventosApp.emit('config:hint-integrado');
    }
    if (typeof data[STORAGE_KEYS.CICLO_HINT_AUTO] === 'boolean') {
        Almacenamiento.setItem(STORAGE_KEYS.CICLO_HINT_AUTO, data[STORAGE_KEYS.CICLO_HINT_AUTO]);
        EventosApp.emit('config:hint-integrado');
    }
    // Diseño de la interfaz: lo que el archivo no trae no se toca (los respaldos viejos no lo incluyen). La UI se redibuja al recibir los eventos
    let cambioTarjetas = false;
    if (Array.isArray(data[STORAGE_KEYS.ORDEN_CARDS])) {
        Almacenamiento.setItem(STORAGE_KEYS.ORDEN_CARDS, normalizarOrdenCards(data[STORAGE_KEYS.ORDEN_CARDS]), true);
        // Un respaldo sin columnas (versiones anteriores) usa el reparto por defecto; si no, los tamaños viejos no corresponderían al orden nuevo
        if (!Array.isArray(data[STORAGE_KEYS.COLUMNAS_CARDS])) Almacenamiento.removeItem(STORAGE_KEYS.COLUMNAS_CARDS, true);
        cambioTarjetas = true;
    }
    if (Array.isArray(data[STORAGE_KEYS.COLUMNAS_CARDS])) {
        Almacenamiento.setItem(STORAGE_KEYS.COLUMNAS_CARDS, data[STORAGE_KEYS.COLUMNAS_CARDS], true);
        cambioTarjetas = true;
    }
    if (Array.isArray(data[STORAGE_KEYS.ORDEN_CARDS_MOVIL])) {
        Almacenamiento.setItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL, normalizarOrdenCards(data[STORAGE_KEYS.ORDEN_CARDS_MOVIL]), true);
        cambioTarjetas = true;
    }
    const visibles = data[CLAVE_TARJETAS_VISIBLES];
    if (visibles && typeof visibles === 'object') {
        CARDS.forEach(c => {
            if (typeof visibles[c] === 'boolean') { Almacenamiento.setItem(STORAGE_KEYS.CARD_VISIBLE(c), visibles[c], true); cambioTarjetas = true; }
        });
    }
    if (cambioTarjetas) EventosApp.emit('config:tarjetas');

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
    if (typeof data[STORAGE_KEYS.IGNORAR_TF] === 'boolean' && data[STORAGE_KEYS.IGNORAR_TF] !== D.getIgnorarTiempoFuera()) {
        cambios.push('tiempo fuera');
    }
    if (typeof data[STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO] === 'boolean' &&
        data[STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO] !== Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true)) {
        cambios.push('banco de horas');
    }
    if (typeof data[STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO] === 'boolean' &&
        data[STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO] !== Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true)) {
        cambios.push('objetivo diario global');
    }
    if (['auto', 'on', 'off'].includes(data[STORAGE_KEYS.REDUCIR_ANIMACIONES]) &&
        data[STORAGE_KEYS.REDUCIR_ANIMACIONES] !== Movimiento.modo()) {
        cambios.push('animaciones');
    }
    if (typeof data[STORAGE_KEYS.HINT_INTEGRADO] === 'boolean' &&
        data[STORAGE_KEYS.HINT_INTEGRADO] !== Almacenamiento.getBoolean(STORAGE_KEYS.HINT_INTEGRADO, DEFAULTS.HINT_INTEGRADO)) {
        cambios.push('hint integrado');
    }
    if (typeof data[STORAGE_KEYS.DESC_HITOS_NUMERO] === 'boolean' &&
        data[STORAGE_KEYS.DESC_HITOS_NUMERO] !== Almacenamiento.getBoolean(STORAGE_KEYS.DESC_HITOS_NUMERO, DEFAULTS.DESC_HITOS_NUMERO)) {
        cambios.push('nombre del hito en el número');
    }
    if (typeof data[STORAGE_KEYS.CICLO_HINT_AUTO] === 'boolean' &&
        data[STORAGE_KEYS.CICLO_HINT_AUTO] !== Almacenamiento.getBoolean(STORAGE_KEYS.CICLO_HINT_AUTO, DEFAULTS.CICLO_HINT_AUTO)) {
        cambios.push('ciclo automático del hint');
    }
    if (Array.isArray(data[STORAGE_KEYS.ORDEN_CARDS]) && normalizarOrdenCards(data[STORAGE_KEYS.ORDEN_CARDS]).join() !== _ordenActual().join()) {
        cambios.push('orden de tarjetas');
    }
    if (Array.isArray(data[STORAGE_KEYS.ORDEN_CARDS_MOVIL]) && normalizarOrdenCards(data[STORAGE_KEYS.ORDEN_CARDS_MOVIL]).join() !== _ordenMovilActual().join()) {
        cambios.push('orden de tarjetas (móvil)');
    }
    if (Array.isArray(data[STORAGE_KEYS.COLUMNAS_CARDS]) && data[STORAGE_KEYS.COLUMNAS_CARDS].join() !== _columnasActuales().join()) {
        cambios.push('columnas de tarjetas');
    }
    const visibles = data[CLAVE_TARJETAS_VISIBLES];
    if (visibles && typeof visibles === 'object') {
        const actuales = _visiblesActuales();
        if (CARDS.some(c => typeof visibles[c] === 'boolean' && visibles[c] !== actuales[c])) cambios.push('tarjetas visibles');
    }
    return cambios;
}

function normalizarRegistrosImportados(rawList, calcularHorasFn) {
    const validarHora = (h) => (typeof h === 'string' && TiempoUtils.validarHora(h)) ? h : null;
    const hoy = TiempoUtils.obtenerFechaHoy();
    const descartadosFuturos = rawList.filter(r =>
        S.validarRegistroSeguro(r) && r.fecha > hoy && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)
    ).length;
    if (descartadosFuturos > 0)
        D._notify().mostrarToast(`${descartadosFuturos} registro${TiempoUtils.pluralizar(descartadosFuturos)} normal${descartadosFuturos > 1 ? 'es' : ''} con fecha futura omitido${TiempoUtils.pluralizar(descartadosFuturos)}`, 'warning');
    const normalizados = rawList
        .filter(r => S.validarRegistroSeguro(r))
        .filter(r => {
            if (r.fecha <= hoy) return true;
            return TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
        })
        .map(r => ({
            id: (r.id && S.REGEX_PATTERNS.ID.test(r.id)) ? r.id : S.generarIDSeguro(),
            fecha: r.fecha,
            entrada: validarHora(r.entrada), salida: validarHora(r.salida), tiempoFuera: validarHora(r.tiempoFuera),
            horas: Math.max(0, Math.min(24, parseFloat(r.horas) || 0)),
            minutos: Math.max(0, Math.min(59, parseFloat(r.minutos) || 0)),
            total: Math.max(0, Math.min(24, parseFloat(r.total) || 0)),
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
        D._notify().mostrarToast(`${descartadosDuplicados} registro${TiempoUtils.pluralizar(descartadosDuplicados)} con fecha repetida omitido${TiempoUtils.pluralizar(descartadosDuplicados)}`, 'warning');

    unicos.forEach(r => {
        if (TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) return;
        D._aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera || null, r.credito || null, calcularHorasFn);
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
const CLAVES_RAIZ_RESPALDO = ['registros', STORAGE_KEYS.DIAS_HABILES, STORAGE_KEYS.HORAS_DIARIAS, STORAGE_KEYS.HISTORIAL_DIAS_HABILES, ...KEYS_CONFIG_EXPORTABLE, 'fecha', 'version', 'hash', 'timestamp', 'rangoExportado'];
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
 * sus registros normalizados, o null si no se puede usar (ya se avisó al usuario). Mismo camino para archivo y Gist.
 * @param {'archivo'|'gist'} [origen]
 */
async function prepararRespaldo(data, origen = 'archivo') {
    const notify = D._notify();
    const nombre = _NOMBRE_ORIGEN[origen] || 'archivo';
    const error = errorEstructuraRespaldo(data, nombre);
    if (error) { notify.mostrarToast(error, 'error'); return null; }
    if (data.version && data.version > S.SECURITY_LIMITS.SCHEMA_VERSION) {
        notify.mostrarToast(`El ${nombre} es de una versión más nueva (v${data.version}). Algunos datos pueden no importarse correctamente.`, 'warning', 4000);
    }
    if (!(await _confirmarIntegridad(data, nombre))) return null;
    const registros = normalizarRegistrosImportados(data.registros, D.calcularHoras);
    if (registros.length === 0) { notify.mostrarToast('No se encontraron registros válidos', 'warning'); return null; }
    return registros;
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
    if (!file.type || file.type !== 'application/json') { D._notify().mostrarToast('Solo se permiten archivos JSON', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const contenido = String(e.target?.result ?? '');
            if (!contenido || contenido.trim().length === 0) { D._notify().mostrarToast('Archivo vacío', 'error'); return; }
            if (contenido.length > S.SECURITY_LIMITS.MAX_JSON_SIZE) { D._notify().mostrarToast('Contenido del archivo demasiado grande', 'error'); return; }

            const data = JSON.parse(contenido, S.reviverJSONSeguro);
            const registrosImportados = await prepararRespaldo(data, 'archivo');
            if (!registrosImportados) return;
            await restaurarRespaldo(data, registrosImportados, modo === 'merge' ? 'merge' : 'replace');
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
    Compensatorios.migrarObjetivoHorasFaltante();
    D.sincronizarPushHoy();
    GestorHistorial.saveState(D.registros(), descripcion);
    if (!(await D.guardarYActualizar())) return false;
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
