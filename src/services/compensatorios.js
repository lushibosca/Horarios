import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp as D } from './estado-app.js';

// ====================================================================
//      COMPENSATORY DAYS & WORKDAY HISTORY CALCULATIONS MODULE
// ====================================================================
function _esObjetivoValido(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 24;
}

function sanitizarHistorialDiasHabiles(historial) {
    if (!Array.isArray(historial)) return null;
    const limpio = historial
        .filter(t => t && typeof t.desde === 'string' && (t.desde === '0001-01-01' || TiempoUtils.validarFecha(t.desde)) && Array.isArray(t.dias))
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

function registrarCambioDiasHabiles(nuevosDias) {
    const hoy = TiempoUtils.obtenerFechaHoy();
    let hist = D.historialDiasHabiles();
    const sinHistorial = !Array.isArray(hist) || hist.length === 0;
    const soloTramoBase = !sinHistorial && hist.length === 1 && hist[0].desde === '0001-01-01';
    if (sinHistorial || (soloTramoBase && D.registros().length === 0)) {
        hist = [{ desde: '0001-01-01', dias: nuevosDias }];
    } else {
        const idx = hist.findIndex(t => t.desde === hoy);
        if (idx >= 0) hist[idx] = { desde: hoy, dias: nuevosDias };
        else hist.push({ desde: hoy, dias: nuevosDias });
        hist = sanitizarHistorialDiasHabiles(hist) || [{ desde: '0001-01-01', dias: nuevosDias }];
    }
    D._setHistorialDiasHabilesRaw(hist);
    D.setDiasHabiles(nuevosDias);
}

function objetivoDeRegistro(registro) {
    if (Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true)) return D.horasDiarias();
    const v = registro?.objetivoHoras;
    return _esObjetivoValido(v) ? v : D.horasDiarias();
}

function esTipoRemoto(registro) {
    return TiposRegistro.obtenerTipoPorCodigo(registro?.entrada, registro?.salida)?.id === 'remoto';
}

function _excedenteDeRegistro(r) {
    if (!r || !r.entrada || !r.salida || TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) return 0;
    const objetivo = TiempoUtils.esFechaHabil(r.fecha, diasHabilesEnFecha(r.fecha)) ? objetivoDeRegistro(r) : 0;
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

    const fechaLimiteDesde = (fechaRef) => {
        const d = TiempoUtils.parsearFechaLocal(fechaRef);
        d.setDate(d.getDate() - LIMITE_DIAS_COMPENSATORIO);
        return TiempoUtils.formatearFechaLocal(d);
    };
    for (const r of compensatorios) {
        if (asignaciones.has(r.id)) continue;
        const limite = fechaLimiteDesde(r.fecha);
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
function _montoCompensadoPorRegistro(registroCompensatorio, asignacionesPrecalculadas = null) {
    const a = _buscarAsignacionCompensatorio(registroCompensatorio.id, 'compensatorioId', asignacionesPrecalculadas);
    return a ? a.excedente : 0;
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

function horasEfectivasDeRegistro(registro) {
    const tipo = TiposRegistro.obtenerTipoPorCodigo(registro.entrada, registro.salida);
    if (tipo && tipo.id === 'remoto') return objetivoDeRegistro(registro);
    if (tipo && tipo.id === 'compensatorio') return 0;
    if (!tipo) return registro.total;
    return 0;
}

function objetivoEdicionEnVivo() {
    if (Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO, false, true)) return D.horasDiarias();
    const v = D._notify().leerObjetivoEdicion();
    return _esObjetivoValido(v) ? v : D.horasDiarias();
}

function migrarObjetivoHorasFaltante() {
    let migrados = 0;
    D.registros().forEach(r => {
        if (typeof r.objetivoHoras !== 'number' || !Number.isFinite(r.objetivoHoras)) {
            r.objetivoHoras = D.horasDiarias();
            migrados++;
        }
    });
    return migrados;
}

function _recalcularCreditoRegistro(r, nuevoObjetivo) {
    const crudo = D.calcularHoras(r.entrada, r.salida, r.tiempoFuera || null, null);
    if (!crudo) return false;
    const diferencia = nuevoObjetivo - crudo.total;
    let nuevoCredito = null;
    if (diferencia > 0.01) {
        const { horas: h, minutos: m } = TiempoUtils.descomponerHorasDecimales(diferencia);
        nuevoCredito = TiempoUtils.minutosAHora(h * 60 + m);
    }
    r.credito = nuevoCredito;
    D._aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera, r.credito);
    return true;
}

function aplicarHorasATodosLosRegistros() {
    let aplicados = 0;
    let creditosRecalculados = 0;
    D.registros().forEach(r => {
        if (r.objetivoHoras === D.horasDiarias()) return;
        r.objetivoHoras = D.horasDiarias();
        aplicados++;
        if (r.credito && r.entrada && r.salida && !TiposRegistro.esRegistroEspecial(r.entrada, r.salida)) {
            if (_recalcularCreditoRegistro(r, D.horasDiarias())) creditosRecalculados++;
        }
    });
    if (aplicados > 0) GestorHistorial.saveState(D.registros(), `aplicar horas a todos (${aplicados} registro${TiempoUtils.pluralizar(aplicados)})`);
    return { aplicados, creditosRecalculados };
}


export const Compensatorios = {
    _esObjetivoValido,
    sanitizarHistorialDiasHabiles,
    diasHabilesEnFecha,
    registrarCambioDiasHabiles,
    objetivoDeRegistro,
    esTipoRemoto,
    _excedenteDeRegistro,
    calcularAsignacionesCompensatorio,
    _buscarAsignacionCompensatorio,
    _montoCompensadoPorRegistro,
    fechaCompensadaPorRegistro,
    fechaCompensadoDeRegistro,
    montoCompensadoDeReferencia,
    horasEfectivasDeRegistro,
    objetivoEdicionEnVivo,
    migrarObjetivoHorasFaltante,
    _recalcularCreditoRegistro,
    aplicarHorasATodosLosRegistros
};
