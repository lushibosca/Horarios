import { TiempoUtils } from '../core/tiempo-utils.js';
import { EstadoApp as D } from './estado-app.js';
import { TiposRegistro } from './tipos-registro.js';
import { DiasHabiles } from './dias-habiles.js';
import { Objetivos } from './objetivos.js';

// ====================================================================
// DÍAS COMPENSATORIOS (a qué excedente de horas corresponde cada uno)
// ====================================================================
function _excedenteDeRegistro(r) {
    if (!r || !r.entrada || !r.salida || TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) return 0;
    const objetivo = DiasHabiles.esDiaLaboral(r.fecha) ? Objetivos.objetivoDeRegistro(r) : 0;
    const excedente = r.total - objetivo;
    return excedente > 0 ? excedente : 0;
}

const LIMITE_DIAS_COMPENSATORIO = 14;

function calcularAsignacionesCompensatorio(listaRegistros = D.registros()) {
    const ordenados = [...listaRegistros].sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);

    const excedentePorFecha = new Map();
    for (const r of ordenados) {
        const tipo = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
        if (!tipo) {
            const excedente = _excedenteDeRegistro(r);
            if (excedente > 0) excedentePorFecha.set(r.fecha, { id: r.id, fecha: r.fecha, excedente });
        }
    }

    const compensatorios = ordenados.filter(r => TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida)?.id === 'compensatorio');
    const asignaciones = new Map();
    const usados = new Set();

    for (const r of compensatorios) {
        if (!r.referenciaCompensatorio) continue;
        const candidata = excedentePorFecha.get(r.referenciaCompensatorio);
        const valido = !!candidata && r.referenciaCompensatorio <= r.fecha && !usados.has(r.referenciaCompensatorio);
        asignaciones.set(r.id, {
            compensatorioId: r.id, compensatorioFecha: r.fecha,
            referenciaId: valido ? candidata.id : null,
            referenciaFecha: valido ? candidata.fecha : null,
            excedente: valido ? candidata.excedente : 0
        });
        if (valido) usados.add(r.referenciaCompensatorio);
    }

    for (const r of compensatorios) {
        if (asignaciones.has(r.id)) continue;
        const limite = TiempoUtils.sumarDias(r.fecha, -LIMITE_DIAS_COMPENSATORIO);
        let mejor = null;
        for (const [fecha, candidata] of excedentePorFecha) {
            if (usados.has(fecha) || fecha < limite || fecha > r.fecha) continue;
            if (!mejor || candidata.excedente > mejor.excedente) mejor = candidata;
        }
        asignaciones.set(r.id, {
            compensatorioId: r.id, compensatorioFecha: r.fecha,
            referenciaId: mejor ? mejor.id : null,
            referenciaFecha: mejor ? mejor.fecha : null,
            excedente: mejor ? mejor.excedente : 0
        });
        if (mejor) usados.add(mejor.fecha);
    }

    return [...asignaciones.values()];
}

/** @param {any} [asignacionesPrecalculadas] */
function _buscarAsignacionCompensatorio(idBuscado, campoId, asignacionesPrecalculadas = null) {
    const asignaciones = asignacionesPrecalculadas || calcularAsignacionesCompensatorio();
    return asignaciones.find(a => a[campoId] === idBuscado) || null;
}

/** @param {any} [asignacionesPrecalculadas] */
function fechaCompensadaPorRegistro(registroCompensatorio, asignacionesPrecalculadas = null) {
    const a = _buscarAsignacionCompensatorio(registroCompensatorio.id, 'compensatorioId', asignacionesPrecalculadas);
    return a ? a.referenciaFecha : null;
}

/** @param {any} [asignacionesPrecalculadas] */
function fechaCompensadoDeRegistro(registroReferencia, asignacionesPrecalculadas = null) {
    const a = _buscarAsignacionCompensatorio(registroReferencia.id, 'referenciaId', asignacionesPrecalculadas);
    return a ? a.compensatorioFecha : null;
}

/** @param {any} [asignacionesPrecalculadas] */
function montoCompensadoDeReferencia(registroReferencia, asignacionesPrecalculadas = null) {
    const a = _buscarAsignacionCompensatorio(registroReferencia.id, 'referenciaId', asignacionesPrecalculadas);
    return a ? a.excedente : 0;
}

export const Compensatorios = {
    calcularAsignacionesCompensatorio,
    _buscarAsignacionCompensatorio,
    fechaCompensadaPorRegistro,
    fechaCompensadoDeRegistro,
    montoCompensadoDeReferencia
};
