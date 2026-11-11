import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { UIBase } from './base.js';
import { Animaciones } from './animaciones.js';
import { mostrarToast } from './toast.js';
import { FeriadosAR } from '../services/feriados-ar.js';

// ====================================================================
// UI VERIFICAR FERIADOS (Ajustes → Jornada laboral)
// ====================================================================
const { _abrirModalConPadre, _cerrarModalConPadre } = UIBase;

const ID_LISTA = 'lista-verificar-feriados';

/** @param {string} id */
const _marcado = id => /** @type {HTMLInputElement | null} */ ($(id))?.checked ?? false;

function _crear(tag, props = {}) {
    return Object.assign(document.createElement(tag), props);
}

/** @param {import('../services/feriados-ar.js').ItemFeriado} item */
function _detalle(item) {
    if (item.estado === 'agregar') return 'Se agrega como Feriado';
    if (item.estado === 'actualizar') return item.actual ? `Descripción actual: «${item.actual}»` : 'Se completa la descripción';
    return `Ese día ya hay: ${item.actual}`;
}

/** @param {import('../services/feriados-ar.js').ItemFeriado} item */
function _crearFila(item) {
    const esConflicto = item.estado === 'conflicto';
    const fila = _crear(esConflicto ? 'div' : 'label', { className: 'btn-perfil-select feriado-fila' });
    fila.dataset.fecha = item.fecha;
    fila.dataset.estado = item.estado;

    const info = _crear('div', { className: 'btn-perfil-info' });
    info.appendChild(_crear('div', {
        className: 'btn-perfil-nombre feriado-fila-nombre',
        textContent: `${TiempoUtils.obtenerNombreDia(item.fecha).slice(0, 3)} ${TiempoUtils.fechaCorta(item.fecha)} · ${item.nombre}`
    }));
    info.appendChild(_crear('div', { className: 'btn-perfil-detalle', textContent: _detalle(item) }));
    fila.appendChild(info);

    if (esConflicto) {
        const select = _crear('select', { className: 'feriado-fila-accion', title: 'Qué hacer con ese día' });
        select.setAttribute('aria-label', `Qué hacer el ${TiempoUtils.fechaCorta(item.fecha)}`);
        select.appendChild(_crear('option', { value: 'dejar', textContent: 'Dejar como está' }));
        select.appendChild(_crear('option', { value: 'reemplazar', textContent: 'Reemplazar por Feriado' }));
        fila.appendChild(select);
    } else {
        fila.appendChild(_crear('input', { type: 'checkbox', checked: true, className: 'feriado-fila-check' }));
    }
    return fila;
}

/** Lo elegido en la lista: agregar/actualizar con la casilla marcada y conflictos con "Reemplazar" */
function _leerSelecciones() {
    /** @type {{ fecha: string, reemplazar?: boolean }[]} */
    const selecciones = [];
    document.querySelectorAll(`#${ID_LISTA} .feriado-fila`).forEach(el => {
        const fila = /** @type {HTMLElement} */ (el);
        const fecha = fila.dataset.fecha ?? '';
        if (fila.dataset.estado === 'conflicto') {
            if (/** @type {HTMLSelectElement} */ (fila.querySelector('select')).value === 'reemplazar') selecciones.push({ fecha, reemplazar: true });
        } else if (/** @type {HTMLInputElement} */ (fila.querySelector('input')).checked) {
            selecciones.push({ fecha });
        }
    });
    return selecciones;
}

function _actualizarBoton() {
    const n = _leerSelecciones().length;
    const btn = /** @type {HTMLButtonElement | null} */ ($('btn-aplicar-feriados'));
    if (btn) btn.disabled = n === 0;
    const texto = $('btn-aplicar-feriados-texto');
    if (texto) texto.textContent = n > 0 ? `Aplicar (${n})` : 'Aplicar';
}

function _renderizar() {
    const lista = $(ID_LISTA);
    if (!lista) return;
    const items = FeriadosAR.analizar({ anteriores: _marcado('verif-feriados-anteriores'), proximos: _marcado('verif-feriados-proximos') });
    lista.replaceChildren();

    const cuenta = estado => items.filter(i => i.estado === estado).length;
    const resumen = $('verif-feriados-resumen');
    if (resumen) {
        resumen.textContent = items.length === 0
            ? '¡Todo al día! No hay feriados para agregar ni actualizar.'
            : /** @type {[number, string][]} */ ([[cuenta('agregar'), 'por agregar'], [cuenta('actualizar'), 'por completar'], [cuenta('conflicto'), 'con otro registro']])
                .filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`).join(' · ');
    }
    lista.classList.toggle('hidden', items.length === 0);
    items.forEach(item => lista.appendChild(_crearFila(item)));
    _actualizarBoton();
}

function abrirModalVerificarFeriados() {
    _abrirModalConPadre('modal-verificar-feriados', _renderizar);
}

function cerrarModalVerificarFeriados() {
    _cerrarModalConPadre('modal-verificar-feriados');
}

async function aplicar() {
    const selecciones = _leerSelecciones();
    if (!selecciones.length) return;
    const res = await FeriadosAR.aplicar(selecciones);
    if ('error' in res) return;   // el aviso ya está dado
    const { agregados = 0, actualizados = 0, reemplazados = 0 } = res;
    const partes = [
        agregados && `${agregados} agregado${TiempoUtils.pluralizar(agregados)}`,
        actualizados && `${actualizados} actualizado${TiempoUtils.pluralizar(actualizados)}`,
        reemplazados && `${reemplazados} reemplazado${TiempoUtils.pluralizar(reemplazados)}`,
    ].filter(Boolean);
    mostrarToast(`Feriados: ${partes.join(', ')}`, 'success');
    cerrarModalVerificarFeriados();
}

function bindEventos() {
    $('btn-verificar-feriados')?.addEventListener('click', () => abrirModalVerificarFeriados());
    document.querySelector('#modal-verificar-feriados .btn-cancel')?.addEventListener('click', () => cerrarModalVerificarFeriados());
    $('btn-aplicar-feriados')?.addEventListener('click', () => aplicar());
    // la lista cambia de largo con las opciones: el modal acompaña el cambio de alto con una transición (no salta)
    const renderizarAnimado = () => Animaciones._animarAlturaCambio(document.querySelector('#modal-verificar-feriados .modal-content'), _renderizar);
    $('verif-feriados-anteriores')?.addEventListener('change', renderizarAnimado);
    $('verif-feriados-proximos')?.addEventListener('change', renderizarAnimado);
    $(ID_LISTA)?.addEventListener('change', _actualizarBoton);
}

export const VerificarFeriados = { cerrarModalVerificarFeriados, bindEventos };
