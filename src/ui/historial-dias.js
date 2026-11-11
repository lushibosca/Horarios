import { DESDE_SIEMPRE } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { GestorModales } from './gestor-modales.js';
import { UIBase } from './base.js';
import { Configuracion } from './configuracion.js';
import { mostrarToast } from './toast.js';
import { icono, montar } from '../core/html.js';
import { DiasHabiles } from '../services/dias-habiles.js';

// ====================================================================
// UI WORKDAY HISTORY MODULE (historial de días hábiles y horas)
// ====================================================================
const { _abrirModalConPadre, _cerrarModalConPadre } = UIBase;

const { _precargarCamposConfig } = Configuracion;

let _tramoEnEdicionDesde = null;

function _formatoFechaHistorial(iso) {
    if (iso === DESDE_SIEMPRE) return 'Desde siempre';
    return `Desde ${TiempoUtils.fechaCorta(iso)}`;
}

const _obtenerTramosOrdenados = () => DiasHabiles.tramosDiasHabiles();

function _renderizarListaHistorialDias() {
    const lista = $('lista-historial-dias');
    if (!lista) return;
    const hoy = TiempoUtils.obtenerFechaHoy();
    const tramos = _obtenerTramosOrdenados();
    const vigenteReal = tramos.filter(t => t.desde <= hoy).slice(-1)[0] || tramos[0];

    lista.replaceChildren();
    [...tramos].reverse().forEach(tramo => {
        const esActual = tramo === vigenteReal;

        const container = Object.assign(document.createElement('div'), {
            className: `btn-perfil-select${esActual ? ' activo' : ''}`
        });

        const diasTexto = [...tramo.dias].sort((a, b) => a - b).map(d => TiempoUtils.nombreDiaPorIndice(d)).join(', ');
        const infoSection = Object.assign(document.createElement('div'), { className: 'btn-perfil-info' });
        infoSection.appendChild(Object.assign(document.createElement('div'), {
            className: 'btn-perfil-nombre',
            textContent: `${_formatoFechaHistorial(tramo.desde)}${esActual ? ' (actual)' : ''}`
        }));
        infoSection.appendChild(Object.assign(document.createElement('div'), {
            className: 'btn-perfil-detalle',
            textContent: diasTexto
        }));

        const editBtn = Object.assign(document.createElement('button'), {
            className: 'btn-perfil-edit',
            title: 'Editar tramo',
            onclick: (e) => { e.stopPropagation(); abrirEditorTramoDias(tramo.desde); }
        });
        montar(editBtn, icono('#icon-edit'));

        container.appendChild(infoSection);
        container.appendChild(editBtn);
        lista.appendChild(container);
    });
}

function abrirModalHistorialDias() {
    _abrirModalConPadre('modal-historial-dias', _renderizarListaHistorialDias);
}

function cerrarModalHistorialDias() {
    _cerrarModalConPadre('modal-historial-dias', (padre) => {
        if (padre === 'modal-config') _precargarCamposConfig();
    });
}

function abrirEditorTramoDias(desdeOriginal) {
    const tramos = _obtenerTramosOrdenados();
    const tramo = tramos.find(t => t.desde === desdeOriginal);
    if (!tramo) { mostrarToast('Tramo no encontrado', 'error'); return; }

    _tramoEnEdicionDesde = desdeOriginal;

    const inputDesde = $('editar-tramo-desde');
    if (inputDesde) {
        inputDesde.value = desdeOriginal === DESDE_SIEMPRE ? '' : desdeOriginal;
        inputDesde.disabled = (desdeOriginal === DESDE_SIEMPRE);
    }

    /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil-tramo"]')).forEach(cb => {
        cb.checked = tramo.dias.includes(parseInt(cb.value));
    });

    const btnEliminar = $('btn-eliminar-tramo-dias');
    if (btnEliminar) btnEliminar.disabled = (tramos.length <= 1 || tramos[0].desde === desdeOriginal);

    GestorModales.alternar('modal-historial-dias', 'modal-editar-tramo-dias');
}

function cerrarEditorTramoDias() {
    _tramoEnEdicionDesde = null;
    GestorModales.alternar('modal-editar-tramo-dias', 'modal-historial-dias', null, _renderizarListaHistorialDias);
}

async function guardarEdicionTramoDias() {
    if (!_tramoEnEdicionDesde) return;

    const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil-tramo"]:checked'));
    const nuevosDias = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const res = await DiasHabiles.editarTramoDias(_tramoEnEdicionDesde, $('editar-tramo-desde')?.value, nuevosDias);
    if ('error' in res) { mostrarToast(res.error, 'error'); return; }
    if (!res.ok) return;

    mostrarToast('Tramo actualizado', 'success');
    cerrarEditorTramoDias();
}

async function eliminarTramoDias() {
    if (!_tramoEnEdicionDesde) return;
    const tramos = _obtenerTramosOrdenados();
    if (tramos.length <= 1 || tramos[0].desde === _tramoEnEdicionDesde) return;   // el botón ya está deshabilitado
    if (!await GestorModales.confirmar('¿Eliminar este tramo del historial? Los registros afectados pasarán a regirse por el tramo anterior.', 'Eliminar')) return;

    const res = await DiasHabiles.eliminarTramoDias(_tramoEnEdicionDesde);
    if ('error' in res) { mostrarToast(res.error, 'error'); return; }
    if (!res.ok) return;

    mostrarToast('Tramo eliminado', 'success');
    cerrarEditorTramoDias();
}

function bindEventos() {
    $('btn-historial-dias-habiles')?.addEventListener('click', () => abrirModalHistorialDias());
    document.querySelector('#modal-historial-dias .btn-cancel')?.addEventListener('click', () => cerrarModalHistorialDias());
    document.querySelector('#modal-editar-tramo-dias .btn-edit')?.addEventListener('click', () => guardarEdicionTramoDias());
    $('btn-eliminar-tramo-dias')?.addEventListener('click', () => eliminarTramoDias());
    document.querySelector('#modal-editar-tramo-dias .btn-cancel')?.addEventListener('click', () => cerrarEditorTramoDias());
}

export const HistorialDias = {
    cerrarModalHistorialDias, cerrarEditorTramoDias, bindEventos
};
