import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { GestorModales } from './gestor-modales.js';
import { UIBase } from './base.js';
import { Configuracion } from './configuracion.js';
import { GestionDatos } from '../services/gestion-datos.js';
import { Compensatorios } from '../services/compensatorios.js';
import { EstadoApp } from '../services/estado-app.js';
import { mostrarToast } from './toast.js';
import { icono } from '../core/html.js';

// ====================================================================
// UI WORKDAY HISTORY MODULE (historial de días hábiles y horas)
// ====================================================================
const { _abrirModalConPadre, _cerrarModalConPadre } = UIBase;

const { _precargarCamposConfig } = Configuracion;

let _tramoEnEdicionDesde = null;

function _formatoFechaHistorial(iso) {
    if (iso === '0001-01-01') return 'Desde siempre';
    return `Desde ${TiempoUtils.fechaCorta(iso)}`;
}

function _obtenerTramosOrdenados() {
    const historial = EstadoApp.historialDiasHabiles();
    return Array.isArray(historial) && historial.length > 0
        ? [...historial].sort((a, b) => a.desde.localeCompare(b.desde))
        : [{ desde: '0001-01-01', dias: EstadoApp.diasHabiles() }];
}

function _renderizarListaHistorialDias() {
    const lista = $('lista-historial-dias');
    if (!lista) return;
    const hoy = TiempoUtils.obtenerFechaHoy();
    const tramos = _obtenerTramosOrdenados();
    const vigenteReal = tramos.filter(t => t.desde <= hoy).slice(-1)[0] || tramos[0];

    lista.innerHTML = '';
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
            innerHTML: String(icono('#icon-edit')),
            title: 'Editar tramo',
            onclick: (e) => { e.stopPropagation(); abrirEditorTramoDias(tramo.desde); }
        });

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
        inputDesde.value = desdeOriginal === '0001-01-01' ? '' : desdeOriginal;
        inputDesde.disabled = (desdeOriginal === '0001-01-01');
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

    const esSentinela = _tramoEnEdicionDesde === '0001-01-01';
    const inputDesde = $('editar-tramo-desde');
    const nuevaFecha = esSentinela ? '0001-01-01' : (inputDesde?.value || '');
    const checkboxes = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="dia-habil-tramo"]:checked'));
    const nuevosDias = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => a - b);

    if (!esSentinela && !TiempoUtils.validarFecha(nuevaFecha)) {
        mostrarToast('Ingresá una fecha válida', 'error'); return;
    }
    if (nuevosDias.length === 0) {
        mostrarToast('Seleccioná al menos un día', 'error'); return;
    }

    const tramos = _obtenerTramosOrdenados();
    const otros = tramos.filter(t => t.desde !== _tramoEnEdicionDesde);
    if (otros.some(t => t.desde === nuevaFecha)) {
        mostrarToast('Ya existe un tramo con esa fecha', 'error'); return;
    }

    const nuevoHistorial = Compensatorios.sanitizarHistorialDiasHabiles([...otros, { desde: nuevaFecha, dias: nuevosDias }]);
    GestionDatos.setHistorialDiasHabiles(nuevoHistorial || [{ desde: '0001-01-01', dias: nuevosDias }]);

    const guardado = await EstadoApp.guardarYActualizar();
    if (!guardado) return;

    mostrarToast('Tramo actualizado', 'success');
    cerrarEditorTramoDias();
}

async function eliminarTramoDias() {
    if (!_tramoEnEdicionDesde) return;
    const tramos = _obtenerTramosOrdenados();
    if (tramos.length <= 1) return;
    if (tramos[0].desde === _tramoEnEdicionDesde) return;
    if (!await GestorModales.confirmar('¿Eliminar este tramo del historial? Los registros afectados pasarán a regirse por el tramo anterior.', 'Eliminar')) return;

    const restantes = tramos.filter(t => t.desde !== _tramoEnEdicionDesde);
    const nuevoHistorial = Compensatorios.sanitizarHistorialDiasHabiles(restantes);
    GestionDatos.setHistorialDiasHabiles(nuevoHistorial || [{ desde: '0001-01-01', dias: EstadoApp.diasHabiles() }]);

    const guardado = await EstadoApp.guardarYActualizar();
    if (!guardado) return;

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
