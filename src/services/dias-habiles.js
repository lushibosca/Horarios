import { DESDE_SIEMPRE } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp as D } from './estado-app.js';

// ====================================================================
// DÍAS HÁBILES (historial por tramos: qué días se trabajan desde cada fecha)
// ====================================================================
function sanitizarHistorialDiasHabiles(historial) {
    if (!Array.isArray(historial)) return null;
    const limpio = historial
        .filter(t => t && typeof t.desde === 'string' && (t.desde === DESDE_SIEMPRE || TiempoUtils.validarFecha(t.desde)) && Array.isArray(t.dias))
        .map(t => ({ desde: t.desde, dias: t.dias.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) }))
        .filter(t => t.dias.length > 0);
    limpio.sort((a, b) => a.desde.localeCompare(b.desde));

    const porFecha = new Map();
    limpio.forEach(t => porFecha.set(t.desde, t));
    const sinDuplicados = [...porFecha.values()].sort((a, b) => a.desde.localeCompare(b.desde));

    const mismosDias = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((d, i) => d === [...b].sort((x, y) => x - y)[i]);
    const fusionado = [];
    for (const tramo of sinDuplicados) {
        const anterior = fusionado[fusionado.length - 1];
        if (anterior && mismosDias(anterior.dias, tramo.dias)) continue;
        fusionado.push(tramo);
    }

    const limitado = fusionado.length > S.SECURITY_LIMITS.MAX_HISTORIAL_DIAS_HABILES
        ? fusionado.slice(-S.SECURITY_LIMITS.MAX_HISTORIAL_DIAS_HABILES)
        : fusionado;
    if (limitado.length < fusionado.length) {
        console.warn(`historialDiasHabiles: se descartaron ${fusionado.length - limitado.length} tramos antiguos (límite: ${S.SECURITY_LIMITS.MAX_HISTORIAL_DIAS_HABILES}).`);
    }

    return limitado.length > 0 ? limitado : null;
}

function diasHabilesEnFecha(iso) {
    if (!Array.isArray(D.historialDiasHabiles()) || D.historialDiasHabiles().length === 0) return D.diasHabiles();
    let vigente = null;
    for (const tramo of D.historialDiasHabiles()) {
        if (tramo.desde <= iso) vigente = tramo;
        else break;
    }
    if (!vigente) vigente = D.historialDiasHabiles()[0];
    return Array.isArray(vigente.dias) ? vigente.dias : D.diasHabiles();
}

/** ¿La fecha es laborable según el tramo de días hábiles que la rige? */
function esDiaLaboral(fecha) {
    return TiempoUtils.esFechaHabil(fecha, diasHabilesEnFecha(fecha));
}

function registrarCambioDiasHabiles(nuevosDias) {
    const hoy = TiempoUtils.obtenerFechaHoy();
    let hist = D.historialDiasHabiles();
    const sinHistorial = !Array.isArray(hist) || hist.length === 0;
    const soloTramoBase = !sinHistorial && hist.length === 1 && hist[0].desde === DESDE_SIEMPRE;
    if (sinHistorial || (soloTramoBase && D.registros().length === 0)) {
        hist = [{ desde: DESDE_SIEMPRE, dias: nuevosDias }];
    } else {
        const idx = hist.findIndex(t => t.desde === hoy);
        if (idx >= 0) hist[idx] = { desde: hoy, dias: nuevosDias };
        else hist.push({ desde: hoy, dias: nuevosDias });
        hist = sanitizarHistorialDiasHabiles(hist) || [{ desde: DESDE_SIEMPRE, dias: nuevosDias }];
    }
    D._setHistorialDiasHabilesRaw(hist);
    D.setDiasHabiles(nuevosDias);
}

// --------------------------------------------------------------------
// Edición de tramos del historial de días hábiles (modal "Historial de días hábiles")
// --------------------------------------------------------------------

/** Tramos ordenados por fecha; sin historial, uno solo "desde siempre" con los días vigentes. */
function tramosDiasHabiles() {
    const historial = D.historialDiasHabiles();
    return Array.isArray(historial) && historial.length > 0
        ? [...historial].sort((a, b) => a.desde.localeCompare(b.desde))
        : [{ desde: DESDE_SIEMPRE, dias: D.diasHabiles() }];
}

async function _aplicarHistorial(historial, diasRespaldo) {
    const limpio = sanitizarHistorialDiasHabiles(historial);
    D._setHistorialDiasHabilesRaw(limpio && limpio.length > 0 ? limpio : [{ desde: DESDE_SIEMPRE, dias: diasRespaldo }]);
    D.setDiasHabiles(diasHabilesEnFecha(TiempoUtils.obtenerFechaHoy()));
    const guardado = await D.guardarYActualizar();
    if (guardado) D.sincronizarPushHoy();   // cambian los días hábiles de hoy: el aviso puede dejar de corresponder
    return guardado;
}

/**
 * Cambia la fecha y los días de un tramo (el tramo "desde siempre" conserva su fecha). Valida y guarda.
 * @returns {Promise<{ error: string } | { ok: boolean }>}
 */
async function editarTramoDias(desdeOriginal, nuevaFechaCruda, diasCrudos) {
    const tramos = tramosDiasHabiles();
    if (!tramos.some(t => t.desde === desdeOriginal)) return { error: 'Tramo no encontrado' };
    const nuevaFecha = desdeOriginal === DESDE_SIEMPRE ? DESDE_SIEMPRE : String(nuevaFechaCruda ?? '');
    if (nuevaFecha !== DESDE_SIEMPRE && !TiempoUtils.validarFecha(nuevaFecha)) return { error: 'Ingresá una fecha válida' };
    const dias = S.sanitizarDiasHabiles(diasCrudos);
    if (!dias) return { error: 'Seleccioná al menos un día' };
    const otros = tramos.filter(t => t.desde !== desdeOriginal);
    if (otros.some(t => t.desde === nuevaFecha)) return { error: 'Ya existe un tramo con esa fecha' };
    return { ok: await _aplicarHistorial([...otros, { desde: nuevaFecha, dias }], dias) };
}

/**
 * Elimina un tramo; los registros que abarcaba pasan a regirse por el anterior. El primero no se puede eliminar.
 * @returns {Promise<{ error: string } | { ok: boolean }>}
 */
async function eliminarTramoDias(desde) {
    const tramos = tramosDiasHabiles();
    if (tramos.length <= 1 || tramos[0].desde === desde) return { error: 'El primer tramo no se puede eliminar' };
    if (!tramos.some(t => t.desde === desde)) return { error: 'Tramo no encontrado' };
    return { ok: await _aplicarHistorial(tramos.filter(t => t.desde !== desde), D.diasHabiles()) };
}

export const DiasHabiles = {
    sanitizarHistorialDiasHabiles,
    diasHabilesEnFecha,
    esDiaLaboral,
    registrarCambioDiasHabiles,
    tramosDiasHabiles,
    editarTramoDias,
    eliminarTramoDias
};
