import { STORAGE_KEYS } from '../core/constantes.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { html, icono } from '../core/html.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { FiltrosYPeriodos } from '../services/filtros-periodos.js';
import { TarjetaLote } from './tarjeta-lote.js';
import { _crearPopupFlotante } from './popups.js';
import { EdicionRegistro } from '../services/edicion-registro.js';

// ====================================================================
//              UI CALENDAR POPUPS (detalle del día y de la semana)
// ====================================================================
// Popups de los días del calendario: detalle de un registro (click o hover), día sin registro (acciones para cargarlo)
// y resumen de la semana (long press en móvil, click secundario en PC). Hay un solo popup abierto a la vez.
// No depende del estado del calendario (mes mostrado): calendario.js engancha estos handlers en cada celda.

let _popupCalendarioEl = null;

/** @param {any} [asignaciones] */
function _buildInfoHtmlRegistro(reg, asignaciones = null) {
    const est = SaldoSemanal.estadoDeRegistro(reg, asignaciones || Compensatorios.calcularAsignacionesCompensatorio());
    if (est.estado === 'especial') {
        const { tipo } = est;
        const colorSafe = /^[a-z]+$/.test(tipo?.color || '') ? tipo?.color : 'purple';
        const fechaCompensadaHtml = est.fechaCompensada
            ? html` <span class="cal-popup-badge cal-popup-badge--${colorSafe}">${TiempoUtils.fechaCorta(est.fechaCompensada)}</span>`
            : '';
        return html`<span class="cal-popup-badge cal-popup-badge--${colorSafe}">${tipo?.emoji ?? ''} ${tipo?.label}</span>${fechaCompensadaHtml}`;
    }
    if (est.estado === 'en-curso') {
        const esHoy = reg.fecha === TiempoUtils.obtenerFechaHoy();
        return html`<div class="cal-popup-info cal-popup-info--blue">${esHoy ? 'En curso' : 'Incompleto'}</div>
            <div class="cal-popup-3l">Entrada: ${reg.entrada}</div>`;
    }
    let tfStr = '';
    if (reg.tiempoFuera && reg.tiempoFuera !== '00:00') {
        tfStr = `${TiempoUtils.horasATexto(TiempoUtils.horaAMinutos(reg.tiempoFuera) / 60, 'short')} fuera`;
    }
    const diffClase = { cumplido: 'cal-popup-info--green', cubierto: 'cal-popup-info--gold', incompleto: 'cal-popup-info--red' }[est.estado] || '';
    const totalConDiff = TiempoUtils.horasATexto(reg.total || 0, 'short') + (est.diffText ? ` (${est.diffText})` : '');
    const cubiertoLineaHtml = est.estado === 'cubierto' ? html`<span class="cal-popup-badge cal-popup-badge--gold">Cubierto</span>` : '';
    const salidaTempranaLineaHtml = reg.credito && reg.credito !== '00:00' ? html`<span class="cal-popup-badge cal-popup-badge--blue">Salida temprana</span>` : '';
    const compensadoLineaHtml = est.fechaCompensado
        ? html`<span class="cal-popup-badge cal-popup-badge--purple">→ ${TiempoUtils.fechaCorta(est.fechaCompensado)}</span>`
        : '';
    return html`<div class="cal-popup-info${diffClase ? ' ' + diffClase : ''}">${totalConDiff}</div>
        ${cubiertoLineaHtml}
        ${salidaTempranaLineaHtml}
        ${compensadoLineaHtml}
        <div class="cal-popup-3l">${reg.entrada} → ${reg.salida}</div>
        ${tfStr ? _cajaPopupHtml('#icon-exit', tfStr) : ''}`;
}

function _cerrarPopupCalendario() {
    if (!_popupCalendarioEl) return;
    const el = _popupCalendarioEl;
    _popupCalendarioEl = null;
    if (el._cerrar) el._cerrar();
    else el.remove();
}

function _cajaPopupHtml(iconoHref, texto) {
    return html`<div class="cal-popup-caja">
        ${icono(iconoHref, 'cal-popup-caja-icono')}
        <span class="cal-popup-caja-texto">${texto}</span>
    </div>`;
}

function _formatearFechaLabelPopup(fecha) {
    const d = new Date(fecha + 'T12:00:00');
    const diaSemana = TiempoUtils.obtenerNombreDia(fecha).toLowerCase();
    const mes = TiempoUtils.nombreMesPorIndice(d.getMonth());
    return `${diaSemana}, ${d.getDate()} de ${mes}`;
}

/** @param {any} [asignaciones] */
function _popupCalendario(event, registroId, asignaciones = null) {
    event.stopPropagation();

    _cerrarPopupCalendario();

    const reg = EstadoApp.registroPorId(registroId);
    if (!reg) return;

    const claveMes = reg.fecha.substring(0, 7);
    const registrosDelMes = EstadoApp.registros().filter(r => r.fecha.substring(0, 7) === claveMes);
    const grupos = TiposRegistro.agruparConsecutivos(registrosDelMes);
    const grupoDelRegistro = grupos.find(g => g.tipo === 'grupo' && g.registros.some(r => r.id === registroId));

    const fechaLabel = _formatearFechaLabelPopup(reg.fecha);
    const infoHtml = _buildInfoHtmlRegistro(reg, asignaciones);
    const notasTexto = reg.notas || (grupoDelRegistro && TiposRegistro.notaDeGrupo(grupoDelRegistro));
    const comentarioHtml = notasTexto ? _cajaPopupHtml('#icon-comment', notasTexto) : '';
    const btnGrupoHtml = grupoDelRegistro ? html`
        <button class="cal-popup-btn-edit" id="_cal-popup-btn-grupo">
            ${icono('#icon-grid-group')}
            Editar grupo
        </button>` : '';

    const { popup, cerrar } = _crearPopupFlotante({
        className: 'cal-popup',
        id: '_cal-popup',
        dataset: { registroId: reg.id },
        html: html`
        <div class="cal-popup-fecha">${fechaLabel}</div>
        ${infoHtml}
        ${comentarioHtml}
        <button class="cal-popup-btn-edit" id="_cal-popup-btn-edit">
            ${icono('#icon-edit')}
            Editar
        </button>
        ${btnGrupoHtml}`,
        event,
        selectorTrigger: '.calendario-dia',
        esMismoTrigger: dia => dia.dataset.regId === reg.id,
        alCerrar: (p) => { if (_popupCalendarioEl === p) _popupCalendarioEl = null; }
    });
    _popupCalendarioEl = popup;

    popup.querySelector('#_cal-popup-btn-edit')?.addEventListener('click', () => {
        cerrar();
        EdicionRegistro.editar(reg.id);
    });
    popup.querySelector('#_cal-popup-btn-grupo')?.addEventListener('click', () => {
        cerrar();
        FiltrosYPeriodos.editarGrupo(grupoDelRegistro);
    });

    popup.addEventListener('mouseenter', () => clearTimeout(_popupCalendarioHoverTimer));
    popup.addEventListener('mouseleave', () => {
        if (_popupCalendarioEsHover) {
            _popupCalendarioHoverTimer = setTimeout(() => {
                _cerrarPopupCalendario();
                _popupCalendarioEsHover = false;
            }, 500);
        }
    });
}

// ── Popup de la semana: long press en móvil, click secundario en PC ──────────
const LONG_PRESS_MS = 500;
const LONG_PRESS_TOLERANCIA_PX = 10;
let _ultimoToqueTs = -Infinity;   // sin toques todavía (con 0, los primeros 1,5 s tras cargar ignoraban el click secundario)
let _longPressDisparadoTs = -Infinity;   // con 0, los primeros 600 ms tras cargar se descartaban los clicks

function _registrarLongPressSemana(grid) {
    if (!grid || grid.dataset.semanaInit) return;
    grid.dataset.semanaInit = '1';
    let timer = null, x0 = 0, y0 = 0;
    const cancelar = () => { clearTimeout(timer); timer = null; };

    grid.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        const celda = e.target.closest('.calendario-dia[data-dia]');
        if (!celda) return;
        _ultimoToqueTs = performance.now();
        x0 = e.clientX; y0 = e.clientY;
        cancelar();
        timer = setTimeout(() => {
            timer = null;
            _longPressDisparadoTs = performance.now();
            const puedeVibrar = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
            if (puedeVibrar && 'vibrate' in navigator) { try { navigator.vibrate(15); } catch (_) { /* la vibración es opcional */ } }
            _popupSemana(celda);
        }, LONG_PRESS_MS);
    }, { passive: true });

    grid.addEventListener('pointermove', (e) => {
        if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > LONG_PRESS_TOLERANCIA_PX) cancelar();
    }, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(tipo => grid.addEventListener(tipo, cancelar, { passive: true }));

    grid.addEventListener('contextmenu', (e) => {
        const celda = e.target.closest('.calendario-dia[data-dia]');
        if (!celda) return;
        e.preventDefault();
        if (performance.now() - _ultimoToqueTs < 1500) return;
        _popupSemana(celda);
    });

    grid.addEventListener('click', (e) => {
        if (performance.now() - _longPressDisparadoTs < 600) { e.stopPropagation(); e.preventDefault(); }
    }, true);
}

function _filaSemana(r, asignaciones) {
    const est = SaldoSemanal.estadoDeRegistro(r, asignaciones);
    const color = SaldoSemanal.colorDeEstado(est);
    const colorSafe = /^[a-z]+$/.test(color || '') ? color : 'neutro';
    const diaTxt = `${TiempoUtils.obtenerNombreDia(r.fecha).slice(0, 3)} ${parseInt(r.fecha.substring(8), 10)}`;
    let medio = '', totalHtml = null, diffHtml = null;
    if (est.estado === 'especial') {
        medio = `${est.tipo?.emoji ?? ''} ${est.tipo?.label}`.trim();
    } else if (est.estado === 'en-curso') {
        medio = `${r.entrada} → …`;
        totalHtml = html`<span class="cal-semana-hs cal-popup-info--blue">${r.fecha === TiempoUtils.obtenerFechaHoy() ? 'En curso' : 'Incompleto'}</span>`;
    } else if (est.estado === 'sin-datos') {
        medio = '-';
    } else {
        medio = `${r.entrada} → ${r.salida}`;
        totalHtml = html`<span class="cal-semana-hs">${TiempoUtils.horasATexto(r.total || 0, 'short')}</span>`;
        if (est.diffText) diffHtml = html`<span class="cal-semana-diff cal-popup-info--${colorSafe}">${est.diffText}</span>`;
    }
    return html`<span class="cal-semana-punto cal-semana-punto--${colorSafe}"></span>
        <span class="cal-semana-dia">${diaTxt}</span>
        <span class="cal-popup-3l">${medio}</span>
        ${totalHtml || html`<span></span>`}
        ${diffHtml || html`<span></span>`}`;
}

function _htmlPopupSemana(lunes) {
    const d = TiempoUtils.parsearFechaLocal(lunes);
    d.setDate(d.getDate() + 6);
    const domingo = TiempoUtils.formatearFechaLocal(d);
    const asignaciones = Compensatorios.calcularAsignacionesCompensatorio();
    const registros = EstadoApp.registros()
        .filter(r => r.fecha >= lunes && r.fecha <= domingo)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

    const titulo = html`<div class="cal-popup-fecha">${TiempoUtils.formatearRangoSemana(lunes)}</div>`;
    if (!registros.length) return html`${titulo}<div class="cal-popup-sin-reg">Sin registros</div>`;

    const total = registros.reduce((sum, r) => sum + Compensatorios.horasEfectivasDeRegistro(r), 0);
    const buffer = FiltrosYPeriodos.calcularBufferPeriodo(lunes, domingo, false, 0, asignaciones);
    const bufferTxt = TiempoUtils.formatoDiferencia(buffer, 0);
    const chip = bufferTxt
        ? html`<span class="registro-total ${buffer > 0 ? 'green-text' : 'red-text'}">${bufferTxt}</span>`
        : '';
    const filas = registros.map(r => _filaSemana(r, asignaciones));
    return html`${titulo}
        <div class="cal-semana-total">
            <span class="cal-popup-info">${TiempoUtils.horasATexto(total, 'short')}</span>
            ${chip}
        </div>
        <div class="cal-semana-lista">${filas}</div>`;
}

function _popupSemana(celda) {
    const fecha = celda?.dataset.dia;
    if (!fecha) return;
    clearTimeout(_popupCalendarioHoverTimer);
    _popupCalendarioEsHover = false;
    _cerrarPopupCalendario();
    
    const ancla = celda.isConnected
        ? celda
        : document.querySelector(`#calendario-grid .calendario-dia[data-dia="${fecha}"]`);
    if (!ancla) return;

    const lunes = TiempoUtils.obtenerLunesSemanaISO(fecha);
    const { popup } = _crearPopupFlotante({
        className: 'cal-popup cal-popup-semana',
        id: '_cal-popup',
        dataset: { semana: lunes },
        html: _htmlPopupSemana(lunes),
        event: { currentTarget: ancla },
        selectorTrigger: '.calendario-dia',
        esMismoTrigger: dia => dia.dataset.dia === fecha,
        alCerrar: (p) => { if (_popupCalendarioEl === p) _popupCalendarioEl = null; }
    });
    _popupCalendarioEl = popup;
}

let _popupCalendarioEsHover = false;
let _popupCalendarioHoverTimer = null;

function _popupCalendarioDiaSinRegistro(event, fecha) {
    event.stopPropagation();
    clearTimeout(_popupCalendarioHoverTimer);
    _popupCalendarioEsHover = false;

    const mismaFecha = _popupCalendarioEl?.dataset.fecha === fecha;
    _cerrarPopupCalendario();
    if (mismaFecha) return;

    const esFechaFutura = fecha > TiempoUtils.obtenerFechaHoy();
    const fechaLabel = _formatearFechaLabelPopup(fecha);

    const { popup, cerrar } = _crearPopupFlotante({
        className: 'cal-popup',
        id: '_cal-popup',
        dataset: { fecha },
        html: html`
        <div class="cal-popup-fecha">${fechaLabel}</div>
        <div class="cal-popup-sin-reg">Sin registros</div>
        ${esFechaFutura ? '' : html`<button class="cal-popup-btn-edit cal-popup-btn-accion cal-popup-btn-accion--normal" id="_cal-popup-btn-normal">
            ${icono('#icon-clock')}
            Jornada regular
        </button>`}
        <button class="cal-popup-btn-edit cal-popup-btn-accion cal-popup-btn-accion--especial" id="_cal-popup-btn-especial">
            ${icono('#icon-calendar-simple')}
            Jornada especial
        </button>`,
        event,
        selectorTrigger: '.calendario-dia',
        esMismoTrigger: dia => dia.dataset.fecha === fecha,
        alCerrar: (p) => { if (_popupCalendarioEl === p) _popupCalendarioEl = null; }
    });
    _popupCalendarioEl = popup;

    popup.querySelector('#_cal-popup-btn-normal')?.addEventListener('click', () => { cerrar(); TarjetaLote._irAFicharConFecha(fecha, false); });
    popup.querySelector('#_cal-popup-btn-especial')?.addEventListener('click', () => { cerrar(); TarjetaLote._irAFicharConFecha(fecha, true); });
}

/** @param {any} [asignaciones] */
function _popupCalendarioHover(event, registroId, asignaciones = null) {
    if (event.sourceCapabilities && event.sourceCapabilities.firesTouchEvents) return;
    if (!window.matchMedia('(hover: hover)').matches) return;
    const stored = Almacenamiento.getItem(STORAGE_KEYS.HOVER_POPUP, null);
    if (stored !== 'true') return;
    if (_popupCalendarioEl && _popupCalendarioEl.dataset.registroId === registroId) return;
    if (_popupCalendarioEl && !_popupCalendarioEsHover) return;
    clearTimeout(_popupCalendarioHoverTimer);
    _popupCalendarioHoverTimer = setTimeout(() => {
        _popupCalendarioEsHover = true;
        _popupCalendario(event, registroId, asignaciones);
    }, 150);
}

/** @param {any} [asignaciones] */
function _onclickCalendarioDia(event, registroId, asignaciones = null) {
    const esDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const stored = Almacenamiento.getItem(STORAGE_KEYS.HOVER_POPUP, null);
    const hoverActivo = esDesktop && stored === 'true';

    if (hoverActivo) {
        _cerrarPopupCalendario();
        clearTimeout(_popupCalendarioHoverTimer);
        EdicionRegistro.editar(registroId);
    } else {
        if (_popupCalendarioEl?.dataset.registroId === registroId) {
            _cerrarPopupCalendario();
            return;
        }
        _popupCalendario(event, registroId, asignaciones);
    }
}

function _cerrarPopupCalendarioHover(event) {
    if (!_popupCalendarioEsHover) return;
    const related = event.relatedTarget;
    if (related && _popupCalendarioEl && _popupCalendarioEl.contains(related)) return;
    clearTimeout(_popupCalendarioHoverTimer);
    _popupCalendarioHoverTimer = setTimeout(() => {
        _cerrarPopupCalendario();
        _popupCalendarioEsHover = false;
    }, 500);
}

export const CalendarioPopups = {
    cerrar: _cerrarPopupCalendario,
    registrarLongPressSemana: _registrarLongPressSemana,
    onclickDia: _onclickCalendarioDia,
    hoverDia: _popupCalendarioHover,
    cerrarHoverDia: _cerrarPopupCalendarioHover,
    diaSinRegistro: _popupCalendarioDiaSinRegistro,
};
