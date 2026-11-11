import { TiempoUtils } from '../core/tiempo-utils.js';
import { EstadoApp } from './estado-app.js';
import { Compensatorios } from './compensatorios.js';
import { RecordatorioPush } from './recordatorio-push.js';
import { TiposRegistro } from './tipos-registro.js';
import { DiasHabiles } from './dias-habiles.js';
import { Objetivos } from './objetivos.js';
import { Jornada } from './jornada.js';
import { SaldoSemanal } from './saldo-semanal.js';

// ====================================================================
//         END-OF-DAY REMINDER SYNC (qué aviso de fin de jornada corresponde hoy)
// ====================================================================
// Decide si hay que programar, reprogramar o cancelar el aviso según la jornada abierta, el objetivo, el tiempo
// fuera y el saldo semanal. RecordatorioPush habla con el Worker; este módulo decide cuándo y con qué datos.
// edicion-grupo e importar-exportar no pueden importarlo (ciclo): lo llaman por EstadoApp.sincronizarPushHoy().
const { existeRegistroEnFecha, registroPorFecha } = EstadoApp;
const { objetivoDeRegistro } = Objetivos;
const { calcularAsignacionesCompensatorio } = Compensatorios;
const { detectarAyerAbierto } = Jornada;
const { calcularBufferPeriodo } = SaldoSemanal;

/**
 * Registro cuya salida hay que avisar: el abierto de hoy, o el de ayer si sigue abierto
 * (jornada que cruza la medianoche) y hoy todavía no tiene registro. Debe caer en día hábil.
 */
function _registroAbiertoParaPush(hoy) {
    const regs = EstadoApp.registros();
    let candidato = regs.find(r => r.fecha === hoy && r.entrada && !r.salida) ?? null;
    if (!candidato && !existeRegistroEnFecha(hoy)) {
        const { regAyer, ayerAbierto } = detectarAyerAbierto(hoy, regs);
        if (ayerAbierto) candidato = regAyer;
    }
    if (!candidato) return null;
    return DiasHabiles.esDiaLaboral(candidato.fecha) ? candidato : null;
}

function _sincronizarPushHoy() {
    const hoy = TiempoUtils.obtenerFechaHoy();
    const abierto = _registroAbiertoParaPush(hoy);
    const habilitado = RecordatorioPush.getHabilitado();
    const minutosTF = abierto && !EstadoApp.getIgnorarTiempoFuera() && abierto.tiempoFuera ? TiempoUtils.horaAMinutos(abierto.tiempoFuera) : 0;
    const buffer = abierto ? _bufferSemanalParaPush(abierto.fecha) : 0;
    const nuevoTarget = (habilitado && abierto)
        ? RecordatorioPush.calcularTarget(abierto.fecha, abierto.entrada, objetivoDeRegistro(abierto), buffer, minutosTF)
        : null;
    const targetActual = RecordatorioPush.targetProgramadoParaHoy();
    if (nuevoTarget === targetActual) return;

    if (abierto && nuevoTarget != null) {
        RecordatorioPush.programarFinDeJornada(abierto.fecha, abierto.entrada, objetivoDeRegistro(abierto), buffer, minutosTF);
    } else if (targetActual != null) {
        RecordatorioPush.cancelarFinDeJornada(RecordatorioPush.fechaProgramadaActiva() ?? hoy);
    }
}

function _bufferSemanalActual() {
    const { inicio: iniSemana } = TiempoUtils.obtenerSemanaRangoActual();
    return calcularBufferPeriodo(iniSemana, TiempoUtils.obtenerFechaHoy(), false, 0, calcularAsignacionesCompensatorio());
}

function _ultimoDiaHabilEfectivoSemana() {
    const { fin } = TiempoUtils.obtenerSemanaRangoActual();
    let fecha = fin;
    for (let i = 0; i < 7; i++) {
        if (DiasHabiles.esDiaLaboral(fecha)) {
            const reg = registroPorFecha(fecha);
            const esEspecial = reg && TiposRegistro.esRegistroEspecial(reg.entrada, reg.salida);
            if (!esEspecial) return fecha;
        }
        fecha = TiempoUtils.sumarDias(fecha, -1);
    }
    return null;
}

function _bufferSemanalParaPush(fecha) {
    const buffer = _bufferSemanalActual();
    if (!RecordatorioPush.getUsarBufferSemanal() || !RecordatorioPush.getBufferSoloUltimoDia()) return buffer;
    return fecha === _ultimoDiaHabilEfectivoSemana() ? buffer : 0;
}

EstadoApp.setSincronizarPushHoyHook(_sincronizarPushHoy);

export const AvisoJornada = {
    sincronizarHoy: _sincronizarPushHoy,
    registroAbierto: _registroAbiertoParaPush,
    bufferSemanalPara: _bufferSemanalParaPush,
};
