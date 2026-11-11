import { MARGEN_HORAS } from '../core/constantes.js';
import { Preferencias } from '../core/preferencias.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp as D } from './estado-app.js';
import { GestorHistorial } from './gestor-historial.js';
import { TiposRegistro } from './tipos-registro.js';

// ====================================================================
// OBJETIVO HORARIO DE CADA REGISTRO Y SALIDA TEMPRANA
// ====================================================================
const _esObjetivoValido = S.esObjetivoHorasValido;

/** Objetivo guardado en el registro (sin mirar la opción de ignorarlo), o el global si no tiene uno válido. Lo usa la edición. */
function objetivoGuardado(registro) {
    const v = registro?.objetivoHoras;
    return _esObjetivoValido(v) ? v : D.horasDiarias();
}

function objetivoDeRegistro(registro) {
    if (Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.get()) return D.horasDiarias();
    const v = registro?.objetivoHoras;
    return _esObjetivoValido(v) ? v : D.horasDiarias();
}

function objetivoEdicionEnVivo() {
    if (Preferencias.IGNORAR_OBJETIVO_POR_REGISTRO.get()) return D.horasDiarias();
    const v = D._notify().leerObjetivoEdicion();
    return _esObjetivoValido(v) ? v : D.horasDiarias();
}

function migrarObjetivoHorasFaltante() {
    let migrados = 0;
    D.registros().forEach(r => {
        if (!_esObjetivoValido(r.objetivoHoras)) {
            r.objetivoHoras = D.horasDiarias();
            migrados++;
        }
    });
    return migrados;
}

function horasEfectivasDeRegistro(registro) {
    const tipo = TiposRegistro.obtenerTipoPorCodigo(registro.entrada, registro.salida);
    if (tipo && tipo.id === 'remoto') return objetivoDeRegistro(registro);
    if (tipo && tipo.id === 'compensatorio') return 0;
    if (!tipo) return registro.total;
    return 0;
}

/** Salida temprana ("HH:MM") de una jornada: lo que le falta para llegar al objetivo, o null si no falta nada. */
function _creditoDesdeTotal(total, objetivo) {
    const diferencia = objetivo - total;
    return diferencia > MARGEN_HORAS ? TiempoUtils.minutosAHora(TiempoUtils.horasAMinutosRedondeados(diferencia)) : null;
}

function creditoPara(entrada, salida, tiempoFuera, objetivo) {
    const crudo = D.calcularHoras(entrada, salida, tiempoFuera || null, null);
    return crudo ? _creditoDesdeTotal(crudo.total, objetivo) : null;
}

function _recalcularCreditoRegistro(r, nuevoObjetivo) {
    const crudo = D.calcularHoras(r.entrada, r.salida, r.tiempoFuera || null, null);
    if (!crudo) return false;
    r.credito = _creditoDesdeTotal(crudo.total, nuevoObjetivo);
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
    if (aplicados > 0) GestorHistorial.saveState(D.registros(), `aplicar horas a todos (${TiempoUtils.contar(aplicados, 'registro')})`);
    return { aplicados, creditosRecalculados };
}

export const Objetivos = {
    _esObjetivoValido,
    objetivoGuardado,
    objetivoDeRegistro,
    objetivoEdicionEnVivo,
    migrarObjetivoHorasFaltante,
    horasEfectivasDeRegistro,
    creditoPara,
    _recalcularCreditoRegistro,
    aplicarHorasATodosLosRegistros
};
