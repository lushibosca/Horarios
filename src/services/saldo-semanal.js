import { STORAGE_KEYS, horasGte } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { TiposRegistro } from './tipos-registro.js';
import { Compensatorios } from './compensatorios.js';
import { EstadoApp } from './estado-app.js';

// ====================================================================
// SALDO SEMANAL MODULE — (pool de horas)
// ====================================================================
function logicaCubiertoActiva() {
    return !Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, false, true);
}

/** @param {any} [asignacionesPrecalculadas] */
function calcularPoolSemana(lunes, hasta, asignacionesPrecalculadas = null) {
    const lunesDate = TiempoUtils.parsearFechaLocal(lunes);
    lunesDate.setDate(lunesDate.getDate() + 6);
    const domingo = TiempoUtils.formatearFechaLocal(lunesDate);
    const limite = domingo < hasta ? domingo : hasta;

    const registrosSemana = EstadoApp.registros().filter(r => r.fecha >= lunes && r.fecha <= limite);
    const registrosMap = new Map(registrosSemana.map(r => [r.fecha, r]));

    const EPS = 1e-6;
    const pendientes = [];
    const excedentes = [];
    let pool = 0, poolGenerado = 0, poolUsado = 0;

    const atribuirPago = (monto) => {
        for (const ex of excedentes) {
            if (monto <= EPS) break;
            const disponible = ex.generado - ex.usado;
            if (disponible <= EPS) continue;
            const parte = Math.min(disponible, monto);
            ex.usado += parte;
            monto -= parte;
        }
    };

    for (const isoDate of TiempoUtils.generarRangoFechas(lunes, limite)) {
        const r = registrosMap.get(isoDate);
        const esEspecial = r && TiposRegistro.esRegistroEspecial(r.entrada, r.salida);
        const esRemoto = esEspecial && Compensatorios.esTipoRemoto(r);
        let deltaBruto = 0;
        let montoCompensado = 0;
        if (esRemoto) {
            deltaBruto = 0;
        } else if (r && !esEspecial && r.salida) {
            const objetivo = TiempoUtils.esFechaHabil(isoDate, Compensatorios.diasHabilesEnFecha(isoDate)) ? Compensatorios.objetivoDeRegistro(r) : 0;
            deltaBruto = r.total - objetivo;
            if (deltaBruto > EPS) montoCompensado = Compensatorios.montoCompensadoDeReferencia(r, asignacionesPrecalculadas);
        }
        const deltaDisponible = deltaBruto - montoCompensado;

        if (deltaBruto > EPS) {
            poolGenerado += deltaBruto;
            excedentes.push({ fecha: isoDate, generado: deltaBruto, usado: Math.min(Math.max(montoCompensado, 0), deltaBruto) });
        }
        if (montoCompensado > EPS) poolUsado += montoCompensado;

        if (deltaDisponible > EPS) pool += deltaDisponible;
        else if (deltaDisponible < -EPS) pendientes.push({ fecha: isoDate, restante: -deltaDisponible });

        for (const deuda of pendientes) {
            if (pool <= EPS) break;
            if (deuda.restante <= EPS) continue;
            const pago = Math.min(pool, deuda.restante);
            deuda.restante -= pago;
            pool -= pago;
            poolUsado += pago;
            atribuirPago(pago);
        }
    }

    return { pendientes, excedentes, poolGenerado, poolUsado };
}

/** @param {any} [asignacionesPrecalculadas] */
function cubiertoPorSaldo(fecha, asignacionesPrecalculadas = null) {
    if (!logicaCubiertoActiva()) return false;
    const lunes = TiempoUtils.obtenerLunesSemanaISO(fecha);
    const hoy = TiempoUtils.obtenerFechaHoy();
    const { pendientes } = calcularPoolSemana(lunes, hoy, asignacionesPrecalculadas);
    const EPS = 1e-6;
    const deuda = pendientes.find(d => d.fecha === fecha);
    return deuda ? deuda.restante <= EPS : false;
}

/** @param {any} [asignacionesPrecalculadas] */
function calcularAprovechamiento(desde, hasta, asignacionesPrecalculadas = null) {
    if (!logicaCubiertoActiva()) return null;
    const hoy = TiempoUtils.obtenerFechaHoy();
    const topeReal = hasta < hoy ? hasta : hoy;
    if (desde > topeReal) return null;

    const asignaciones = asignacionesPrecalculadas || Compensatorios.calcularAsignacionesCompensatorio();
    let lunes = TiempoUtils.obtenerLunesSemanaISO(desde);
    let generado = 0, usado = 0;

    while (lunes <= topeReal) {
        const { excedentes } = calcularPoolSemana(lunes, hoy, asignaciones);
        for (const ex of excedentes) {
            if (ex.fecha < desde || ex.fecha > topeReal) continue;
            generado += ex.generado;
            usado += ex.usado;
        }
        const siguienteLunes = TiempoUtils.parsearFechaLocal(lunes);
        siguienteLunes.setDate(siguienteLunes.getDate() + 7);
        lunes = TiempoUtils.formatearFechaLocal(siguienteLunes);
    }

    if (generado <= 1e-6) return null;
    return {
        porcentaje: Math.round((usado / generado) * 1000) / 10,
        horas: usado,
        generado
    };
}

/** @param {any} [asignaciones] */
function estadoDeRegistro(r, asignaciones = null) {
    const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
    if (tipo) {
        return {
            estado: 'especial', tipo, diffText: '', fechaCompensado: null,
            fechaCompensada: tipo.id === 'compensatorio' ? Compensatorios.fechaCompensadaPorRegistro(r, asignaciones) : null
        };
    }
    const base = { tipo: null, diffText: '', fechaCompensada: null, fechaCompensado: Compensatorios.fechaCompensadoDeRegistro(r, asignaciones) };
    if (r.entrada && !r.salida) return { ...base, estado: 'en-curso' };
    if (!r.entrada) return { ...base, estado: 'sin-datos' };
    const objetivo = Compensatorios.objetivoDeRegistro(r);
    const total = r.total || 0;
    if (!(objetivo > 0 && TiempoUtils.esFechaHabil(r.fecha, Compensatorios.diasHabilesEnFecha(r.fecha)))) {
        return { ...base, estado: 'neutro' };
    }
    const estado = horasGte(total, objetivo) ? 'cumplido' : (cubiertoPorSaldo(r.fecha, asignaciones) ? 'cubierto' : 'incompleto');
    return { ...base, estado, diffText: TiempoUtils.formatoDiferencia(total, objetivo) };
}

function colorDeEstado(est) {
    if (est.estado === 'especial') return est.tipo.color;
    return { 'en-curso': 'blue', cumplido: 'green', cubierto: 'gold', incompleto: 'red' }[est.estado] || 'neutro';
}

export const SaldoSemanal = { logicaCubiertoActiva, cubiertoPorSaldo, calcularAprovechamiento, estadoDeRegistro, colorDeEstado };
