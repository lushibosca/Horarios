import { EventosApp } from '../core/eventos.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { EstadoApp } from './estado-app.js';
import { TiposRegistro } from './tipos-registro.js';

// ====================================================================
// FILTROS DE LA LISTA DE REGISTROS
// ====================================================================
function limpiarFiltros() {
    EstadoApp.setFiltroState({ activo: false, desde: null, hasta: null, tipo: null });
    EstadoApp.guardarYActualizar();
    const notify = EstadoApp._notify();
    notify.cerrarFiltros();
    notify.mostrarToast('Filtro eliminado', 'info');
    EventosApp.emit('filtros:cambio', { activo: false });
}

/** Valores crudos del popup de filtros: lo que no es una fecha válida o un tipo conocido se ignora (como si estuviera vacío). */
function aplicarFiltrosInmediato(desdeCrudo, hastaCrudo, tipoCrudo) {
    const fechaOVacio = (v) => (typeof v === 'string' && TiempoUtils.validarFecha(v)) ? v : '';
    const desde = fechaOVacio(desdeCrudo);
    const hasta = fechaOVacio(hastaCrudo);
    const tipo = (tipoCrudo === 'normal' || TiposRegistro.validarTipoPermitido(tipoCrudo)) ? tipoCrudo : '';
    if (!desde && !hasta && !tipo) {
        EstadoApp.setFiltroState({ activo: false, desde: null, hasta: null, tipo: null });
        EventosApp.emit('filtros:cambio', { activo: false });
    } else {
        EstadoApp.setFiltroState({ activo: true, desde: desde || null, hasta: hasta || null, tipo: tipo || null });
        EventosApp.emit('filtros:cambio', { activo: true });
    }
    EstadoApp.guardarYActualizar();
}

function obtenerRegistrosFiltrados() {
    const { filtroActivo, filtroDesde, filtroHasta, filtroTipo } = EstadoApp.getFiltroState();
    const registros = EstadoApp.registros();
    if (!filtroActivo) return registros;
    return registros.filter(r => {
        if (filtroDesde && r.fecha < filtroDesde) return false;
        if (filtroHasta && r.fecha > filtroHasta) return false;
        if (filtroTipo) {
            const tipoRegistro = TiposRegistro.obtenerTipoPorCodigo(r.entrada, r.salida);
            if (filtroTipo === 'normal') { if (tipoRegistro) return false; }
            else { if (!tipoRegistro || tipoRegistro.id !== filtroTipo) return false; }
        }
        return true;
    });
}

export const Filtros = { limpiarFiltros, aplicarFiltrosInmediato, obtenerRegistrosFiltrados };
