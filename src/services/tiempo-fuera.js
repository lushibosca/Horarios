import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { EstadoApp } from './estado-app.js';

// ====================================================================
// TIEMPO FUERA EN CURSO (el temporizador de la pausa, sin DOM)
// ====================================================================
// Se guarda solo el momento en que empezó, por perfil. Menos de MIN_SEGUNDOS no cuenta como pausa.
const MIN_SEGUNDOS = 30;

const _clave = () => STORAGE_KEYS.BREAK_TIME(EstadoApp.obtenerPerfilIdActual());

function corriendo() { return Almacenamiento.getItem(_clave()) !== null; }

/** Momento de inicio en ms; NaN si no hay un temporizador corriendo. */
function inicioMs() { return parseInt(Almacenamiento.getItem(_clave())); }

function iniciar() { Almacenamiento.setItem(_clave(), Date.now()); }

function descartar() { Almacenamiento.removeItem(_clave()); }

function segundos() { return Math.floor((Date.now() - inicioMs()) / 1000); }

/** ¿Lo que lleva corriendo alcanza para contar como pausa? */
function alcanzaMinimo() { return segundos() >= MIN_SEGUNDOS; }

/** Minutos que descuenta de la jornada mientras corre (0 si la opción de ignorar el tiempo fuera está activa). */
function minutosActivos() {
    if (EstadoApp.getIgnorarTiempoFuera() || !corriendo()) return 0;
    const mins = Math.floor((Date.now() - inicioMs()) / 60000);
    return mins > 0 ? mins : 0;
}

/**
 * Detiene el temporizador y suma lo que corrió al tiempo fuera del registro, sin recalcular sus horas.
 * Devuelve los minutos sumados, o 0 si no había uno corriendo o duró menos del mínimo.
 */
function volcarEnRegistro(registro) {
    if (!corriendo()) return 0;
    const minutos = alcanzaMinimo() ? TiempoUtils.segundosAMinutosRedondeado(segundos()) : 0;
    if (minutos > 0) registro.tiempoFuera = TiempoUtils.sumarMinutosAHora(registro.tiempoFuera || '00:00', minutos);
    descartar();
    return minutos;
}

export const TiempoFuera = { corriendo, inicioMs, iniciar, descartar, alcanzaMinimo, minutosActivos, volcarEnRegistro };
