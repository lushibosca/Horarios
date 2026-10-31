import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from '../services/recordatorio-push.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorPerfiles } from '../services/gestor-perfiles.js';
import { GestorModales } from './gestor-modales.js';
import { SeguridadYUtils as S } from '../core/seguridad.js';
import { setIconoBtn } from './boton-fichar.js';
import { _scrollA } from './scroll.js';
import { mostrarToast } from './toast.js';
import { icono } from '../core/html.js';

// ====================================================================
//                     UI PROFILES MODULE
// ====================================================================


let perfilEnEdicion = null;

const REGEX_NOMBRE_PERFIL = /^[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\-_ ]+$/;

function _obtenerTodosPerfilesSafe() {
    return GestorPerfiles ? GestorPerfiles.obtenerTodosPerfiles() : {};
}

function _guardarPerfilesConManejo(perfiles, contextoError = 'Error al guardar perfil:') {
    try {
        if (!Almacenamiento.setItem(STORAGE_KEYS.PERFILES, perfiles)) throw new Error('quota');
        return true;
    } catch (e) {
        console.error(contextoError, e);
        mostrarToast('Error al guardar: almacenamiento lleno', 'error');
        return false;
    }
}

function renderizarListaPerfiles(animarCrecimiento = false) {
    const lista = $('lista-perfiles-botones');
    if (!lista) return;

    const alturaAnterior = animarCrecimiento ? lista.getBoundingClientRect().height : null;
    if (animarCrecimiento) {
        lista.style.transition = '';
        lista.style.height = alturaAnterior + 'px';
        lista.style.overflowY = 'hidden';
    }

    lista.innerHTML = '';
    GestorPerfiles.obtenerListaPerfiles().forEach(p => {
        const container = Object.assign(document.createElement('div'), {
            className: `btn-perfil-select ${p.esActual ? 'activo' : ''}`
        });

        const countText = `${p.totalRegistros} registro${TiempoUtils.pluralizar(p.totalRegistros)}`;
        const infoSection = Object.assign(document.createElement('div'), { className: 'btn-perfil-info' });
        const nombreEl = Object.assign(document.createElement('div'), { className: 'btn-perfil-nombre' });
        nombreEl.appendChild(Object.assign(document.createElement('span'), {
            className: 'btn-perfil-nombre-texto',
            textContent: p.nombre
        }));
        if (p.esActual) {
            nombreEl.appendChild(Object.assign(document.createElement('span'), {
                className: 'btn-perfil-estado',
                textContent: 'Activo'
            }));
        }
        infoSection.appendChild(nombreEl);
        infoSection.appendChild(Object.assign(document.createElement('div'), {
            className: 'btn-perfil-detalle',
            textContent: countText
        }));

        const editBtn = Object.assign(document.createElement('button'), {
            className: 'btn-perfil-edit',
            innerHTML: String(icono('#icon-edit')),
            title: 'Editar perfil',
            onclick: (e) => { e.stopPropagation(); abrirEditorPerfil(p.id); }
        });

        container.onclick = () => { if (!p.esActual) GestorPerfiles.cambiarPerfil(p.id); };
        container.appendChild(infoSection);
        container.appendChild(editBtn);
        lista.appendChild(container);
    });

    if (animarCrecimiento) {
        const alturaNueva = lista.scrollHeight;
        requestAnimationFrame(() => {
            lista.style.transition = `height var(--dur-collapse) ease-out`;
            lista.style.height = alturaNueva + 'px';
        });
        lista.addEventListener('transitionend', function _limpiarAlturaLista(e) {
            if (e.target !== lista || e.propertyName !== 'height') return;
            lista.removeEventListener('transitionend', _limpiarAlturaLista);
            lista.style.transition = '';
            lista.style.height = '';
            lista.style.overflowY = '';
        }, { once: false });
    }
}

function abrirSelectorPerfiles() {
    GestorModales.abrir('modal-selector-perfiles', () => {
        const inputNuevo = $('nombre-nuevo-perfil-selector');
        if (inputNuevo) inputNuevo.value = '';

        renderizarListaPerfiles();

        const esClaro = !document.documentElement.classList.contains('dark-mode')
            && !document.documentElement.getAttribute('data-theme');
        const toggleBtnModal = $('theme-toggle-modal');

        if (toggleBtnModal) setIconoBtn(toggleBtnModal, esClaro ? '#icon-moon' : '#icon-sun');
    });
}

function _validarNombrePerfil(nombre, perfiles) {
    if (!nombre) return 'Ingresá un nombre para el perfil';
    if (!REGEX_NOMBRE_PERFIL.test(nombre)) return 'El nombre contiene caracteres no válidos.\n Solo letras, números y espacios.';
    if (Object.values(perfiles).some(p => p.nombre.toLowerCase().trim() === nombre.toLowerCase().trim())) return 'Ya existe un perfil con ese nombre';
    if (Object.keys(perfiles).length >= GestorPerfiles.MAX_PERFILES) return `Máximo de perfiles alcanzado (${GestorPerfiles.MAX_PERFILES})`;
    return null;
}

function crearPerfilDesdeSelector() {
    const input = $('nombre-nuevo-perfil-selector');
    if (!input) return;
    const nombre = S.sanitizeString(input.value.trim(), 30);
    const perfiles = _obtenerTodosPerfilesSafe();

    const error = _validarNombrePerfil(nombre, perfiles);
    if (error) { mostrarToast(error, 'error'); return; }

    const id = 'perfil_' + S.generarIDSeguro();
    perfiles[id] = { nombre, registros: [], diasHabiles: [1, 2, 3, 4, 5], horasDiarias: 7 };

    if (!_guardarPerfilesConManejo(perfiles)) { delete perfiles[id]; return; }

    if (GestorPerfiles) GestorPerfiles.inicializar();
    mostrarToast(`Perfil "${nombre}" creado`, 'success');
    input.value = '';
    renderizarListaPerfiles(true);
    requestAnimationFrame(() => {
        const ultimo = $('lista-perfiles-botones')?.lastElementChild;
        if (ultimo) { ultimo.classList.add('add-perfil'); _scrollA(ultimo); }
    });
}

function cerrarSelectorPerfiles() {
    GestorModales.cerrar('modal-selector-perfiles');
}

function abrirEditorPerfil(perfilId) {
    perfilEnEdicion = perfilId;
    const perfiles = _obtenerTodosPerfilesSafe();
    const perfil = perfiles[perfilId];

    if (!perfil) {
        mostrarToast('Perfil no encontrado', 'error');
        return;
    }

    $('nombre-perfil-editar').value = perfil.nombre;

    const btnEliminar = $('btn-eliminar-perfil-editor');
    if (btnEliminar) {
        btnEliminar.disabled = (perfilId === 'default');
    }

    GestorModales.alternar('modal-selector-perfiles', 'modal-editar-perfil');
}

function cerrarEditorPerfil() {
    perfilEnEdicion = null;
    GestorModales.alternar('modal-editar-perfil', 'modal-selector-perfiles', null, () => {
        const inputNuevo = $('nombre-nuevo-perfil-selector');
        if (inputNuevo) inputNuevo.value = '';
        renderizarListaPerfiles();
        const btnEliminar = $('btn-eliminar-perfil-editor');
        if (btnEliminar) btnEliminar.disabled = true;
    });
}

function _validarNombrePerfilEdicion(nuevoNombre, perfiles, excluirId) {
    if (!nuevoNombre) return 'Ingresá un nombre válido';
    if (!REGEX_NOMBRE_PERFIL.test(nuevoNombre)) return 'Caracteres no permitidos en el nombre.';
    if (!perfiles[excluirId]) return 'Perfil no encontrado';
    const norm = nuevoNombre.toLowerCase().trim();
    if (Object.entries(perfiles).some(([id, p]) => id !== excluirId && p.nombre.toLowerCase().trim() === norm)) return 'Ya existe otro perfil con ese nombre';
    return null;
}

function guardarEdicionPerfil() {
    if (!perfilEnEdicion) return;
    const nuevoNombre = S.sanitizeString($('nombre-perfil-editar').value.trim(), 30);
    const perfiles = _obtenerTodosPerfilesSafe();

    const error = _validarNombrePerfilEdicion(nuevoNombre, perfiles, perfilEnEdicion);
    if (error) { mostrarToast(error, 'error'); return; }

    if (perfiles[perfilEnEdicion].nombre === nuevoNombre) {
        mostrarToast('Sin cambios', 'info'); cerrarEditorPerfil(); return;
    }

    const nombreAnterior = perfiles[perfilEnEdicion].nombre;
    perfiles[perfilEnEdicion].nombre = nuevoNombre;
    if (!_guardarPerfilesConManejo(perfiles)) { perfiles[perfilEnEdicion].nombre = nombreAnterior; return; }

    if (perfilEnEdicion === GestorPerfiles?.obtenerPerfilActual()) {
        const btnTexto = $('nombre-perfil-header');
        if (btnTexto) btnTexto.textContent = nuevoNombre;
    }
    if (GestorPerfiles) GestorPerfiles.inicializar();
    mostrarToast('Perfil actualizado', 'success');
    cerrarEditorPerfil();
}

function _limpiarClavesPerfil(pid) {
    ['breakStartTime', STORAGE_KEYS.HISTORY, STORAGE_KEYS.FONDO_CARD, STORAGE_KEYS.IGNORAR_TF, STORAGE_KEYS.IGNORAR_LOGICA_CUBIERTO, STORAGE_KEYS.IGNORAR_OBJETIVO_POR_REGISTRO,
        'cardVisible_registrar', 'cardVisible_estadisticas', 'cardVisible_historico', STORAGE_KEYS.ORDEN_CARDS,
        STORAGE_KEYS.PUSH_HABILITADO, STORAGE_KEYS.PUSH_ANTICIPACION_MIN, STORAGE_KEYS.PUSH_USAR_BUFFER_SEMANAL, STORAGE_KEYS.PUSH_BUFFER_SOLO_ULTIMO_DIA, STORAGE_KEYS.PUSH_INFO_ACTIVA, STORAGE_KEYS.PUSH_AVISOS_RESTANTES
    ].forEach(k => Almacenamiento.removeItem(`${k}_${pid}`));
}

async function eliminarPerfilDesdeEditor() {
    if (!perfilEnEdicion || perfilEnEdicion === 'default') {
        mostrarToast('No se puede eliminar el perfil Principal', 'error'); return;
    }
    const perfiles = _obtenerTodosPerfilesSafe();
    const perfil = perfiles[perfilEnEdicion];
    if (!perfil) { mostrarToast('Perfil no encontrado', 'error'); return; }

    const tieneRegistros = Array.isArray(perfil.registros) && perfil.registros.length > 0;
    if (tieneRegistros) {
        if (!await GestorModales.confirmar(`¿Estás seguro de que querés eliminar el perfil "${perfil.nombre}"? Esta acción no se puede deshacer.`, 'Eliminar')) return;
    }

    RecordatorioPush.cancelarFinDeJornada(TiempoUtils.obtenerFechaHoy(), perfilEnEdicion);
    _limpiarClavesPerfil(perfilEnEdicion);
    delete perfiles[perfilEnEdicion];
    if (!_guardarPerfilesConManejo(perfiles, 'Error al eliminar perfil:')) return;

    if (perfilEnEdicion === GestorPerfiles?.obtenerPerfilActual()) {
        try {
            if (!Almacenamiento.setItem(STORAGE_KEYS.PERFIL_ACTIVO, 'default')) throw new Error('quota');
        } catch (e) {
            console.error('Error al guardar perfil activo:', e); mostrarToast('Error al guardar: almacenamiento lleno', 'error'); return;
        }
        mostrarToast('Perfil eliminado. Recargando...', 'success');
        setTimeout(() => location.reload(), 1000);
    } else {
        GestorPerfiles?.inicializar();
        mostrarToast('Perfil eliminado', 'success');
        cerrarEditorPerfil();
    }
}

function bindEventos() {
    document.querySelector('.header-profile-btn')?.addEventListener('click', () => abrirSelectorPerfiles());

    document.querySelector('#modal-selector-perfiles .btn-cancel')?.addEventListener('click', () => cerrarSelectorPerfiles());
    $('btn-crear-perfil')?.addEventListener('click', () => crearPerfilDesdeSelector());

    document.querySelector('#modal-editar-perfil .btn-edit')?.addEventListener('click', () => guardarEdicionPerfil());
    $('btn-eliminar-perfil-editor')?.addEventListener('click', () => eliminarPerfilDesdeEditor());
    document.querySelector('#modal-editar-perfil .btn-cancel')?.addEventListener('click', () => cerrarEditorPerfil());

}

export const Perfiles = {
    bindEventos,
    renderizarListaPerfiles,
    abrirSelectorPerfiles,
    crearPerfilDesdeSelector,
    cerrarSelectorPerfiles,
    abrirEditorPerfil,
    cerrarEditorPerfil,
    guardarEdicionPerfil,
    eliminarPerfilDesdeEditor,
    _limpiarClavesPerfil
};
