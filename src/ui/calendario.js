import { STORAGE_KEYS, DEFAULTS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Movimiento } from '../core/movimiento.js';
import { EventosApp } from '../core/eventos.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { TarjetaLote } from './tarjeta-lote.js';
import { html, icono } from '../core/html.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { FiltrosYPeriodos } from '../services/filtros-periodos.js';
import { registrarSwipe } from './gestos.js';
import { _crearPopupFlotante } from './popups.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
//                     UI CALENDAR MODULE
// ====================================================================
const {
    _animarMutacion, _animarSlideElemento, _flashElemento, DUR_CALENDARIO, _crearFantasmaSiVisible,
    _aArray, _estaColapsado, _durSiAnima
} = Animaciones;

/** @param {any} [idResaltar] */
function _cerrarSelectorMeses(idResaltar = null) {
    const grid = $('calendario-grid');
    const selector = $('calendario-selector-meses');
    const navBotones = $('calendario-nav-botones');
    _animarMutacion([selector, grid], () => {
        selector.style.display = 'none';
        navBotones.style.display = 'flex';
        grid.style.display = 'grid';
        _renderizarCalendario(idResaltar);
    });
}

function abrirSelectorMesesCalendario() {
    const grid = $('calendario-grid');
    const selector = $('calendario-selector-meses');
    const navBotones = $('calendario-nav-botones');
    const titulo = $('calendario-titulo-mes');

    if (selector.style.display !== 'none') { _cerrarSelectorMeses(); return; }

    const mesesOrdenados = [...new Set(EstadoApp.registros().map(r => r.fecha.substring(0, 7)))].sort().reverse();
    selector.innerHTML = '';

    if (mesesOrdenados.length === 0) {
        const emptyEl = Object.assign(document.createElement('div'), {
            className: 'empty-state empty-state--calendario',
            textContent: 'No hay registros'
        });
        selector.appendChild(emptyEl);
    } else {
        const hoy = new Date();
        const anioActual = _calendarioMes ? _calendarioMes.anio : hoy.getFullYear();
        const mesActual = _calendarioMes ? _calendarioMes.mes : hoy.getMonth();

        TiempoUtils.agruparMesesPorAnio(mesesOrdenados).forEach((meses, anioStr) => {
            const separador = Object.assign(document.createElement('div'), {
                className: 'selector-meses-anio-header',
                textContent: anioStr
            });
            selector.appendChild(separador);

            meses.forEach(mesAnio => {
                const [aStr, mesStr] = mesAnio.split('-');
                const anio = parseInt(aStr), mes = parseInt(mesStr) - 1;
                const btn = Object.assign(document.createElement('button'), {
                    className: 'btn-mes-calendario',
                    textContent: TiempoUtils.nombreMesCapitalizado(mesAnio)
                });
                if (anio === anioActual && mes === mesActual) btn.classList.add('activo');
                btn.onclick = (e) => { e.stopPropagation(); _calendarioMes = { anio, mes }; _cerrarSelectorMeses(); };
                selector.appendChild(btn);
            });
        });
    }

    selector.style.height = grid.getBoundingClientRect().height + 'px';
    _animarMutacion([grid, selector], () => {
        grid.style.display = 'none';
        navBotones.style.display = 'none';
        titulo.innerHTML = `${icono('#icon-back')} Volver`;
        selector.style.display = 'grid';
    });
}

function _activarVistaCalendarioHistorico() {
    if (!_vistaHistoricoCalendario) return;
    const lista = $('lista-registros');
    const cal = $('vista-calendario-historico');
    const btnFiltro = $('btn-filtro');
    if (lista) lista.classList.add('hidden');
    if (cal) cal.classList.remove('hidden');
    if (btnFiltro) btnFiltro.disabled = false;
    _renderizarCalendario();
}

let _calendarioMes = null;

/** @param {any} [idResaltar] @param {any} [asignacionesPrecalculadas] */
function _renderizarCalendario(idResaltar = null, asignacionesPrecalculadas = null) {
    const grid = $('calendario-grid');
    const titulo = $('calendario-titulo-mes');
    if (!grid) return;

    if (grid.parentNode) {
        registrarSwipe(grid.parentNode, dir => navegarCalendario(dir));
    } else {
        registrarSwipe(grid, dir => navegarCalendario(dir));
    }
    _registrarLongPressSemana(grid);

    const hoy = new Date();
    const anio = _calendarioMes ? _calendarioMes.anio : hoy.getFullYear();
    const mes = _calendarioMes ? _calendarioMes.mes : hoy.getMonth();
    if (titulo) titulo.textContent = `${TiempoUtils.nombreMesPorIndice(mes)} ${anio}`;
    const fechaStr = (y, m, d) => `${y}-${TiempoUtils._pad2(m + 1)}-${TiempoUtils._pad2(d)}`;
    const registrosFiltrados = FiltrosYPeriodos.obtenerRegistrosFiltrados();
    const todosLosRegistros = EstadoApp.registros();
    const regsPorFecha = Object.fromEntries(registrosFiltrados.map(r => [r.fecha, r]));
    const todosRegsPorFecha = Object.fromEntries(todosLosRegistros.map(r => [r.fecha, r]));
    const filtroActivo = registrosFiltrados.length !== todosLosRegistros.length;
    const asignacionesCompensatorio = asignacionesPrecalculadas || Compensatorios.calcularAsignacionesCompensatorio();
    const claveMes = `${anio}-${TiempoUtils._pad2(mes + 1)}`;
    const notasDelMes = TiposRegistro.mapaNotasPorRegistro(todosLosRegistros.filter(r => r.fecha.startsWith(claveMes)));
    const claseDelDia = (fecha) => {
        const r = regsPorFecha[fecha];
        if (!r && filtroActivo && todosRegsPorFecha[fecha]) return 'dia-filtrado';
        if (!r) return 'dia-sin-registro';
        const { estado, tipo } = SaldoSemanal.estadoDeRegistro(r, asignacionesCompensatorio);
        if (estado === 'especial') return `dia-especial-${tipo?.color}`;
        if (estado === 'en-curso') return 'dia-en-curso';
        if (estado === 'cubierto') return 'dia-cubierto';
        if (estado === 'incompleto' || estado === 'sin-datos') return 'dia-incompleto';
        return 'dia-normal';
    };

    const diasNombre = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);
    const frag = document.createDocumentFragment();

    diasNombre.forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'calendario-dia-nombre';
        cell.textContent = d;
        frag.appendChild(cell);
    });

    const offsetInicio = primerDia.getDay();
    for (let i = 0; i < offsetInicio; i++) {
        const vacio = document.createElement('div');
        vacio.className = 'calendario-dia vacio';
        frag.appendChild(vacio);
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const fecha = fechaStr(anio, mes, dia);
        const clase = claseDelDia(fecha);
        const esHoy = anio === hoy.getFullYear() && mes === hoy.getMonth() && dia === hoy.getDate();
        const reg = regsPorFecha[fecha];
        const idsNuevos = _aArray(idResaltar);
        const esNuevo = reg && idsNuevos.includes(reg.id);

        const cell = document.createElement('div');
        let clases = `calendario-dia ${clase}`;
        if (esHoy) clases += ' hoy';
        if (clase === 'dia-sin-registro' && !TiempoUtils.esFechaHabil(fecha, Compensatorios.diasHabilesEnFecha(fecha))) clases += ' no-laborable';
        if (esNuevo) {
            clases += ' nuevo-registro-animacion';
            cell.addEventListener('animationend', () => cell.classList.remove('nuevo-registro-animacion'), { once: true });
        }
        if (reg) clases += ' cursor-pointer';
        if (reg && notasDelMes.has(reg.id)) clases += ' tiene-comentario';
        cell.className = clases;
        cell.textContent = String(dia);
        cell.dataset.dia = fecha;

        if (reg) {
            cell.dataset.regId = reg.id;
            cell.addEventListener('click', (e) => _onclickCalendarioDia(e, reg.id, asignacionesCompensatorio));
            cell.addEventListener('mouseenter', (e) => _popupCalendarioHover(e, reg.id, asignacionesCompensatorio));
            cell.addEventListener('mouseleave', (e) => _cerrarPopupCalendarioHover(e));
        } else if (clase === 'dia-sin-registro') {
            cell.classList.add('cursor-pointer');
            cell.dataset.fecha = fecha;
            cell.addEventListener('click', (e) => _popupCalendarioDiaSinRegistro(e, fecha));
        }

        frag.appendChild(cell);
    }

    const { inicio: semIni, fin: semFin } = TiempoUtils.obtenerSemanaRangoActual();
    const esLaborable = (f) => TiempoUtils.esFechaHabil(f, Compensatorios.diasHabilesEnFecha(f));
    const fechaDeDia = (d) => TiempoUtils.formatearFechaLocal(new Date(anio, mes, d));
    const segmentosSemana = [];
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
        const f = fechaStr(anio, mes, d);
        if (f < semIni || f > semFin || !esLaborable(f)) continue;
        const idx = offsetInicio + d - 1;
        const fila = 2 + Math.floor(idx / 7);
        const col = 1 + (idx % 7);
        const ultimo = segmentosSemana[segmentosSemana.length - 1];
        if (ultimo && ultimo.fila === fila && ultimo.hasta === col - 1) {
            ultimo.hasta = col;
            ultimo.diaFin = d;
        } else {
            segmentosSemana.push({ fila, desde: col, hasta: col, diaIni: d, diaFin: d });
        }
    }
    segmentosSemana.forEach(seg => {
        const banda = document.createElement('div');
        banda.className = 'calendario-semana-actual';
        if (seg.desde === 1 && esLaborable(fechaDeDia(seg.diaIni - 1))) banda.classList.add('abierta-izq');
        if (seg.hasta === 7 && esLaborable(fechaDeDia(seg.diaFin + 1))) banda.classList.add('abierta-der');
        banda.setAttribute('aria-hidden', 'true');
        banda.style.gridArea = `${seg.fila} / ${seg.desde} / ${seg.fila + 1} / ${seg.hasta + 1}`;
        frag.appendChild(banda);
    });

    grid.classList.toggle('calendario-filtro-activo', filtroActivo);

    if (idResaltar) {
        const idsAnimados = _aArray(idResaltar).map(String);
        /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll('.calendario-dia[data-reg-id]')).forEach(celdaVieja => {
            if (idsAnimados.includes(celdaVieja.dataset.regId ?? '')) _crearFantasmaSiVisible(celdaVieja);
        });
    }

    grid.innerHTML = '';
    grid.appendChild(frag);

}

// Entrada inicial: pop escalonado de los días con registro (se llama una vez tras el primer render)
const ENTRADA_PASO_MS = 25;
const ENTRADA_TOTAL_MAX_MS = 350;

function _limpiarEntradaCalendario(grid) {
    grid.style.removeProperty('--cal-n');
    grid.style.removeProperty('--cal-paso');
    grid.querySelectorAll('.cal-entrada, .cal-entrada-remate')
        .forEach(c => c.classList.remove('cal-entrada', 'cal-entrada-remate'));
}

function animarEntradaInicial() {
    const grid = $('calendario-grid');
    if (!grid || Movimiento.reducido() || !grid.offsetParent || _estaColapsado(grid)) return;
    const celdas = /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll('.calendario-dia[data-reg-id]'));
    if (!celdas.length) return;

    const paso = Math.min(ENTRADA_PASO_MS, Math.floor(ENTRADA_TOTAL_MAX_MS / celdas.length));
    grid.style.setProperty('--cal-n', String(celdas.length));
    grid.style.setProperty('--cal-paso', paso + 'ms');
    celdas.forEach((celda, i) => {
        const num = document.createElement('span');
        num.className = 'calendario-dia-num';
        num.textContent = celda.textContent;
        celda.replaceChildren(num);
        celda.style.setProperty('--i', String(i));
        celda.classList.add('cal-entrada');
    });
    grid.querySelector('.calendario-dia.hoy:not([data-reg-id])')?.classList.add('cal-entrada-remate');

    const total = _durSiAnima('--dur-cal-espera') + celdas.length * paso
        + _durSiAnima('--dur-cal-entrada') + _durSiAnima('--dur-anim') + 100;
    setTimeout(() => _limpiarEntradaCalendario(grid), total);
}

let _vistaHistoricoCalendario = false;

function toggleVistaHistorico() {
    _vistaHistoricoCalendario = !_vistaHistoricoCalendario;
    Almacenamiento.setItem(STORAGE_KEYS.VISTA_HISTORICO_CAL, _vistaHistoricoCalendario);

    const lista = $('lista-registros');
    const cal = $('vista-calendario-historico');
    if (lista) {
        lista.querySelectorAll('.nuevo-registro-animacion').forEach(el => el.classList.remove('nuevo-registro-animacion'));
    }
    if (cal) {
        cal.querySelectorAll('.nuevo-registro-animacion').forEach(el => el.classList.remove('nuevo-registro-animacion'));
    }
    const btnFiltro = $('btn-filtro');
    const saliente = _vistaHistoricoCalendario ? lista : cal;
    const entrante = _vistaHistoricoCalendario ? cal : lista;
    _animarMutacion([saliente, entrante], () => {
        if (saliente) { saliente.classList.add('hidden'); }
        if (entrante) { entrante.classList.remove('hidden'); }

        if (btnFiltro) btnFiltro.disabled = false;
        if (_vistaHistoricoCalendario) _renderizarCalendario();
    });

    const selector = $('calendario-selector-meses');
    const grid = $('calendario-grid');
    const navBotones = $('calendario-nav-botones');
    if (selector && !selector.classList.contains('hidden') && selector.style.display !== 'none') {
        selector.style.display = 'none';
        if (grid) grid.style.display = 'grid';
        if (navBotones) navBotones.style.display = 'flex';
    }
}

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
    const compensadoLineaHtml = est.fechaCompensado
        ? html`<span class="cal-popup-badge cal-popup-badge--purple">→ ${TiempoUtils.fechaCorta(est.fechaCompensado)}</span>`
        : '';
    return html`<div class="cal-popup-info${diffClase ? ' ' + diffClase : ''}">${totalConDiff}</div>
        ${cubiertoLineaHtml}
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
        GestionDatos.editarRegistro(reg.id);
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
let _ultimoToqueTs = 0;
let _longPressDisparadoTs = 0;

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
            if (puedeVibrar && 'vibrate' in navigator) { try { navigator.vibrate(15); } catch (_) { } }
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
        GestionDatos.editarRegistro(registroId);
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

function _animarCalendario(delta, renderFn) {
    _animarSlideElemento($('calendario-grid'), delta, renderFn);
}

function navegarCalendario(delta) {
    _cerrarPopupCalendario();

    const hoy = new Date();
    const base = _calendarioMes || { anio: hoy.getFullYear(), mes: hoy.getMonth() };
    let nuevoMes = base.mes + delta;
    let nuevoAnio = base.anio;
    if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio++; }
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio--; }
    _calendarioMes = { anio: nuevoAnio, mes: nuevoMes };
    _animarCalendario(delta, () => _renderizarCalendario());
}

function _flashDiaHoyCalendario() {
    const el = document.querySelector('#calendario-grid .calendario-dia.hoy');
    _flashElemento(el, 'campo-flash');
}

function irHoyCalendario() {
    const hoy = new Date();
    if (_calendarioMes === null ||
        (_calendarioMes.anio === hoy.getFullYear() && _calendarioMes.mes === hoy.getMonth())) {
        _flashDiaHoyCalendario();
        return;
    }
    const base = _calendarioMes;
    const delta = (base.anio * 12 + base.mes) > (hoy.getFullYear() * 12 + hoy.getMonth()) ? -1 : 1;
    _calendarioMes = null;
    _animarCalendario(delta, () => _renderizarCalendario());
    setTimeout(_flashDiaHoyCalendario, DUR_CALENDARIO() + 20);
}

// ── Atajo PC: rueda del mouse / trackpad sobre los días (o Alt + rueda sobre el calendario) para cambiar de mes ──
const RUEDA_UMBRAL_PX = 40;          // acumulado mínimo para disparar el cambio
const RUEDA_PAUSA_TRACKPAD_MS = 120; // pausa que cierra una ráfaga de trackpad (inercia)
const RUEDA_COOLDOWN_EXTRA_MS = 60;  // margen sobre la animación de deslizamiento
const RUEDA_LINEA_PX = 33;           // equivalencia de deltaMode "línea" en px

// La opción se lee del almacenamiento una sola vez: el evento de configuración invalida el valor guardado (el handler de la rueda corre en cada ráfaga)
/** @type {boolean | null} */
let _ruedaHabilitada = null;
EventosApp.on('config:rueda-calendario', () => { _ruedaHabilitada = null; });
function _ruedaActiva() {
    _ruedaHabilitada ??= Almacenamiento.getBoolean(STORAGE_KEYS.RUEDA_CALENDARIO, DEFAULTS.RUEDA_CALENDARIO);
    return _ruedaHabilitada;
}

function _registrarRuedaCalendario(grid) {
    const contenedor = grid?.parentNode;
    if (!contenedor || contenedor.dataset.ruedaInit) return;
    contenedor.dataset.ruedaInit = '1';

    let acumulado = 0;
    let bloqueadoHasta = 0;
    let zona = null;          // rect de los días mientras la grilla está oculta por la animación
    let timerReset = null;

    const dentroDeZona = (x, y) => zona && x >= zona.left && x <= zona.right && y >= zona.top && y <= zona.bottom;
    const esPC = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    contenedor.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) return;   // zoom del navegador / atajos
        if (!esPC()) return;
        // Alt + rueda cambia de mes sobre cualquier parte del calendario, aunque la rueda sola esté desactivada en configuración
        const conAlt = e.altKey;
        if (!conAlt && !_ruedaActiva()) return;   // desactivado: la rueda desplaza la página

        const ahora = performance.now();
        const bloqueado = ahora < bloqueadoHasta;
        const animando = grid.offsetParent === null;   // durante el deslizamiento la grilla real está oculta
        const sobreDias = conAlt || ((bloqueado || animando)
            ? dentroDeZona(e.clientX, e.clientY)
            : !!e.target.closest?.('#calendario-grid'));
        if (!sobreDias) return;

        e.preventDefault();   // el scroll de la página queda quieto mientras el cursor está sobre los días (o con Alt, sobre el calendario)

        const factor = e.deltaMode === 1 ? RUEDA_LINEA_PX : e.deltaMode === 2 ? 400 : 1;
        const dx = e.deltaX * factor, dy = e.deltaY * factor;
        const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
        if (!delta) return;

        const esTrackpad = Math.abs(delta) < 50;   // ráfagas de deltas chicos con inercia

        if (bloqueado) {
            // Trackpad: la inercia sigue emitiendo eventos; se extiende el bloqueo hasta que cese
            if (esTrackpad) bloqueadoHasta = Math.max(bloqueadoHasta, ahora + RUEDA_PAUSA_TRACKPAD_MS);
            return;
        }

        // Cambio de sentido: reinicia el acumulado
        if (acumulado && Math.sign(acumulado) !== Math.sign(delta)) acumulado = 0;
        acumulado += delta;
        clearTimeout(timerReset);
        timerReset = setTimeout(() => { acumulado = 0; }, 200);

        if (Math.abs(acumulado) < RUEDA_UMBRAL_PX) return;

        const dir = acumulado > 0 ? 1 : -1;   // hacia abajo / derecha = mes siguiente
        acumulado = 0;
        // Rueda de mouse: sin bloqueo (como los botones, la animación se interrumpe y encadena).
        // Trackpad: se bloquea para absorber la inercia.
        if (!animando) zona = grid.getBoundingClientRect();
        if (esTrackpad) bloqueadoHasta = ahora + DUR_CALENDARIO() + RUEDA_COOLDOWN_EXTRA_MS;
        navegarCalendario(dir);
    }, { passive: false });
}

function bindEventos() {
    $('calendario-titulo-mes')?.addEventListener('click', () => abrirSelectorMesesCalendario());
    document.querySelector('.btn-hoy-calendario')?.addEventListener('click', () => irHoyCalendario());
    const navBotones = $('calendario-nav-botones');
    if (navBotones) {
        const navBtns = navBotones.querySelectorAll('button:not(.btn-hoy-calendario)');
        if (navBtns[0]) navBtns[0].addEventListener('click', () => navegarCalendario(-1));
        if (navBtns[1]) navBtns[1].addEventListener('click', () => navegarCalendario(1));
    }
    _registrarRuedaCalendario($('calendario-grid'));

}

export const Calendario = {
    bindEventos,
    abrirSelectorMesesCalendario,
    _cerrarSelectorMeses,
    _activarVistaCalendarioHistorico,
    _renderizarCalendario,
    animarEntradaInicial,
    toggleVistaHistorico,
    _popupCalendario,
    _popupCalendarioDiaSinRegistro,
    _popupCalendarioHover,
    _onclickCalendarioDia,
    _cerrarPopupCalendarioHover,
    navegarCalendario,
    irHoyCalendario,
    getVistaHistoricoCalendario: () => _vistaHistoricoCalendario,
    setVistaHistoricoCalendario: (v) => { _vistaHistoricoCalendario = v; }
};
