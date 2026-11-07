import { $, setColapsable } from '../core/dom.js';
import { TiempoUtils } from '../core/tiempo-utils.js';
import { RecordatorioPush } from '../services/recordatorio-push.js';
import { GestorPerfiles } from '../services/gestor-perfiles.js';
import { GestorModales } from './gestor-modales.js';
import { setIconoBtn } from './boton-fichar.js';
import { _scrollA } from './scroll.js';
import { mostrarToast } from './toast.js';
import { Recarga } from '../core/recarga.js';
import { icono, montar } from '../core/html.js';

// ====================================================================
//                     UI PROFILES MODULE
// ====================================================================


let perfilEnEdicion = null;

function renderizarListaPerfiles(animarCrecimiento = false) {
    const lista = $('lista-perfiles-botones');
    if (!lista) return;

    const alturaAnterior = animarCrecimiento ? lista.getBoundingClientRect().height : null;
    if (animarCrecimiento) {
        lista.style.transition = '';
        lista.style.height = alturaAnterior + 'px';
        lista.style.overflowY = 'hidden';
    }

    lista.replaceChildren();
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
            title: 'Editar perfil',
            onclick: (e) => { e.stopPropagation(); abrirEditorPerfil(p.id); }
        });
        montar(editBtn, icono('#icon-edit'));

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

/** Muestra u oculta el apartado "Agregar perfil" (botón sobre la línea del pie del modal). */
function setAgregarPerfil(abierto, { animar = true, enfocar = false } = {}) {
    setColapsable($('perfil-agregar-panel'), abierto, { animar });
    $('btn-toggle-agregar-perfil')?.setAttribute('aria-expanded', String(abierto));
    if (!abierto) return;
    const input = $('nombre-nuevo-perfil-selector');
    if (enfocar) input?.focus({ preventScroll: true });
    requestAnimationFrame(() => _scrollA(input));
}

function abrirSelectorPerfiles() {
    GestorModales.abrir('modal-selector-perfiles', () => {
        const inputNuevo = $('nombre-nuevo-perfil-selector');
        if (inputNuevo) inputNuevo.value = '';
        setAgregarPerfil(false, { animar: false });

        renderizarListaPerfiles();

        const esClaro = !document.documentElement.classList.contains('dark-mode')
            && !document.documentElement.getAttribute('data-theme');
        const toggleBtnModal = $('theme-toggle-modal');

        if (toggleBtnModal) setIconoBtn(toggleBtnModal, esClaro ? '#icon-moon' : '#icon-sun');
    });
}

function crearPerfilDesdeSelector() {
    const input = $('nombre-nuevo-perfil-selector');
    if (!input) return;
    const res = GestorPerfiles.crearPerfil(input.value);
    if ('error' in res) { mostrarToast(res.error, 'error'); return; }

    mostrarToast(`Perfil "${res.nombre}" creado`, 'success');
    input.value = '';
    setAgregarPerfil(false);
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
    const perfil = GestorPerfiles.obtenerTodosPerfiles()[perfilId];

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
        setAgregarPerfil(false, { animar: false });
        renderizarListaPerfiles();
        const btnEliminar = $('btn-eliminar-perfil-editor');
        if (btnEliminar) btnEliminar.disabled = true;
    });
}

function guardarEdicionPerfil() {
    if (!perfilEnEdicion) return;
    const res = GestorPerfiles.renombrarPerfil(perfilEnEdicion, $('nombre-perfil-editar').value);
    if ('error' in res) { mostrarToast(res.error, 'error'); return; }
    if ('sinCambios' in res) { mostrarToast('Sin cambios', 'info'); cerrarEditorPerfil(); return; }

    if (perfilEnEdicion === GestorPerfiles.obtenerPerfilActual()) {
        const btnTexto = $('nombre-perfil-header');
        if (btnTexto) btnTexto.textContent = res.nombre;
    }
    mostrarToast('Perfil actualizado', 'success');
    cerrarEditorPerfil();
}

async function eliminarPerfilDesdeEditor() {
    if (!perfilEnEdicion || perfilEnEdicion === 'default') {
        mostrarToast('No se puede eliminar el perfil Principal', 'error'); return;
    }
    const perfil = GestorPerfiles.obtenerTodosPerfiles()[perfilEnEdicion];
    if (!perfil) { mostrarToast('Perfil no encontrado', 'error'); return; }

    const tieneRegistros = Array.isArray(perfil.registros) && perfil.registros.length > 0;
    if (tieneRegistros) {
        if (!await GestorModales.confirmar(`¿Estás seguro de que querés eliminar el perfil "${perfil.nombre}"? Esta acción no se puede deshacer.`, 'Eliminar')) return;
    }

    RecordatorioPush.cancelarFinDeJornada(TiempoUtils.obtenerFechaHoy(), perfilEnEdicion);
    const res = GestorPerfiles.eliminarPerfil(perfilEnEdicion);
    if ('error' in res) { mostrarToast(res.error, 'error'); return; }

    if (res.eraActual) {
        mostrarToast('Perfil eliminado. Recargando...', 'success');
        setTimeout(() => Recarga.solicitar(), 1000);
    } else {
        mostrarToast('Perfil eliminado', 'success');
        cerrarEditorPerfil();
    }
}

function bindEventos() {
    document.querySelector('.header-profile-btn')?.addEventListener('click', () => abrirSelectorPerfiles());

    document.querySelector('#modal-selector-perfiles .btn-cancel')?.addEventListener('click', () => cerrarSelectorPerfiles());
    $('btn-crear-perfil')?.addEventListener('click', () => crearPerfilDesdeSelector());
    $('btn-toggle-agregar-perfil')?.addEventListener('click', () => {
        const abierto = $('btn-toggle-agregar-perfil')?.getAttribute('aria-expanded') === 'true';
        setAgregarPerfil(!abierto, { enfocar: true });
    });

    document.querySelector('#modal-editar-perfil .btn-edit')?.addEventListener('click', () => guardarEdicionPerfil());
    $('btn-eliminar-perfil-editor')?.addEventListener('click', () => eliminarPerfilDesdeEditor());
    document.querySelector('#modal-editar-perfil .btn-cancel')?.addEventListener('click', () => cerrarEditorPerfil());

}

export const Perfiles = {
    bindEventos,
    crearPerfilDesdeSelector,
    cerrarSelectorPerfiles,
    cerrarEditorPerfil
};
