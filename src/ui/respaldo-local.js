import { $, setColapsable } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { GestorModales } from './gestor-modales.js';
import { UIBase } from './base.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp } from '../services/estado-app.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { setIconoBtn } from './boton-fichar.js';
import { mostrarToast } from './toast.js';

// ====================================================================
//                     UI LOCAL BACKUP MODULE (Import / Export JSON)
// ====================================================================
const ESPERA_MODAL_MS = 50;   // deja abrir el modal antes de lanzar el selector de archivos

const { descargarJSON, obtenerNombrePerfilSafe } = UIBase;

let _modalAbiertoDesdeLista = false;

function _actualizarBotonVolver(id, desdeLista) {
    const btn = $(id);
    if (!btn) return;
    if (btn.lastChild) btn.lastChild.textContent = desdeLista ? ' Cerrar' : ' Volver';
    setIconoBtn(btn, desdeLista ? '#icon-cancelar' : '#icon-undo');
}

function _abrirModalConfigHija(modalId, desdeLista, callback) {
    _modalAbiertoDesdeLista = desdeLista;
    if (desdeLista) GestorModales.abrir(modalId, callback);
    else GestorModales.alternar('modal-config', modalId, null, callback);
}

function _cerrarModalConfigHija(modalId) {
    if (_modalAbiertoDesdeLista) {
        _modalAbiertoDesdeLista = false;
        GestorModales.cerrar(modalId);
        return;
    }
    GestorModales.alternar(modalId, 'modal-config');
}

function mostrarImportar(desdeLista = false) {
    _abrirModalConfigHija('modal-importar', desdeLista, () => {
        $('file-import').value = '';

        const nombreEl = $('nombre-archivo-seleccionado');
        if (nombreEl) {
            nombreEl.classList.add('hidden');
            nombreEl.textContent = '';
        }

        const btnCombinar = $('btn-combinar');
        const btnReemplazar = $('btn-reemplazar');

        if (btnCombinar) {
            btnCombinar.disabled = true;
        }
        if (btnReemplazar) {
            btnReemplazar.disabled = true;
        }

        _actualizarBotonVolver('btn-volver-importar', desdeLista);
        setTimeout(() => $('file-import').click(), ESPERA_MODAL_MS);
    });
}

function cerrarImportar() {
    $('file-import').value = '';
    _cerrarModalConfigHija('modal-importar');
}

function mostrarExportar(desdeLista = false) {
    _abrirModalConfigHija('modal-exportar', desdeLista, () => {
        const tipoSelect = $('tipo-exportacion');
        if (tipoSelect) tipoSelect.value = 'todo';

        setColapsable($('campos-rango-exportar'), false, { animar: false });

        $('export-fecha-desde').value = '';
        $('export-fecha-hasta').value = '';

        _actualizarBotonVolver('btn-volver-exportar', desdeLista);
    });
}

function cerrarExportar() {
    _cerrarModalConfigHija('modal-exportar');
}

function toggleCamposRangoExport() {
    const tipo = $('tipo-exportacion').value;
    setColapsable($('campos-rango-exportar'), tipo === 'rango');
}

async function ejecutarExportacion() {
    const tipo = $('tipo-exportacion').value;
    const btn = /** @type {HTMLButtonElement} */ (document.querySelector('#modal-exportar .btn-export'));

    btn.disabled = true;

    try {
        if (tipo === 'todo') {
            ImportarExportar.exportarJSON();
            cerrarExportar();

        } else if (tipo === 'mes-actual') {
            const mesActual = TiempoUtils.claveMes(TiempoUtils.obtenerFechaHoy());
            await exportarRango(mesActual, mesActual, true);

        } else if (tipo === 'rango') {
            const desde = S.limpiarTexto($('export-fecha-desde').value, 10);
            const hasta = S.limpiarTexto($('export-fecha-hasta').value, 10);

            if (!desde || !hasta) {
                mostrarToast('Completá ambas fechas', 'error');
                btn.disabled = false;
                return;
            }

            if (!TiempoUtils.validarFecha(desde) || !TiempoUtils.validarFecha(hasta)) {
                mostrarToast('Fechas inválidas', 'error');
                btn.disabled = false;
                return;
            }

            if (desde > hasta) {
                mostrarToast('La fecha inicial debe ser anterior a la final', 'error');
                btn.disabled = false;
                return;
            }

            await exportarRango(desde, hasta, false);
        }

    } catch (error) {
        console.error('Error en exportación:', error);
        mostrarToast('Error al exportar', 'error');
    } finally {
        btn.disabled = false;
    }
}

function _filtrarRegistrosRango(desde, hasta, esMes) {
    if (esMes) {
        const [año, mes] = desde.split('-').map(Number);
        return EstadoApp.registros().filter(r => {
            const [aReg, mReg] = r.fecha.split('-').map(Number);
            return aReg === año && mReg === mes;
        });
    }
    return EstadoApp.registros().filter(r => r.fecha >= desde && r.fecha <= hasta);
}

async function exportarRango(desde, hasta, esMes = false) {
    const registrosFiltrados = _filtrarRegistrosRango(desde, hasta, esMes);
    if (registrosFiltrados.length === 0) { mostrarToast('No hay registros en ese rango', 'warning'); return; }

    const fechaLocal = TiempoUtils.fechaLocalISOFull();
    const fechaHoy = fechaLocal.substring(0, 10);

    const data = await ImportarExportar.armarRespaldo(registrosFiltrados, {
        rangoExportado: S.limpiarTexto(esMes ? `Mes ${desde}` : `${desde} a ${hasta}`, 100)
    });

    try {
        const sufijo = esMes ? `_${desde}` : `_${desde}_${hasta}`;
        descargarJSON(data, `Horarios_${obtenerNombrePerfilSafe()}${sufijo}_${fechaHoy}.json`);
        mostrarToast(`Exportados ${registrosFiltrados.length} registros${esMes ? ' del mes' : ''}`, 'success');
        cerrarExportar();
    } catch (e) {
        console.error(e);
        mostrarToast('Error al exportar', 'error');
    }
}


export const RespaldoLocal = {
    mostrarImportar,
    cerrarImportar,
    mostrarExportar,
    cerrarExportar,
    ejecutarExportacion,
    toggleCamposRangoExport
};
