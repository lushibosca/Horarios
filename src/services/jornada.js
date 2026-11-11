import { MS_DIA } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { EstadoApp } from './estado-app.js';

// ====================================================================
// JORNADA DE HOY (incluye la de ayer que cruza la medianoche)
// ====================================================================
function detectarAyerAbierto(fechaHoy, regs) {
    const ayerStr = TiempoUtils.sumarDias(fechaHoy, -1);
    const regAyer = regs instanceof Map ? (regs.get(ayerStr) ?? null) : (regs.find(r => r.fecha === ayerStr) ?? null);

    let ayerAbierto = false;
    if (regAyer?.entrada && !regAyer.salida) {
        const [hE, mE] = regAyer.entrada.split(':').map(Number);
        const fechaEntrada = TiempoUtils.parsearFechaLocal(ayerStr);
        fechaEntrada.setHours(hE, mE, 0, 0);
        ayerAbierto = (Date.now() - fechaEntrada.getTime()) <= MS_DIA;
    }
    return { ayerStr, regAyer, ayerAbierto };
}

/** Jornada de la que se habla "hoy": la de ayer si sigue abierta y hoy no tiene entrada (cruce de medianoche); si no, el registro de hoy. */
function jornadaVigente(regHoy, regAyer, ayerAbierto) {
    return ayerAbierto && !regHoy?.entrada ? regAyer : regHoy;
}

/** La jornada vigente, solo si todavía no cerró (la que corre ahora). */
function jornadaActiva(regHoy, regAyer, ayerAbierto) {
    const vigente = jornadaVigente(regHoy, regAyer, ayerAbierto);
    return vigente?.entrada && !vigente.salida ? vigente : null;
}

function registroParaTiempoFuera(fechaHoy = TiempoUtils.obtenerFechaHoy()) {
    const regHoy = EstadoApp.registroPorFecha(fechaHoy) ?? null;
    const { regAyer, ayerAbierto } = detectarAyerAbierto(fechaHoy, EstadoApp.registros());
    return jornadaVigente(regHoy, regAyer, ayerAbierto);
}

export const Jornada = { detectarAyerAbierto, jornadaVigente, jornadaActiva, registroParaTiempoFuera };
