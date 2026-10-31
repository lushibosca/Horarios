import { STORAGE_KEYS } from '../core/constantes.js';
import { FERIADOS_AR } from '../data/feriados.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { SeguridadYUtils } from '../core/seguridad.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { EstadoApp } from './estado-app.js';
import { FiltrosYPeriodos } from './filtros-periodos.js';

// ====================================================================
// HOLIDAYS MODULE
// ====================================================================
const SK_PROCESADOS = STORAGE_KEYS.FERIADOS_PROCESADOS;
const FERIADOS = FERIADOS_AR || {};

function _cargarProcesados() {
    const raw = Almacenamiento.getItem(SK_PROCESADOS, null, true);
    try {
        if (!raw) return new Set();
        const parsed = JSON.parse(raw, SeguridadYUtils.reviverJSONSeguro);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter(f => typeof f === 'string' && TiempoUtils.validarFecha(f)));
    } catch { return new Set(); }
}

function _marcarProcesado(fecha) {
    const set = _cargarProcesados();
    set.add(fecha);
    const limite = new Date();
    limite.setDate(limite.getDate() - 60);
    const limiteStr = TiempoUtils.formatearFechaLocal(limite);
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
            try { await FiltrosYPeriodos.registrarDiaEspecial(feriado.fecha, 'feriado'); } catch (e) { console.error('Error registrando feriado:', e); }
        }
    }
}

export const FeriadosAR = { chequearYNotificar };
