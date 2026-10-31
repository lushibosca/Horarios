import { Reportes } from './reportes.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { TiposRegistro } from '../services/tipos-registro.js';
import { EstadisticasPeriodo } from '../services/estadisticas-periodo.js';
import { UIBase } from './base.js';
import { Configuracion } from './configuracion.js';
import { html, icono } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { registrarSwipe } from './gestos.js';
import { _crearPopupFlotante } from './popups.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
//                     UI STATISTICS MODULE
// ====================================================================
const { _poblarSelect, toggleSeccionGen } = UIBase;
const { _animarSlideElemento, _animarFadeSwap } = Animaciones;

let modoEstadisticas = 'mensual';
let _ultimosStatsRenderizados = null;

const { calcularEstadisticasMes, calcularEstadisticasAnio, calcularEstadisticasSemana } = EstadisticasPeriodo;


function _renderizarStats(stats, opciones = {}) {
    const { mostrarBtnReporte = true } = opciones;

    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('stat-entrada-promedio', stats.entradaPromedio);
    set('stat-salida-promedio', stats.salidaPromedio);
    set('stat-tiempo-fuera-total', stats.tiempoFueraTotal);
    set('stat-tiempo-total', stats.tiempoTotal);

    const toggleStatItem = (id, value) => {
        const el = $(id); if (!el) return;
        const si = /** @type {HTMLElement} */ (el.closest('.stat-item'));
        if (si) { if (value === 0) { si.style.display = 'none'; } else { si.style.display = ''; el.textContent = value; } }
    };
    toggleStatItem('stat-dias-trabajados', stats.diasTrabajados);

    TiposRegistro.obtenerTodosLosTipos().forEach(t => {
        const clave = TiposRegistro.claveStat(t);
        toggleStatItem(`stat-${clave}`, stats[clave] || 0);
    });

    toggleStatItem('stat-compensaciones', stats.compensaciones);

    const elProm = $('stat-promedio-diario');
    if (elProm) elProm.textContent = stats.promedioDiario || '--:--';

    const elRegEnt = $('stat-regularidad-entrada');
    if (elRegEnt) elRegEnt.textContent = stats.regularidadEntrada || '--:--';
    const elRegJor = $('stat-regularidad-jornada');
    if (elRegJor) elRegJor.textContent = stats.regularidadJornada || '--:--';

    const btnReporte = $('btn-reporte');
    if (btnReporte) {
        btnReporte.disabled = !mostrarBtnReporte;
    }
    const elSaldo = $('stat-saldo');
    const itemSaldo = $('stat-item-saldo');
    if (elSaldo && itemSaldo) {
        if (stats.bufferPeriodo === null) {
            itemSaldo.style.display = 'none';
        } else {
            itemSaldo.style.display = '';
            const b = stats.bufferPeriodo;
            elSaldo.textContent = b === 0 ? '0h' : TiempoUtils.horasATexto(b, 'short');
            elSaldo.classList.remove('saldo-positivo', 'saldo-negativo', 'saldo-neutro');
            elSaldo.classList.add(b > 0 ? 'saldo-positivo' : b < 0 ? 'saldo-negativo' : 'saldo-neutro');
        }
    }

    _ultimosStatsRenderizados = stats;
}

/** @param {any} [mesAnio] */
function actualizarEstadisticas(mesAnio = null) {
    const selectMes = $('select-mes-stats');
    if (!mesAnio && selectMes) mesAnio = selectMes.value;
    if (mesAnio && selectMes) {
        const [año, mes] = mesAnio.split('-').map(Number);
        const tieneRegs = EstadoApp.registros().some(r => { const [a, m] = r.fecha.split('-').map(Number); return a === año && m === mes; });
        if (!tieneRegs) {
            mesAnio = TiempoUtils.formatearFechaLocal(new Date()).slice(0, 7);
            if (selectMes) selectMes.value = mesAnio;
        }
    }
    const stats = calcularEstadisticasMes(mesAnio);
    _renderizarStats(stats, { mostrarBtnReporte: true });
}

function _renderSelectorStats() {
    const anioEl = $('select-anio-stats');
    const mesEl = $('select-mes-stats');
    const semEl = $('select-semana-stats');
    const labelEl = $('label-periodo-toggle');
    if (modoEstadisticas === 'anual') {
        if (anioEl) anioEl.classList.remove('hidden');
        if (mesEl) mesEl.classList.add('hidden');
        if (semEl) semEl.classList.add('hidden');
        if (labelEl) labelEl.textContent = 'Anual';
        poblarSelectorAnios();
    } else if (modoEstadisticas === 'semanal') {
        if (anioEl) anioEl.classList.add('hidden');
        if (mesEl) mesEl.classList.add('hidden');
        if (semEl) semEl.classList.remove('hidden');
        if (labelEl) labelEl.textContent = 'Semanal';
        poblarSelectorSemanas();
        actualizarEstadisticasSemana(semEl?.value);
    } else {
        if (anioEl) anioEl.classList.add('hidden');
        if (mesEl) mesEl.classList.remove('hidden');
        if (semEl) semEl.classList.add('hidden');
        if (labelEl) labelEl.textContent = 'Mensual';
        poblarSelectorMeses();
    }
}

function poblarSelectorAnios() {
    const anios = [...new Set(EstadoApp.registros().map(r => r.fecha.substring(0, 4)))].sort().reverse();
    const anioActual = String(new Date().getFullYear());
    _poblarSelect('select-anio-stats', anios, a => a, anioActual, actualizarEstadisticasAnio);
}

function actualizarEstadisticasAnio(anio) {
    const stats = calcularEstadisticasAnio(anio);
    _renderizarStats(stats, { mostrarBtnReporte: true });
}

function _obtenerSemanas() {
    const semanas = new Map();
    EstadoApp.registros().forEach(r => {
        const d = new Date(r.fecha + 'T00:00:00');
        const lunes = TiempoUtils.obtenerLunes(d);
        const key = TiempoUtils.formatearFechaLocal(lunes);
        if (!semanas.has(key)) semanas.set(key, lunes);
    });
    return Array.from(semanas.keys()).sort().reverse();
}

function poblarSelectorSemanas() {
    const semanas = _obtenerSemanas();
    const lunesISO = TiempoUtils.formatearFechaLocal(TiempoUtils.obtenerLunes());
    _poblarSelect('select-semana-stats', semanas, TiempoUtils.formatearRangoSemana, lunesISO, actualizarEstadisticasSemana, TiempoUtils.agruparMesesPorAnio);
}

function actualizarEstadisticasSemana(lunesISO) {
    const stats = calcularEstadisticasSemana(lunesISO);
    _renderizarStats(stats, { mostrarBtnReporte: false });
}

function _animarCambioStats(fn) {
    const grid = document.querySelector('.stats-grid');
    _animarFadeSwap(grid, fn);
}

function _cambiarPeriodoStats(selectId, actualizarFn) {
    const v = $(selectId)?.value;
    if (v !== undefined) _animarCambioStats(() => actualizarFn(v));
}
function cambiarMesStats() { _cambiarPeriodoStats('select-mes-stats', actualizarEstadisticas); }
function cambiarSemanaStats() { _cambiarPeriodoStats('select-semana-stats', actualizarEstadisticasSemana); }
function cambiarAnioStats() { _cambiarPeriodoStats('select-anio-stats', actualizarEstadisticasAnio); }

function togglePeriodoStats(direccion = 1) {
    if (_popupStatEl) {
        const el = _popupStatEl;
        _popupStatEl = null;
        if (el._cerrar) el._cerrar();
        else el.remove();
    }
    const selectMes = $('select-mes-stats');
    const selectAnio = $('select-anio-stats');
    const label = $('label-periodo-toggle');
    const selectSemana = $('select-semana-stats');

    const orden = ['mensual', 'anual', 'semanal'];
    const idx = orden.indexOf(modoEstadisticas);
    modoEstadisticas = orden[(idx + direccion + orden.length) % orden.length];
    Almacenamiento.setItem(STORAGE_KEYS.MODO_ESTADISTICAS, modoEstadisticas);

    _animarSlideElemento($('stats-inner'), direccion, () => {
        selectMes.classList.add('hidden');
        selectAnio.classList.add('hidden');
        if (selectSemana) selectSemana.classList.add('hidden');
        if (modoEstadisticas === 'anual') {
            selectAnio.classList.remove('hidden');
            if (label) label.textContent = 'Anual';
            poblarSelectorAnios();
        } else if (modoEstadisticas === 'semanal') {
            if (selectSemana) selectSemana.classList.remove('hidden');
            if (label) label.textContent = 'Semanal';
            poblarSelectorSemanas();
        } else {
            selectMes.classList.remove('hidden');
            if (label) label.textContent = 'Mensual';
            poblarSelectorMeses();
        }
    });
}

function poblarSelectorMeses() {
    const meses = [...new Set(EstadoApp.registros().map(r => r.fecha.substring(0, 7)))].sort().reverse();
    const mesActual = TiempoUtils.formatearFechaLocal(new Date()).slice(0, 7);
    _poblarSelect('select-mes-stats', meses, TiempoUtils.nombreMesCapitalizado, mesActual, actualizarEstadisticas, TiempoUtils.agruparMesesPorAnio);
}

const {
    abrirModalReporteSecciones, cerrarModalReporteSecciones, toggleSeccionReporte, confirmarGenerarReporte
} = Reportes;
const DESCRIPCIONES_STATS = {
    'stat-tiempo-total': { titulo: 'Tiempo Total', desc: 'Suma de todas las horas trabajadas en el período seleccionado.' },
    'stat-promedio-diario': { titulo: 'Promedio Diario', desc: 'Promedio de horas trabajadas por jornada en el período.' },
    'stat-entrada-promedio': { titulo: 'Entrada Promedio', desc: 'Hora de entrada promedio entre todas las jornadas del período.' },
    'stat-salida-promedio': { titulo: 'Salida Promedio', desc: 'Hora de salida promedio entre todas las jornadas del período.' },
    'stat-regularidad-entrada': { titulo: 'Entrada Regular', desc: 'Qué tan constante es tu hora de entrada. Muestra la desviación promedio respecto al horario habitual: hasta 20m es Alta, hasta 40m Media, y más de 40m Baja.' },
    'stat-regularidad-jornada': { titulo: 'Jornada Regular', desc: 'Qué tan constante es la duración de tu jornada. Muestra la desviación promedio respecto a la duración habitual: hasta 20m es Alta, hasta 40m Media, y más de 40m Baja.' },
    'stat-tiempo-fuera-total': { titulo: 'Tiempo Fuera', desc: 'Suma de los tiempos fuera (salidas del establecimiento, almuerzo, etc.) registrados en las jornadas del período.' },
    'stat-saldo': { titulo: 'Banco de horas', desc: 'Diferencia entre las horas trabajadas y las horas objetivo del período seleccionado, incluyendo compensatorios.' },
    'stat-dias-trabajados': { titulo: 'Jornadas', desc: 'Cantidad de registros con entradas y salidas regulares en el período.' },
    'stat-compensaciones': { titulo: 'Salidas Tempranas', desc: 'Cantidad de jornadas en las que se registró un crédito por salida anticipada o asueto dentro del registro en curso.' },
};

const AJUSTE_POR_STAT = {
    'stat-dias-trabajados': 'config-row-dias-habiles',
    'stat-tiempo-fuera-total': 'btn-toggle-ignorar-tf',
    'stat-promedio-diario': 'config-row-horas-diarias',
};

let _popupStatEl = null;

function _popupStat(event, statId) {
    event.stopPropagation();
    if (_popupStatEl) {
        const el = _popupStatEl;
        _popupStatEl = null;
        if (el._cerrar) el._cerrar();
        else el.remove();
    }

    let info = DESCRIPCIONES_STATS[statId];
    const conExtra = (partes) => ({ titulo: info.titulo, desc: html`${info.desc}${partes}` });
    const nota = (texto) => html`<hr class="stat-popup-sep"><strong>${texto}</strong>`;

    if (statId === 'stat-saldo' && info) {
        const partes = [];

        const stats = _ultimosStatsRenderizados;
        if (stats && stats.aprovechamientoSaldo) {
            const { horas: horasUtil, generado: saldoGenerado } = stats.aprovechamientoSaldo;
            partes.push(html`<hr class="stat-popup-sep">`
                , html`<div class="stat-popup-metric"><span>Generado</span><strong>${TiempoUtils.horasATexto(saldoGenerado, 'short')}</strong></div>`
                , html`<div class="stat-popup-metric"><span>Utilizado</span><strong>${TiempoUtils.horasATexto(horasUtil, 'short')}</strong></div>`);
        }

        const modoTexto = modoEstadisticas === 'anual'
            ? 'Se calcula a partir del PRIMER REGISTRO del año.'
            : modoEstadisticas === 'mensual'
                ? 'Se calcula a partir del PRIMER REGISTRO del mes.'
                : modoEstadisticas === 'semanal'
                    ? 'Se calcula a partir del PRIMER DÍA LABORAL de la semana.'
                    : null;
        if (modoTexto) partes.push(nota(modoTexto));

        if (partes.length) info = conExtra(partes);
    }
    if (statId === 'stat-dias-trabajados' && info) {
        const diasTexto = [...EstadoApp.diasHabiles()].sort((a, b) => a - b).map(d => TiempoUtils.nombreDiaPorIndice(d)).join(', ');
        info = conExtra(nota(`Días hábiles: ${diasTexto}.`));
    }
    if (statId === 'stat-tiempo-fuera-total' && info) {
        const ignorarTF = Almacenamiento.getBoolean(STORAGE_KEYS.IGNORAR_TF, false, true);
        info = conExtra(nota(ignorarTF
            ? 'Actualmente NO SE RESTA el tiempo fuera del tiempo total.'
            : 'Actualmente SE RESTA el tiempo fuera del tiempo total.'));
    }
    if (statId === 'stat-promedio-diario' && info) {
        info = conExtra(nota(`Actualmente las horas diarias objetivo son ${EstadoApp.horasDiarias()}h.`));
    }
    if (!info) {
        const valueEl = $(statId);
        const label = valueEl?.closest('.stat-item')?.querySelector('.stat-label');
        const tipoMatch = TiposRegistro.obtenerTodosLosTipos().find(t => statId === `stat-${TiposRegistro.claveStat(t)}`);
        info = {
            titulo: label ? label.textContent : 'Estadística',
            desc: tipoMatch
                ? `Cantidad de jornadas registradas como "${tipoMatch.label}" en el período.`
                : 'Detalle de esta estadística.'
        };
    }

    const ajusteId = AJUSTE_POR_STAT[statId];
    const btnModificarHtml = ajusteId ? html`
        <button class="cal-popup-btn-edit" id="_stat-popup-btn-modificar">
            ${icono('#icon-settings')}
            Modificar
        </button>` : '';

    const { popup, cerrar } = _crearPopupFlotante({
        className: 'stat-popup',
        id: '_stat-popup',
        dataset: { statId },
        html: html`
        <div class="stat-popup-titulo">${info.titulo}</div>
        <div class="stat-popup-desc">${info.desc}</div>
        ${btnModificarHtml}`,
        event,
        selectorTrigger: '.stat-item',
        esMismoTrigger: item => item.dataset.statId === statId,
        alCerrar: (p) => { if (_popupStatEl === p) _popupStatEl = null; }
    });
    _popupStatEl = popup;

    popup.querySelector('#_stat-popup-btn-modificar')?.addEventListener('click', () => {
        cerrar();
        Configuracion.mostrarConfigEnAjuste(ajusteId);
    });
}

function _onclickStatItem(event) {
    const item = event.currentTarget;
    const valueEl = item.querySelector('.stat-value');
    if (!valueEl || !valueEl.id) return;
    if (_popupStatEl && _popupStatEl.dataset.statId === valueEl.id) {
        const el = _popupStatEl;
        _popupStatEl = null;
        if (el._cerrar) el._cerrar();
        else el.remove();
        return;
    }
    item.dataset.statId = valueEl.id;
    _popupStat(event, valueEl.id);
}

function _bindStatItemPopups(container) {
    const root = container || document;
    root.querySelectorAll('.stat-item').forEach(item => {
        if (item._statPopupBound) return;
        item._statPopupBound = true;
        item.addEventListener('click', _onclickStatItem);
    });
}

function toggleStats() {
    toggleSeccionGen('form-stats', 'icon-indicator-stats', STORAGE_KEYS.STATS_EXPANDIDO, () => {
        registrarSwipe($('form-stats'), dir => togglePeriodoStats(dir));
        if (modoEstadisticas === 'anual') {
            poblarSelectorAnios();
        } else if (modoEstadisticas === 'semanal') {
            poblarSelectorSemanas();
        } else {
            poblarSelectorMeses();
        }
    });
}

function bindEventos() {
    document.querySelector('#card-estadisticas .card-header-clickable')?.addEventListener('click', () => toggleStats());
    $('select-mes-stats')?.addEventListener('change', () => cambiarMesStats());
    $('select-anio-stats')?.addEventListener('change', () => cambiarAnioStats());
    $('select-semana-stats')?.addEventListener('change', () => cambiarSemanaStats());
    $('btn-toggle-periodo')?.addEventListener('click', () => togglePeriodoStats());
    $('btn-reporte')?.addEventListener('click', () => abrirModalReporteSecciones(modoEstadisticas));
    $('reporte-secciones-lista')?.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('.btn-seccion-reporte');
        if (btn) toggleSeccionReporte(btn);
    });
    $('btn-confirmar-reporte')?.addEventListener('click', () => confirmarGenerarReporte());
    $('btn-volver-reporte-secciones')?.addEventListener('click', () => cerrarModalReporteSecciones());

}

export const Estadisticas = {
    bindEventos,
    _renderizarStats,
    actualizarEstadisticas,
    _renderSelectorStats,
    poblarSelectorAnios,
    actualizarEstadisticasAnio,
    poblarSelectorSemanas,
    actualizarEstadisticasSemana,
    cambiarMesStats,
    cambiarSemanaStats,
    cambiarAnioStats,
    togglePeriodoStats,
    poblarSelectorMeses,
    _popupStat,
    _onclickStatItem,
    _bindStatItemPopups,
    toggleStats,
    getModoEstadisticas: () => modoEstadisticas,
    setModoEstadisticas: (v) => { modoEstadisticas = v; }
};
