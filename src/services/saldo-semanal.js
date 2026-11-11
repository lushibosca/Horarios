import { Preferencias } from '../core/preferencias.js';
import { horasGte, EPS_HORAS as EPS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { TiposRegistro } from './tipos-registro.js';
import { Compensatorios } from './compensatorios.js';
import { EstadoApp } from './estado-app.js';
import { Jornada } from './jornada.js';
import { DiasHabiles } from './dias-habiles.js';
import { Objetivos } from './objetivos.js';

// ====================================================================
// SALDO SEMANAL MODULE — (pool de horas)
// ====================================================================
function logicaCubiertoActiva() {
    return !Preferencias.IGNORAR_LOGICA_CUBIERTO.get();
}

/** @param {any} [asignacionesPrecalculadas] */
function calcularPoolSemana(lunes, hasta, asignacionesPrecalculadas = null) {
    const domingo = TiempoUtils.sumarDias(lunes, 6);
    const limite = domingo < hasta ? domingo : hasta;

    const registrosSemana = EstadoApp.registros().filter(r => r.fecha >= lunes && r.fecha <= limite);
    const registrosMap = new Map(registrosSemana.map(r => [r.fecha, r]));

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
        const esRemoto = esEspecial && TiposRegistro.esTipoRemoto(r);
        let deltaBruto = 0;
        let montoCompensado = 0;
        if (esRemoto) {
            deltaBruto = 0;
        } else if (r && !esEspecial && r.salida) {
            const objetivo = DiasHabiles.esDiaLaboral(isoDate) ? Objetivos.objetivoDeRegistro(r) : 0;
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
        lunes = TiempoUtils.sumarDias(lunes, 7);
    }

    if (generado <= EPS) return null;
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
    const objetivo = Objetivos.objetivoDeRegistro(r);
    const total = r.total || 0;
    if (!(objetivo > 0 && DiasHabiles.esDiaLaboral(r.fecha))) {
        return { ...base, estado: 'neutro' };
    }
    const estado = horasGte(total, objetivo) ? 'cumplido' : (cubiertoPorSaldo(r.fecha, asignaciones) ? 'cubierto' : 'incompleto');
    return { ...base, estado, diffText: TiempoUtils.formatoDiferencia(total, objetivo) };
}

function colorDeEstado(est) {
    if (est.estado === 'especial') return est.tipo.color;
    return { 'en-curso': 'blue', cumplido: 'green', cubierto: 'gold', incompleto: 'red' }[est.estado] || 'neutro';
}

/**
 * Horas objetivo y horas hechas que un día aporta al saldo.
 * Un día sin terminar (hoy sin salida, o la jornada de ayer que sigue abierta) no cuenta, salvo la jornada en curso cuando ya superó su objetivo.
 * Un día especial tampoco, salvo el remoto, que cuenta como cumplido.
 * @param {string} iso
 * @param {any} r registro del día, si tiene
 * @param {{ hoy: string, ayerStr: string, ayerAbierto: boolean, regActivo: any, incluirActivoEnVivo: boolean, minutosBreakActivo: number, asignaciones: any }} ctx
 */
function _aporteDelDia(iso, r, ctx) {
    const nada = { objetivo: 0, hechas: 0 };
    const esDiaHabil = DiasHabiles.esDiaLaboral(iso);
    const objetivoDia = r ? Objetivos.objetivoDeRegistro(r) : EstadoApp.horasDiarias();
    const terminado = iso === ctx.hoy ? !!r?.salida : !(ctx.ayerAbierto && iso === ctx.ayerStr);

    if (!terminado) {
        if (!ctx.incluirActivoEnVivo || !esDiaHabil || !r || r !== ctx.regActivo) return nada;
        const transcurrido = EstadoApp.horasTranscurridas(r, ctx.minutosBreakActivo);
        return transcurrido > objetivoDia ? { objetivo: objetivoDia, hechas: transcurrido } : nada;
    }
    if (r && TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
        return esDiaHabil && TiposRegistro.esTipoRemoto(r) ? { objetivo: objetivoDia, hechas: objetivoDia } : nada;
    }
    return {
        objetivo: esDiaHabil ? objetivoDia : 0,
        hechas: r?.salida ? r.total - Compensatorios.montoCompensadoDeReferencia(r, ctx.asignaciones) : 0,
    };
}

/** @param {any} [asignacionesPrecalculadas] */
function calcularBufferPeriodo(desde, hasta, incluirActivoEnVivo = true, minutosBreakActivo = 0, asignacionesPrecalculadas = null) {
    const hoy = TiempoUtils.obtenerFechaHoy();
    const regsPorFecha = new Map(EstadoApp.registros().filter(r => r.fecha >= desde && r.fecha <= hasta).map(r => [r.fecha, r]));
    const { ayerStr, regAyer, ayerAbierto } = Jornada.detectarAyerAbierto(hoy, regsPorFecha);
    const ctx = {
        hoy, ayerStr, ayerAbierto, incluirActivoEnVivo, minutosBreakActivo,
        regActivo: Jornada.jornadaActiva(regsPorFecha.get(hoy) ?? null, regAyer, ayerAbierto),
        asignaciones: asignacionesPrecalculadas || Compensatorios.calcularAsignacionesCompensatorio(),
    };

    let objetivo = 0, hechas = 0;
    for (const iso of TiempoUtils.generarRangoFechas(desde, hasta)) {
        if (iso > hoy) break;
        const aporte = _aporteDelDia(iso, regsPorFecha.get(iso), ctx);
        objetivo += aporte.objetivo;
        hechas += aporte.hechas;
    }
    return Math.round((hechas - objetivo) * 1e6) / 1e6;
}

export const SaldoSemanal = { calcularBufferPeriodo, logicaCubiertoActiva, cubiertoPorSaldo, calcularAprovechamiento, estadoDeRegistro, colorDeEstado };
