import { Animaciones } from './animaciones.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { GestorPerfiles } from '../services/gestor-perfiles.js';
import { GestorModales } from './gestor-modales.js';
import { debounce, _crearPressHold } from './gestos.js';
import { mostrarToast, _cerrarToastActual, _habilitarCierreToast } from './toast.js';
import { resetearBoton, salirExitoFichaje } from './boton-fichar.js';
import { _posicionarPopup, _registrarCierrePopup, _crearPopupFlotante } from './popups.js';
import { _scrollA, _esperarFinScroll, _scrollHastaVisible } from './scroll.js';

// ====================================================================
//                     UI CORE MODULE (generic UI utilities)
// ====================================================================
/** @param {any} [callback] */
function toggleSeccionGen(elementId, iconId, storageKey, callback = null) {
    const el = $(elementId);
    const icon = $(iconId);
    if (!el) return;

    el.classList.toggle('expanded');
    const isExpanded = el.classList.contains('expanded');
    if (icon) {
        if (isExpanded) icon.classList.add('rotated');
        else icon.classList.remove('rotated');
    }

    if (Almacenamiento.getBoolean(STORAGE_KEYS.PERSISTIR_TARJETAS, true)) {
        Almacenamiento.setItem(storageKey, isExpanded);
    }
    if (isExpanded && callback) callback();
}


function _actualizarOffsetsStickyMes() {
    const header = document.querySelector('.header');
    const mesHeader = document.querySelector('.registro-mes-header');
    const root = document.documentElement.style;
    if (header) root.setProperty('--app-header-h', header.getBoundingClientRect().height + 'px');
    if (mesHeader) root.setProperty('--mes-header-h', mesHeader.getBoundingClientRect().height + 'px');
}
const actualizarOffsetsStickyMesDebounced = debounce(_actualizarOffsetsStickyMes, 150);

function mostrarError(inputId, errorId) {
    const input = $(inputId);
    const error = $(errorId);
    if (input) input.classList.add('error');
    if (error) error.style.display = 'block';
}

function limpiarError(inputId, errorId) {
    const input = $(inputId);
    const error = $(errorId);
    if (input) input.classList.remove('error');
    if (error) error.style.display = 'none';
}

function obtenerNombrePerfilSafe() {
    let nombre = 'Backup';
    if (GestorPerfiles) nombre = GestorPerfiles.obtenerDatosPerfil().nombre;
    return nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ'\-_ ]/g, '').trim().replace(/\s+/g, '_');
}

function descargarJSON(data, nombreArchivo) {
    descargarArchivo(JSON.stringify(data, null, 2), nombreArchivo, 'application/json');
}

function descargarArchivo(contenido, nombreArchivo, mime) {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const { _animarMutacion, _flashElemento } = Animaciones;
/**
 * @param {{ getVal: () => boolean, setVal: (v: boolean) => any, btnId: string,
 *           onAfterToggle?: (v: boolean) => void, puedeActivar?: () => boolean }} cfg
 */
function _crearToggleConfig({ getVal, setVal, btnId, onAfterToggle, puedeActivar }) {
    function actualizarEstado() {
        const val = getVal();
        _setBtnActivo(btnId, val);
        if (puedeActivar) _setBtnDisabled(btnId, !val && !puedeActivar());
    }
    function toggle() {
        const nuevo = !getVal();
        if (nuevo && puedeActivar && !puedeActivar()) {
            actualizarEstado();
            return;
        }
        setVal(nuevo);
        actualizarEstado();
        onAfterToggle?.(nuevo);
    }
    return { toggle, actualizarEstado };
}

function _setBtnActivo(id, activo) {
    const btn = $(id);
    if (btn) btn.classList.toggle('btn-activo', activo);
}

function _crearOpcion(value, text, selected = false) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    if (selected) { opt.selected = true; opt.setAttribute('selected', ''); }
    return opt;
}

/** @param {any} [agruparFn] */
function _poblarSelect(selectId, items, getLabel, selDefault, actualizarFn, agruparFn = null) {
    const select = $(selectId);
    if (!select) return;
    const selActual = select.value;
    select.innerHTML = '';
    if (!items.length) { select.appendChild(_crearOpcion('', 'Sin registros')); actualizarFn(null); return; }
    const sel = (selActual && items.includes(selActual))
        ? selActual
        : (items.includes(selDefault)
            ? selDefault
            : (items.find(k => k <= selDefault) || items[items.length - 1]));
    if (agruparFn) {
        agruparFn(items).forEach((claves, grupo) => {
            const grp = document.createElement('optgroup');
            grp.label = grupo;
            claves.forEach(k => grp.appendChild(_crearOpcion(k, getLabel(k), k === sel)));
            select.appendChild(grp);
        });
    } else {
        items.forEach(k => select.appendChild(_crearOpcion(k, getLabel(k), k === sel)));
    }
    actualizarFn(sel);
}

function _setBtnDisabled(id, disabled) {
    const btn = $(id);
    if (!btn) return;
    btn.disabled = disabled;
}

/** @param {any} [setupFn] */
function _abrirModalConPadre(modalId, setupFn = null) {
    const modalAbierto = document.querySelector('.modal.show');
    const padre = modalAbierto ? modalAbierto.id : null;
    if (setupFn) setupFn();
    if (padre) GestorModales.alternar(padre, modalId);
    else GestorModales.abrir(modalId);
}

/** @param {any} [callbackAbrirPadre] */
function _cerrarModalConPadre(modalId, callbackAbrirPadre = null) {
    const padre = GestorModales.getPadre(modalId);
    if (padre) GestorModales.alternar(modalId, padre, null, callbackAbrirPadre ? () => callbackAbrirPadre(padre) : null);
    else GestorModales.cerrar(modalId);
}

/** @param {any} [colorVar] */
function _flashCampoConClase(clase, ids, colorVar = null) {
    ids.forEach(id => _flashElemento($(id), clase, colorVar));
}

function _flashCampo(...ids) { _flashCampoConClase('campo-flash', ids); }

const _COLOR_TOAST_POR_TIPO = {
    success: 'var(--c-green)', error: 'var(--c-red)', warning: 'var(--c-red)', info: 'var(--c-blue)'
};

function _vibrarFichar(tipo) {
    if (!('vibrate' in navigator)) return;
    try {
        if (tipo === 'success') {
            navigator.vibrate(40);
        } else {
            navigator.vibrate([50, 60, 50]);
        }
    } catch (_) { }
}

function _flashCampoTipo(tipo, ...ids) {
    _flashCampoConClase('campo-flash-color', ids, _COLOR_TOAST_POR_TIPO[tipo] || 'var(--text-main)');
    if (ids.includes('btn-agregar')) {
        _vibrarFichar(tipo);
    }
}

/**
 * @param {string} msg
 * @param {string} [tipo]
 * @param {{ btn?: HTMLElement|null, duracion?: number }} [opciones]
 */
function _avisarFichaje(msg, tipo = 'error', { btn = null, duracion = undefined } = {}) {
    if (tipo !== 'success') salirExitoFichaje($('btn-agregar'));
    if (btn) resetearBoton(btn);
    if (msg) mostrarToast(msg, tipo, duracion);
    _flashCampoTipo(tipo, 'btn-agregar');
}

function aplicarFeedbackCampos(campos, texto = '✓ Agregado', claseColor = 'label-feedback--green') {
    const activos = campos
        .filter(c => c.mostrar)
        .map(c => {
            const input = $(c.id);
            const label = input?.closest('.form-group')?.querySelector('label');
            const textoOriginal = label ? label.textContent : c.fallback;
            return { label, textoOriginal };
        });

    const labels = activos.filter(a => a.label).map(a => a.label);

    _animarMutacion(labels, () => {
        activos.forEach(({ label }) => {
            if (!label) return;
            label.textContent = texto;
            label.classList.add(claseColor);
        });
    });

    setTimeout(() => {
        _animarMutacion(labels, () => {
            activos.forEach(({ label, textoOriginal }) => {
                if (!label) return;
                label.textContent = textoOriginal;
                label.classList.remove(claseColor);
            });
        });
    }, 2000);
}

export const UIBase = {
    aplicarFeedbackCampos,
    _actualizarOffsetsStickyMes,
    actualizarOffsetsStickyMesDebounced,
    mostrarError,
    limpiarError,
    obtenerNombrePerfilSafe,
    descargarJSON,
    descargarArchivo,
    _crearToggleConfig,
    _setBtnActivo,
    _crearOpcion,
    _poblarSelect,
    _setBtnDisabled,
    _abrirModalConPadre,
    _cerrarModalConPadre,
    _flashCampo,
    _avisarFichaje,
    toggleSeccionGen
};
