import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorPerfiles } from '../services/gestor-perfiles.js';
import { GestorHistorial } from '../services/gestor-historial.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { Animaciones } from './animaciones.js';
import { TarjetaLote } from './tarjeta-lote.js';
import { EstadoApp } from '../services/estado-app.js';
import { FiltrosYPeriodos } from '../services/filtros-periodos.js';
import { setIconoBtn } from './boton-fichar.js';
import { mostrarToast } from './toast.js';
import { icono } from '../core/html.js';

// ====================================================================
//                     UI CARD BREAK TIMER MODULE
// ====================================================================


function _breakStorageKey() {
    const perfilId = GestorPerfiles ? GestorPerfiles.obtenerPerfilActual() : 'default';
    return STORAGE_KEYS.BREAK_TIME(perfilId);
}

function _minutosBreakActivo() {
    if (EstadoApp.getIgnorarTiempoFuera()) return 0;
    const inicioBreak = Almacenamiento.getItem(_breakStorageKey());
    if (!inicioBreak) return 0;
    const mins = Math.floor((Date.now() - parseInt(inicioBreak)) / 60000);
    return mins > 0 ? mins : 0;
}

function _minutosAHoraWrap(totalMinutos) {
    const normalizado = ((totalMinutos % 1440) + 1440) % 1440;
    return TiempoUtils.minutosAHora(normalizado);
}

function _formatearMinutosCorto(totalMinutos) {
    return TiempoUtils.horasATexto(totalMinutos / 60, 'short');
}

const TF_LABEL_ID = 'tiempo-fuera-label';

function _obtenerOCrearLabelTF(contenedor) {
    const enBadge = !!contenedor.querySelector('.tf-badge');
    const destino = contenedor.querySelector('.tf-badge') || contenedor;
    let label = contenedor.querySelector('#' + TF_LABEL_ID);
    if (!label) {
        label = document.createElement('span');
        label.id = TF_LABEL_ID;
        label.className = 'break-counter-label';
        if (!enBadge) {
            label.innerHTML = `${icono('#icon-exit')}<span class="break-counter-label-text"></span>`;
        }
        const estadoBadge = !enBadge ? contenedor.querySelector('.estado-badge') : null;
        if (estadoBadge) {
            destino.insertBefore(label, estadoBadge);
        } else {
            destino.appendChild(label);
        }
    }
    return label;
}

function _quitarLabelTF(contenedor) {
    if (!contenedor) return;
    const label = contenedor.querySelector('#' + TF_LABEL_ID);
    if (label) label.remove();
}

function _actualizarCardTimerRunning(card, storageKey, sinAnimar = false) {
    if (!card) return;
    card.classList.add('timer-running');
    const titulo = card.querySelector('h2');
    if (!titulo) return;
    const vistaActual = EstadoApp.vistaActual();
    const iconoTitulo = vistaActual === 'semana'
        ? icono('#icon-calendar-simple')
        : icono('#icon-clock');
    const contexto = vistaActual === 'semana' ? 'Esta Semana' : TiempoUtils.obtenerNombreDia(TiempoUtils.obtenerFechaHoy());
    const nuevoHTML = `${iconoTitulo} ${contexto}<span class="tf-badge">Tiempo fuera</span>`;
    const agregarContador = () => {
        _obtenerOCrearLabelTF(titulo);
        _iniciarContadorBreak(storageKey);
    };
    Animaciones._renderConFirma(titulo, nuevoHTML, agregarContador, { forzar: sinAnimar });
}

function actualizarEstadoBotonTimerMain(sinAnimarTitulo = false) {
    const btn = $('btn-timer-main');
    const card = $('stats-card');
    if (!btn) return;

    if (TarjetaLote.getModoLoteActivo()) { btn.disabled = true; return; }

    const registroHoy = FiltrosYPeriodos.registroParaTiempoFuera();
    const storageKey = _breakStorageKey();
    const isRunning = Almacenamiento.getItem(storageKey) !== null;
    const diaCerrado = registroHoy?.salida?.trim() !== '' && !!registroHoy?.salida;

    if (!isRunning && (!registroHoy || diaCerrado)) {
        Object.assign(btn, { disabled: true, title: diaCerrado ? 'Día finalizado' : 'Debés fichar entrada primero' });
    } else {
        Object.assign(btn, { disabled: false, title: isRunning ? 'Detener tiempo fuera' : 'Iniciar tiempo fuera' });
    }

    setIconoBtn(btn, '#icon-exit');
    if (isRunning) {
        btn.classList.add('running');
        _actualizarCardTimerRunning(card, storageKey, sinAnimarTitulo);
    } else {
        btn.classList.remove('running');
        if (card) card.classList.remove('timer-running');
        _detenerContadorBreak();
    }
}

let _breakCounterInterval = null;

function _iniciarContadorBreak(storageKey) {
    _detenerContadorBreak();
    function _actualizarContador() {
        const titulo = $('stats-titulo');
        const el = titulo ? titulo.querySelector('#' + TF_LABEL_ID) : null;

        if (!el) { _detenerContadorBreak(); return; }
        const start = parseInt(Almacenamiento.getItem(storageKey));
        if (isNaN(start)) { el.textContent = ''; _detenerContadorBreak(); return; }
        const mins = Math.floor((Date.now() - start) / 60000);
        el.textContent = _formatearMinutosCorto(mins);
    }
    _actualizarContador();
    _breakCounterInterval = setInterval(_actualizarContador, 1000);
}

function _detenerContadorBreak() {
    if (_breakCounterInterval) {
        clearInterval(_breakCounterInterval);
        _breakCounterInterval = null;
    }
}

async function _detenerTimerBreak(registroHoy, storageKey, storedStart) {
    const totalSeg = Math.floor((Date.now() - parseInt(storedStart)) / 1000);

    if (totalSeg < 30) {
        Almacenamiento.removeItem(storageKey);
        mostrarToast('Tiempo muy corto, no se registró', 'info');
        EstadoApp._notify().actualizarUI(); return;
    }
    if (!registroHoy) {
        Almacenamiento.removeItem(storageKey);
        mostrarToast('No hay registro para hoy, tiempo fuera descartado', 'warning');
        EstadoApp._notify().actualizarUI(); return;
    }

    const minutos = TiempoUtils.segundosAMinutosRedondeado(totalSeg);
    registroHoy.tiempoFuera = TiempoUtils.sumarMinutosAHora(registroHoy.tiempoFuera || '00:00', minutos);
    const t = EstadoApp.calcularHoras(registroHoy.entrada, registroHoy.salida, registroHoy.tiempoFuera);
    registroHoy.horas = t?.horas || 0; registroHoy.minutos = t?.minutos || 0; registroHoy.total = t?.total || 0;
    GestorHistorial.saveState(EstadoApp.registros(), `tiempo fuera +${minutos}min (${TiempoUtils.fechaCorta(registroHoy.fecha)})`);
    Almacenamiento.removeItem(storageKey);
    await EstadoApp.guardarYActualizar(registroHoy.id);
    GestionDatos.sincronizarPushHoy();
    const ignorarTF = EstadoApp.getIgnorarTiempoFuera();
    const diaTexto = registroHoy.fecha === TiempoUtils.obtenerFechaHoy() ? 'hoy' : 'ayer';
    const mensajeToast = ignorarTF
        ? (minutos === 1
            ? 'Se registró 1 minuto de tiempo fuera (cálculo ignorado)'
            : `Se registraron ${minutos} minutos de tiempo fuera (cálculo ignorado)`)
        : (minutos === 1 ? `Se descontó 1 minuto al registro de ${diaTexto}` : `Se descontaron ${minutos} minutos al registro de ${diaTexto}`);
    mostrarToast(mensajeToast, ignorarTF ? 'info' : 'success');
}

async function toggleTimerBreakMain() {
    const storageKey = _breakStorageKey();
    const storedStart = Almacenamiento.getItem(storageKey);
    const registroHoy = FiltrosYPeriodos.registroParaTiempoFuera();

    if (!storedStart && !registroHoy) { mostrarToast('Debés crear un registro para hoy primero', 'warning'); return; }

    if (!storedStart) {
        Almacenamiento.setItem(storageKey, Date.now());
        mostrarToast('Tiempo fuera iniciado', 'info');
    } else {
        await _detenerTimerBreak(registroHoy, storageKey, storedStart);
    }
    actualizarEstadoBotonTimerMain();
}

export const TarjetaTiempoFuera = {
    _breakStorageKey,
    _minutosBreakActivo,
    _minutosAHoraWrap,
    _formatearMinutosCorto,
    TF_LABEL_ID,
    _obtenerOCrearLabelTF,
    _quitarLabelTF,
    _actualizarCardTimerRunning,
    actualizarEstadoBotonTimerMain,
    _iniciarContadorBreak,
    _detenerContadorBreak,
    _detenerTimerBreak,
    toggleTimerBreakMain
};
