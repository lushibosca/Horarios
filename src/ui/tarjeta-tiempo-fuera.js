import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { TiempoFuera } from '../services/tiempo-fuera.js';
import { Cambios } from '../services/cambios.js';
import { Animaciones } from './animaciones.js';
import { TarjetaLote } from './tarjeta-lote.js';
import { EstadoApp } from '../services/estado-app.js';
import { setIconoBtn } from './boton-fichar.js';
import { mostrarToast } from './toast.js';
import { icono, html, montar } from '../core/html.js';
import { AvisoJornada } from '../services/aviso-jornada.js';
import { Jornada } from '../services/jornada.js';

// ====================================================================
//                     UI CARD BREAK TIMER MODULE
// ====================================================================


function _minutosAHoraWrap(totalMinutos) {
    return TiempoUtils.minutosAHora(TiempoUtils.normalizarMinutosDia(totalMinutos));
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
            montar(label, html`${icono('#icon-exit')}<span class="break-counter-label-text"></span>`);
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

function _actualizarCardTimerRunning(card, sinAnimar = false) {
    if (!card) return;
    card.classList.add('timer-running');
    const titulo = card.querySelector('h2');
    if (!titulo) return;
    const vistaActual = EstadoApp.vistaActual();
    const iconoTitulo = vistaActual === 'semana'
        ? icono('#icon-calendar-simple')
        : icono('#icon-clock');
    const contexto = vistaActual === 'semana' ? 'Esta Semana' : TiempoUtils.obtenerNombreDia(TiempoUtils.obtenerFechaHoy());
    const nuevoHTML = html`${iconoTitulo} ${contexto}<span class="tf-badge">Tiempo fuera</span>`;
    const agregarContador = () => {
        _obtenerOCrearLabelTF(titulo);
        _iniciarContadorBreak();
    };
    Animaciones._renderConFirma(titulo, nuevoHTML, agregarContador, { forzar: sinAnimar });
}

function actualizarEstadoBotonTimerMain(sinAnimarTitulo = false) {
    const btn = $('btn-timer-main');
    const card = $('stats-card');
    if (!btn) return;

    if (TarjetaLote.getModoLoteActivo()) { btn.disabled = true; return; }

    const registroHoy = Jornada.registroParaTiempoFuera();
    const isRunning = TiempoFuera.corriendo();
    const diaCerrado = registroHoy?.salida?.trim() !== '' && !!registroHoy?.salida;

    if (!isRunning && (!registroHoy || diaCerrado)) {
        Object.assign(btn, { disabled: true, title: diaCerrado ? 'Día finalizado' : 'Debés fichar entrada primero' });
    } else {
        Object.assign(btn, { disabled: false, title: isRunning ? 'Detener tiempo fuera' : 'Iniciar tiempo fuera' });
    }

    setIconoBtn(btn, '#icon-exit');
    if (isRunning) {
        btn.classList.add('running');
        _actualizarCardTimerRunning(card, sinAnimarTitulo);
    } else {
        btn.classList.remove('running');
        if (card) card.classList.remove('timer-running');
        _detenerContadorBreak();
    }
}

let _breakCounterInterval = null;

function _iniciarContadorBreak() {
    _detenerContadorBreak();
    function _actualizarContador() {
        const titulo = $('stats-titulo');
        const el = titulo ? titulo.querySelector('#' + TF_LABEL_ID) : null;

        if (!el) { _detenerContadorBreak(); return; }
        const start = TiempoFuera.inicioMs();
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

async function _detenerTimerBreak(registroHoy) {
    if (!TiempoFuera.alcanzaMinimo()) {
        TiempoFuera.descartar();
        mostrarToast('Tiempo muy corto, no se registró', 'info');
        EstadoApp._notify().actualizarUI(); return;
    }
    if (!registroHoy) {
        TiempoFuera.descartar();
        mostrarToast('No hay registro para hoy, tiempo fuera descartado', 'warning');
        EstadoApp._notify().actualizarUI(); return;
    }

    const minutos = TiempoFuera.volcarEnRegistro(registroHoy);
    EstadoApp._aplicarCalculoHoras(registroHoy, registroHoy.entrada, registroHoy.salida, registroHoy.tiempoFuera);
    await Cambios.confirmar(`tiempo fuera +${minutos}min (${TiempoUtils.fechaCorta(registroHoy.fecha)})`, { ids: registroHoy.id });
    AvisoJornada.sincronizarHoy();
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
    const registroHoy = Jornada.registroParaTiempoFuera();

    if (!TiempoFuera.corriendo() && !registroHoy) { mostrarToast('Debés crear un registro para hoy primero', 'warning'); return; }

    if (!TiempoFuera.corriendo()) {
        TiempoFuera.iniciar();
        mostrarToast('Tiempo fuera iniciado', 'info');
    } else {
        await _detenerTimerBreak(registroHoy);
    }
    actualizarEstadoBotonTimerMain();
}

export const TarjetaTiempoFuera = {
    _minutosAHoraWrap,
    _formatearMinutosCorto,
    _obtenerOCrearLabelTF,
    _quitarLabelTF,
    actualizarEstadoBotonTimerMain,
    toggleTimerBreakMain
};
