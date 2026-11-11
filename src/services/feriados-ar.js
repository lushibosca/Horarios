import { STORAGE_KEYS } from '../core/constantes.js';
import { FERIADOS_AR } from '../data/feriados.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp } from './estado-app.js';
import { TiposRegistro } from './tipos-registro.js';
import { OperacionesLote } from './operaciones-lote.js';

// ====================================================================
// HOLIDAYS MODULE
// ====================================================================
const SK_PROCESADOS = STORAGE_KEYS.FERIADOS_PROCESADOS;
const FERIADOS = FERIADOS_AR || {};

function _cargarProcesados() {
    const guardados = Almacenamiento.getObject(SK_PROCESADOS, null, true);
    if (!Array.isArray(guardados)) return new Set();
    return new Set(guardados.filter(f => typeof f === 'string' && TiempoUtils.validarFecha(f)));
}

function _marcarProcesado(fecha) {
    const set = _cargarProcesados();
    set.add(fecha);
    const limiteStr = TiempoUtils.sumarDias(TiempoUtils.obtenerFechaHoy(), -60);
    set.forEach(f => { if (f < limiteStr) set.delete(f); });
    Almacenamiento.setItem(SK_PROCESADOS, JSON.stringify([...set]), true);
}

function _getFeriadosDelMes() {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const mesActual = TiempoUtils._pad2(hoy.getMonth() + 1);
    const prefijoMes = `${anioActual}-${mesActual}`;
    const pool = FERIADOS[anioActual] || [];
    return { prefijoMes, feriados: pool.filter(f => f.fecha.startsWith(prefijoMes)) };
}

async function chequearYNotificar() {
    const { prefijoMes, feriados: candidatos } = _getFeriadosDelMes();
    if (!candidatos.length) return;

    const procesados = _cargarProcesados();
    const yaExisteRegistro = fecha => EstadoApp.existeRegistroEnFecha(fecha);

    const pendientes = candidatos.filter(f => {
        if (procesados.has(f.fecha)) return false;
        if (yaExisteRegistro(f.fecha)) { _marcarProcesado(f.fecha); return false; }
        return true;
    });

    if (!pendientes.length) return;

    while (EstadoApp._notify().hayUIBloqueante()) {
        await TiempoUtils.esperar(2000);
    }

    const nombreMes = TiempoUtils.formatoTituloMes(prefijoMes).split(' ')[0];
    const lineas = pendientes.map(f => `🎉 ${TiempoUtils.obtenerNombreDia(f.fecha)} ${parseInt(f.fecha.slice(8), 10)} — ${f.nombre}`);
    const pregunta = pendientes.length > 1 ? `¿Querés agregar estos ${pendientes.length} días como Feriado?` : '¿Querés agregar este día como Feriado?';
    const texto = `${lineas.join('\n')}\n\n${pregunta}`;

    const confirmo = await EstadoApp._notify().confirmarModal(texto, 'Sí', '#icon-check', {
        titulo: pendientes.length > 1 ? `Feriados de ${nombreMes}` : `Feriado de ${nombreMes}`,
        labelCancel: 'No'
    });

    pendientes.forEach(f => _marcarProcesado(f.fecha));

    if (confirmo) {
        for (const feriado of pendientes) {
            // El nombre del feriado va como descripción del registro, hasta la última palabra que entre en el largo máximo de las notas
            await OperacionesLote.registrarDiaEspecial(feriado.fecha, 'feriado', S.notasHastaPalabra(feriado.nombre));
        }
    }
}

// ====================================================================
// VERIFICACIÓN MANUAL (Ajustes → Jornada laboral)
// ====================================================================
/**
 * @typedef {Object} ItemFeriado
 * @property {string} fecha
 * @property {string} nombre
 * @property {string | null} nota descripción que llevaría el registro
 * @property {'agregar' | 'actualizar' | 'conflicto'} estado
 * @property {string | null} actual agregar: null; actualizar: la descripción actual; conflicto: qué hay registrado ese día
 */

function _describirRegistro(r) {
    const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
    if (tipo) return `${tipo.emoji} ${tipo.label}`;
    return r.salida ? `Jornada de ${r.horas}h ${r.minutos}m` : 'Jornada sin cerrar';
}

/** @returns {ItemFeriado | null} null si el día ya está al día */
function _clasificar(f) {
    const nota = S.notasHastaPalabra(f.nombre);
    const reg = EstadoApp.registroPorFecha(f.fecha);
    if (!reg) return { fecha: f.fecha, nombre: f.nombre, nota, estado: 'agregar', actual: null };
    if (TiposRegistro.obtenerTipoPorCodigo(reg.entrada, reg.salida)?.id === 'feriado') {
        if ((reg.notas || null) === nota) return null;
        return { fecha: f.fecha, nombre: f.nombre, nota, estado: 'actualizar', actual: reg.notas || null };
    }
    return { fecha: f.fecha, nombre: f.nombre, nota, estado: 'conflicto', actual: _describirRegistro(reg) };
}

/**
 * Compara el catálogo con los registros, sin modificar nada. `anteriores`: feriados hasta hoy (de cualquier año del catálogo);
 * `proximos`: los que faltan de este año. Devuelve solo lo que hay que agregar, actualizar o resolver.
 * @param {{ anteriores?: boolean, proximos?: boolean }} [alcance]
 * @returns {ItemFeriado[]}
 */
function analizar({ anteriores = true, proximos = true } = {}) {
    const hoy = TiempoUtils.obtenerFechaHoy();
    const anioActual = parseInt(hoy.slice(0, 4), 10);
    /** @type {ItemFeriado[]} */
    const items = [];
    for (const [anio, lista] of Object.entries(FERIADOS)) {
        if (parseInt(anio, 10) > anioActual) continue;
        for (const f of lista) {
            const esPasado = f.fecha <= hoy;
            if (esPasado ? !anteriores : !proximos) continue;
            const item = _clasificar(f);
            if (item) items.push(item);
        }
    }
    return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Aplica lo elegido: vuelve a analizar (los registros pueden haber cambiado) y solo toca lo que sigue pendiente.
 * Un conflicto se resuelve únicamente si viene con `reemplazar`.
 * @param {{ fecha: string, reemplazar?: boolean }[]} selecciones
 */
async function aplicar(selecciones) {
    const elegidas = new Map(selecciones.map(s => [s.fecha, s]));
    const pendientes = analizar();
    const acciones = pendientes.filter(i => {
        const sel = elegidas.get(i.fecha);
        return sel && (i.estado !== 'conflicto' || sel.reemplazar);
    }).map(i => ({ fecha: i.fecha, nota: i.nota, reemplazar: i.estado === 'conflicto' }));
    // Los del mes en curso que se vieron y no se eligieron no vuelven a preguntarse al abrir la app
    const prefijoMes = TiempoUtils.obtenerFechaHoy().slice(0, 7);
    pendientes.filter(i => i.fecha.startsWith(prefijoMes)).forEach(i => _marcarProcesado(i.fecha));
    return OperacionesLote.aplicarFeriados(acciones);
}

export const FeriadosAR = { chequearYNotificar, analizar, aplicar };
