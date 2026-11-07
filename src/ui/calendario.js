import { STORAGE_KEYS, DEFAULTS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Movimiento } from '../core/movimiento.js';
import { EventosApp } from '../core/eventos.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { SaldoSemanal } from '../services/saldo-semanal.js';
import { html, icono, montar } from '../core/html.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { FiltrosYPeriodos } from '../services/filtros-periodos.js';
import { registrarSwipe } from './gestos.js';
import { _crearPopupFlotante } from './popups.js';
import { Animaciones } from './animaciones.js';
import { CalendarioPopups } from './calendario-popups.js';

// ====================================================================
//                     UI CALENDAR MODULE
// ====================================================================
const {
    _animarMutacion, _animarSlideElemento, _flashElemento, DUR_CALENDARIO, _crearFantasmaSiVisible,
    _aArray, _estaColapsado, _durSiAnima
} = Animaciones;

const GUARD_SELECTOR_MESES_MS = 4000;
let _selectorMesesAbiertoEn = 0;

/** True si el selector se abrió hace menos de 4 s (evita que un refresco de UI lo cierre justo después de abrirlo). */
function _selectorMesesProtegido() {
    return Date.now() - _selectorMesesAbiertoEn < GUARD_SELECTOR_MESES_MS;
}

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
    selector.replaceChildren();

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
        montar(titulo, html`${icono('#icon-back')} Volver`);
        selector.style.display = 'grid';
    });
    _selectorMesesAbiertoEn = Date.now();
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

/** Celda de un día del calendario: su clase de estado, resaltado de "hoy" o "nuevo" y los eventos de click/hover si tiene registro. */
function _crearCeldaDia({ fecha, dia, clase, esHoy, reg, esNuevo, conComentario, asignaciones }) {
    const cell = document.createElement('div');
    let clases = `calendario-dia ${clase}`;
    if (esHoy) clases += ' hoy';
    if (clase === 'dia-sin-registro' && !TiempoUtils.esFechaHabil(fecha, Compensatorios.diasHabilesEnFecha(fecha))) clases += ' no-laborable';
    if (esNuevo) {
        clases += ' nuevo-registro-animacion';
        cell.addEventListener('animationend', () => cell.classList.remove('nuevo-registro-animacion'), { once: true });
    }
    if (reg) clases += ' cursor-pointer';
    if (conComentario) clases += ' tiene-comentario';
    cell.className = clases;
    cell.textContent = String(dia);
    cell.dataset.dia = fecha;

    if (reg) {
        cell.dataset.regId = reg.id;
        cell.addEventListener('click', (e) => CalendarioPopups.onclickDia(e, reg.id, asignaciones));
        cell.addEventListener('mouseenter', (e) => CalendarioPopups.hoverDia(e, reg.id, asignaciones));
        cell.addEventListener('mouseleave', (e) => CalendarioPopups.cerrarHoverDia(e));
    } else if (clase === 'dia-sin-registro') {
        cell.classList.add('cursor-pointer');
        cell.dataset.fecha = fecha;
        cell.addEventListener('click', (e) => CalendarioPopups.diaSinRegistro(e, fecha));
    }
    return cell;
}

/** Bandas que marcan en el calendario los días laborables de la semana actual (una por fila de la grilla). */
function _bandasSemanaActual(anio, mes, offsetInicio, diasDelMes) {
    const { inicio: semIni, fin: semFin } = TiempoUtils.obtenerSemanaRangoActual();
    const esLaborable = (f) => TiempoUtils.esFechaHabil(f, Compensatorios.diasHabilesEnFecha(f));
    const fechaDeDia = (d) => TiempoUtils.formatearFechaLocal(new Date(anio, mes, d));
    const fechaStr = (y, m, d) => `${y}-${TiempoUtils._pad2(m + 1)}-${TiempoUtils._pad2(d)}`;
    const segmentosSemana = [];
    for (let d = 1; d <= diasDelMes; d++) {
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
    return segmentosSemana.map(seg => {
        const banda = document.createElement('div');
        banda.className = 'calendario-semana-actual';
        if (seg.desde === 1 && esLaborable(fechaDeDia(seg.diaIni - 1))) banda.classList.add('abierta-izq');
        if (seg.hasta === 7 && esLaborable(fechaDeDia(seg.diaFin + 1))) banda.classList.add('abierta-der');
        banda.setAttribute('aria-hidden', 'true');
        banda.style.gridArea = `${seg.fila} / ${seg.desde} / ${seg.fila + 1} / ${seg.hasta + 1}`;
        return banda;
    });
}

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
    CalendarioPopups.registrarLongPressSemana(grid);

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

        frag.appendChild(_crearCeldaDia({ fecha, dia, clase, esHoy, reg, esNuevo, conComentario: !!reg && notasDelMes.has(reg.id), asignaciones: asignacionesCompensatorio }));
    }

    _bandasSemanaActual(anio, mes, offsetInicio, ultimoDia.getDate()).forEach(banda => frag.appendChild(banda));

    grid.classList.toggle('calendario-filtro-activo', filtroActivo);

    if (idResaltar) {
        const idsAnimados = _aArray(idResaltar).map(String);
        /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll('.calendario-dia[data-reg-id]')).forEach(celdaVieja => {
            if (idsAnimados.includes(celdaVieja.dataset.regId ?? '')) _crearFantasmaSiVisible(celdaVieja);
        });
    }

    grid.replaceChildren();
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
    EventosApp.emit('historico:vista');

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

function _animarCalendario(delta, renderFn) {
    _animarSlideElemento($('calendario-grid'), delta, renderFn);
}

function navegarCalendario(delta) {
    CalendarioPopups.cerrar();

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
    _cerrarSelectorMeses,
    _selectorMesesProtegido,
    _activarVistaCalendarioHistorico,
    _renderizarCalendario,
    animarEntradaInicial,
    toggleVistaHistorico,
    getVistaHistoricoCalendario: () => _vistaHistoricoCalendario,
    setVistaHistoricoCalendario: (v) => { _vistaHistoricoCalendario = v; }
};
