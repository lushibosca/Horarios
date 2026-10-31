import { TiempoUtils } from '../core/tiempo-utils.js';
import { EstadoApp } from './estado-app.js';
import { Compensatorios } from './compensatorios.js';
import { FiltrosYPeriodos } from './filtros-periodos.js';
import { TiposRegistro } from './tipos-registro.js';
import { SaldoSemanal } from './saldo-semanal.js';

// ====================================================================
// ESTADÍSTICAS POR PERÍODO MODULE (semana, mes y año, sin DOM)
// ====================================================================
function calcularRegularidad(desviacionMinutos) {
    if (desviacionMinutos === null) return '--:--';
    const mins = Math.round(desviacionMinutos);
    return mins <= 20 ? 'Alta' : mins <= 40 ? 'Media' : 'Baja';
}

function desviacionEstandar(valores) {
    if (valores.length < 2) return null;
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const varianza = valores.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / valores.length;
    return Math.sqrt(varianza);
}

function sumarHorasEfectivas(regs) {
    return regs.reduce((sum, r) => sum + Compensatorios.horasEfectivasDeRegistro(r), 0);
}

function _fechaDesdeEfectiva(registros, fechaDesdeDefault) {
    if (registros.length === 0) return fechaDesdeDefault;
    const primerRegistro = registros.reduce((min, r) => r.fecha < min ? r.fecha : min, registros[0].fecha);
    return primerRegistro > fechaDesdeDefault ? primerRegistro : fechaDesdeDefault;
}

function _calcularRegularidadRango(registrosValidos, regularidadPorMes) {
    if (regularidadPorMes) {
        const meses = [...new Set(registrosValidos.map(r => r.fecha.substring(0, 7)))];
        const desE = [], desJ = [];
        meses.forEach(mes => {
            const regs = registrosValidos.filter(r => r.fecha.startsWith(mes));
            if (regs.length < 2) return;
            const dE = desviacionEstandar(regs.map(r => TiempoUtils.horaAMinutos(r.entrada)));
            const dJ = desviacionEstandar(regs.map(r => Math.round(r.total * 60)));
            if (dE !== null) desE.push(dE);
            if (dJ !== null) desJ.push(dJ);
        });
        const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        return {
            regEntrada: calcularRegularidad(avg(desE)),
            regJornada: calcularRegularidad(avg(desJ))
        };
    }
    return {
        regEntrada: calcularRegularidad(desviacionEstandar(registrosValidos.map(r => TiempoUtils.horaAMinutos(r.entrada)))),
        regJornada: calcularRegularidad(desviacionEstandar(registrosValidos.map(r => Math.round(r.total * 60))))
    };
}

/** @param {{ regularidadPorMes?: boolean, desde?: string, hasta?: string }} [opciones] */
function calcularEstadisticasRango(registrosRango, opciones = {}) {
    const { regularidadPorMes = false } = opciones;

    const conteosPorTipo = {};
    const claveTipoPorCodigo = new Map(TiposRegistro.obtenerTodosLosTipos().map(t => [t.codigo, TiposRegistro.claveStat(t)]));
    claveTipoPorCodigo.forEach(clave => { conteosPorTipo[clave] = 0; });
    registrosRango.forEach(r => {
        if (r.entrada && r.entrada === r.salida) {
            const clave = claveTipoPorCodigo.get(r.entrada);
            if (clave) conteosPorTipo[clave]++;
        }
    });

    const compensaciones = registrosRango.filter(r => r.credito && r.credito !== '00:00').length;

    let tiempoFueraTotalMinutos = 0;
    registrosRango.forEach(r => {
        if (r.tiempoFuera && r.tiempoFuera !== '00:00') {
            tiempoFueraTotalMinutos += TiempoUtils.horaAMinutos(r.tiempoFuera);
        }
    });

    const registrosValidos = registrosRango.filter(r =>
        r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)
    );

    const vacios = {
        entradaPromedio: '--:--', salidaPromedio: '--:--',
        diasTrabajados: 0, promedioDiario: '--:--',
        tiempoFueraTotal: '--:--', tiempoTotal: '--:--',
        ...conteosPorTipo, compensaciones,
        regularidadEntrada: '--:--', regularidadJornada: '--:--',
        bufferPeriodo: null, aprovechamientoSaldo: null
    };
    const totalHoras = sumarHorasEfectivas(registrosRango);
    const horasDiariasObj = EstadoApp.horasDiarias();
    const hayPeriodo = horasDiariasObj > 0 && opciones.desde && opciones.hasta;
    const asignacionesCompensatorio = hayPeriodo ? Compensatorios.calcularAsignacionesCompensatorio() : null;
    const bufferPeriodo = hayPeriodo
        ? FiltrosYPeriodos.calcularBufferPeriodo(opciones.desde, opciones.hasta, true, 0, asignacionesCompensatorio)
        : null;
    const aprovechamientoSaldo = hayPeriodo
        ? SaldoSemanal.calcularAprovechamiento(opciones.desde, opciones.hasta, asignacionesCompensatorio)
        : null;

    if (registrosValidos.length === 0) {
        if (registrosRango.length === 0) return vacios;
        return {
            ...vacios,
            tiempoFueraTotal: tiempoFueraTotalMinutos > 0 ? TiempoUtils.horasATexto(tiempoFueraTotalMinutos / 60, 'short') : '--:--',
            tiempoTotal: totalHoras > 0 ? TiempoUtils.horasATexto(totalHoras, 'short') : '--:--',
            bufferPeriodo, aprovechamientoSaldo
        };
    }

    const avgMin = arr => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    const promedioEntrada = avgMin(registrosValidos.map(r => TiempoUtils.horaAMinutos(r.entrada)));
    const promedioSalida = avgMin(registrosValidos.map(r => TiempoUtils.horaAMinutos(r.salida)));

    const totalHorasTrabajadas = registrosValidos.reduce((s, r) => s + r.total, 0);
    const promDiario = totalHorasTrabajadas / registrosValidos.length;

    const { regEntrada, regJornada } = _calcularRegularidadRango(registrosValidos, regularidadPorMes);

    return {
        entradaPromedio: TiempoUtils.minutosAHora(promedioEntrada),
        salidaPromedio: TiempoUtils.minutosAHora(promedioSalida),
        diasTrabajados: registrosValidos.length,
        promedioDiario: TiempoUtils.horasATexto(promDiario, 'short'),
        tiempoFueraTotal: TiempoUtils.horasATexto(tiempoFueraTotalMinutos / 60, 'short'),
        tiempoTotal: TiempoUtils.horasATexto(totalHoras, 'short'),
        ...conteosPorTipo, compensaciones,
        regularidadEntrada: regEntrada,
        regularidadJornada: regJornada,
        bufferPeriodo, aprovechamientoSaldo
    };
}

/** @param {any} [mesAnio] @param {any} [registrosPeriodo] */
function calcularEstadisticasMes(mesAnio = null, registrosPeriodo = null) {
    let mesActual, añoActual;
    if (mesAnio) {
        const [año, mes] = mesAnio.split('-').map(Number);
        añoActual = año; mesActual = mes - 1;
    } else {
        const hoy = new Date();
        mesActual = hoy.getMonth(); añoActual = hoy.getFullYear();
    }
    const registros = registrosPeriodo ?? EstadoApp.registros().filter(r => {
        const [a, m] = r.fecha.split('-').map(Number);
        return a === añoActual && m === mesActual + 1;
    });
    const ultimoDia = TiempoUtils.formatearFechaLocal(new Date(añoActual, mesActual + 1, 0));
    const fechaDesde = _fechaDesdeEfectiva(registros, TiempoUtils.formatearFechaLocal(new Date(añoActual, mesActual, 1)));
    return calcularEstadisticasRango(registros, { regularidadPorMes: false, desde: fechaDesde, hasta: ultimoDia });
}

/** @param {any} [registrosPeriodo] */
function calcularEstadisticasAnio(anio, registrosPeriodo = null) {
    const anioNum = parseInt(anio);
    const registros = registrosPeriodo ?? EstadoApp.registros().filter(r => parseInt(r.fecha.substring(0, 4)) === anioNum);
    const fechaDesde = _fechaDesdeEfectiva(registros, `${anioNum}-01-01`);

    return calcularEstadisticasRango(registros, {
        regularidadPorMes: true,
        desde: fechaDesde,
        hasta: `${anioNum}-12-31`
    });
}

function calcularEstadisticasSemana(lunesISO) {
    if (!lunesISO) return calcularEstadisticasRango([], { regularidadPorMes: false });
    const lunes = new Date(lunesISO + 'T00:00:00');
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    const hasta = TiempoUtils.formatearFechaLocal(domingo);
    const registros = EstadoApp.registros().filter(r => r.fecha >= lunesISO && r.fecha <= hasta);
    return calcularEstadisticasRango(registros, { regularidadPorMes: false, desde: lunesISO, hasta });
}

export const EstadisticasPeriodo = {
    calcularRegularidad, desviacionEstandar, sumarHorasEfectivas, calcularEstadisticasRango,
    calcularEstadisticasMes, calcularEstadisticasAnio, calcularEstadisticasSemana
};
