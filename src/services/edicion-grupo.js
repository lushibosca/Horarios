import { MS_DIA, TOAST_MS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { EstadoApp } from './estado-app.js';
import { TiposRegistro } from './tipos-registro.js';
import { Cambios } from './cambios.js';
import { Objetivos } from './objetivos.js';

// ====================================================================
// EDICIÓN DE UN GRUPO DE DÍAS ESPECIALES CONSECUTIVOS
// ====================================================================
function editarGrupo(grupo) {
    if (EstadoApp.getGrupoEnEdicion() !== null) return;
    const grupoEnEdicion = {
        registros: grupo.registros,
        subtipo: grupo.subtipo,
        fechaDesde: grupo.registros[grupo.registros.length - 1].fecha,
        fechaHasta: grupo.registros[0].fecha
    };
    EstadoApp.setGrupoEnEdicion(grupoEnEdicion);
    EventosApp.emit('grupo:editar', { subtipo: grupo.subtipo, desde: grupoEnEdicion.fechaDesde, hasta: grupoEnEdicion.fechaHasta });
    const notify = EstadoApp._notify();
    notify.actualizarHintGrupo();
    notify.setBloqueoEdicionGrupo(true);
    notify.abrirModal('modal-editar-grupo');
}

function _validarRangoGrupo(nuevoTipo, nuevaDesde, nuevaHasta) {
    const errorRango = TiempoUtils.errorRangoFechas(nuevaDesde, nuevaHasta);
    if (errorRango) return errorRango;
    const hoy = new Date();
    const dosPasado = new Date(hoy); dosPasado.setFullYear(hoy.getFullYear() - 2);
    const dosFuturo = new Date(hoy); dosFuturo.setFullYear(hoy.getFullYear() + 2);
    const ini = TiempoUtils.parsearFechaLocal(nuevaDesde), fin = TiempoUtils.parsearFechaLocal(nuevaHasta);
    if (ini < dosPasado || fin > dosFuturo) return 'El rango debe estar entre 2 años atrás y 2 años adelante';
    if (!TiposRegistro.validarTipoPermitido(nuevoTipo)) return 'Tipo de registro inválido';
    const dias = Math.ceil(Math.abs(fin.getTime() - ini.getTime()) / MS_DIA) + 1;
    if (dias > S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION) return `El rango contiene ${dias} días.\n Máximo: ${S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION} días por operación.`;
    return null;
}

/** @param {{ tipo: string, desde: string, hasta: string }} datos valores crudos del formulario de edición de grupo */
async function guardarEdicionGrupo({ tipo, desde, hasta }) {
    const grupoEnEdicion = EstadoApp.getGrupoEnEdicion();
    if (!grupoEnEdicion) return;
    const notify = EstadoApp._notify();
    const nuevoTipo = S.limpiarTexto((tipo ?? '').trim(), 20);
    const nuevaDesde = S.limpiarTexto((desde ?? '').trim(), 10);
    const nuevaHasta = S.limpiarTexto((hasta ?? '').trim(), 10);

    const error = _validarRangoGrupo(nuevoTipo, nuevaDesde, nuevaHasta);
    if (error) { notify.mostrarToast(error, 'error'); return; }

    if (nuevoTipo === grupoEnEdicion.subtipo && nuevaDesde === grupoEnEdicion.fechaDesde && nuevaHasta === grupoEnEdicion.fechaHasta) {
        notify.mostrarToast('Sin cambios', 'info'); notify.cerrarEdicionGrupo(); return;
    }

    const fechasNuevas = TiempoUtils.generarRangoFechas(nuevaDesde, nuevaHasta);
    const idsDelGrupo = new Set(grupoEnEdicion.registros.map(r => r.id));
    const fechasSet = new Set(fechasNuevas);
    const registros = EstadoApp.registros();
    const conflictos = registros.filter(r => fechasSet.has(r.fecha) && !idsDelGrupo.has(r.id));
    if (conflictos.length > 0) {
        const dias = conflictos.map(r => r.fecha.substring(8, 10)).sort((a, b) => a - b).join(', ');
        notify.mostrarToast(`Conflicto en día(s): ${dias}\n Ya existen registros en esas fechas.`, 'error'); return;
    }

    const deltaRegistros = fechasNuevas.length - idsDelGrupo.size;
    if (deltaRegistros > 0 && !EstadoApp._hayEspacioParaRegistros(deltaRegistros)) {
        notify.mostrarToast('Límite de registros alcanzado', 'error'); return;
    }
    const notaPrevia = TiposRegistro.notaDeGrupo(grupoEnEdicion) || null;
    const objetivoPorFecha = new Map(grupoEnEdicion.registros.map(r => [r.fecha, r.objetivoHoras]));
    const filtrados = registros.filter(r => !idsDelGrupo.has(r.id));
    const { entrada, salida } = /** @type {{ entrada: string, salida: string }} */ (TiposRegistro.obtenerCodigosPorTipo(nuevoTipo));
    const nuevosRegistros = fechasNuevas.map((fechaISO, idx) => {
        const reg = EstadoApp._construirRegistro(fechaISO, entrada, salida);
        if (Objetivos._esObjetivoValido(objetivoPorFecha.get(fechaISO))) reg.objetivoHoras = objetivoPorFecha.get(fechaISO);
        if (idx === 0 && notaPrevia) reg.notas = notaPrevia;
        return reg;
    });
    filtrados.push(...nuevosRegistros);
    EstadoApp._setRegistros(filtrados);
    EstadoApp.ordenarRegistros();
    EstadoApp.sincronizarPushHoy();
    const saved = await Cambios.confirmar(`editar grupo (${TiempoUtils.contar(nuevosRegistros.length, 'día')})`, { ids: nuevosRegistros.map(r => r.id) });
    if (saved) { notify.mostrarToast('Grupo actualizado', 'success'); notify.cerrarEdicionGrupo(); }
}

async function eliminarGrupoActual() {
    const grupoEnEdicion = EstadoApp.getGrupoEnEdicion();
    if (!grupoEnEdicion) return;
    const notify = EstadoApp._notify();
    if (grupoEnEdicion.registros.length > S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION) {
        notify.mostrarToast(`Este grupo contiene ${grupoEnEdicion.registros.length} registros.\nMáximo permitido: ${S.SECURITY_LIMITS.MAX_REGISTROS_POR_OPERACION} registros por operación.`, 'error', TOAST_MS.LARGO);
        return;
    }
    const idsAEliminar = grupoEnEdicion.registros.map(r => r.id);
    EstadoApp._setRegistros(EstadoApp.registros().filter(r => !idsAEliminar.includes(r.id)));
    EstadoApp.sincronizarPushHoy();
    const saved = await Cambios.confirmar(`eliminar grupo (${TiempoUtils.contar(idsAEliminar.length, 'registro')})`);
    if (saved) { notify.mostrarToast('Grupo eliminado', 'success'); notify.cerrarEdicionGrupo(); }
}

export const EdicionGrupo = { editarGrupo, guardarEdicionGrupo, eliminarGrupoActual };
