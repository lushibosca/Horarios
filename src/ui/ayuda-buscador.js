import { $ } from '../core/dom.js';
import { terminosDeBusqueda, textoCoincide, rangosCoincidencia, teclaIniciaBusqueda } from '../core/busqueda-texto.js';
import { Movimiento } from '../core/movimiento.js';
import { debounce } from './gestos.js';

// ====================================================================
// BUSCADOR DE LA AYUDA — filtra las secciones del modal y resalta las coincidencias
// ====================================================================
const CLASE_MARCA = 'ayuda-resaltado';
const CLASE_ACTIVA = 'ayuda-resaltado--activa';

/** Coincidencias resaltadas, en orden de lectura, y la que está seleccionada (Enter recorre la lista) */
/** @type {HTMLElement[]} */
let _marcas = [];
let _activa = -1;

function _secciones() {
    return /** @type {HTMLElement[]} */ ([...document.querySelectorAll('#modal-ayuda .ayuda-seccion')]);
}

function _itemDeIndice(seccion) {
    return /** @type {HTMLElement | null} */ (document.querySelector(`#ayuda-indice [data-target="${CSS.escape(seccion.id)}"]`));
}

function _quitarMarcas() {
    const raiz = document.querySelector('#modal-ayuda .ayuda-secciones');
    if (!raiz) return;
    raiz.querySelectorAll(`mark.${CLASE_MARCA}`).forEach(m => m.replaceWith(document.createTextNode(m.textContent ?? '')));
    raiz.normalize();
}

function _resaltar(seccion, terminos) {
    const recorrido = document.createTreeWalker(seccion, NodeFilter.SHOW_TEXT);
    /** @type {Text[]} */
    const nodos = [];
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) nodos.push(/** @type {Text} */ (n));
    nodos.forEach(nodo => {
        const texto = nodo.nodeValue ?? '';
        const rangos = rangosCoincidencia(texto, terminos);
        if (!rangos.length) return;
        const frag = document.createDocumentFragment();
        let cursor = 0;
        rangos.forEach(([ini, fin]) => {
            if (ini > cursor) frag.append(texto.slice(cursor, ini));
            const marca = document.createElement('mark');
            marca.className = CLASE_MARCA;
            marca.textContent = texto.slice(ini, fin);
            frag.append(marca);
            cursor = fin;
        });
        if (cursor < texto.length) frag.append(texto.slice(cursor));
        nodo.replaceWith(frag);
    });
}

/** @param {string} consulta */
function buscar(consulta) {
    const terminos = terminosDeBusqueda(consulta);
    _quitarMarcas();
    const secciones = _secciones();
    const buscando = terminos.length > 0;
    let coinciden = 0;
    secciones.forEach(sec => {
        const visible = !buscando || textoCoincide(sec.textContent ?? '', terminos);
        sec.hidden = !visible;
        const item = _itemDeIndice(sec);
        if (item) item.hidden = !visible;
        if (visible && buscando) { coinciden++; _resaltar(sec, terminos); }
    });
    _marcas = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(`#modal-ayuda mark.${CLASE_MARCA}`)]);
    _activa = -1;
    const vacio = $('ayuda-sin-resultados');
    if (vacio) vacio.hidden = !buscando || coinciden > 0;
    $('btn-ayuda-buscar-limpiar')?.toggleAttribute('hidden', !consulta);
    const cuerpo = document.querySelector('#modal-ayuda .modal-panel-body');
    if (cuerpo) cuerpo.scrollTop = 0;
    if (_marcas.length) _activar(0);
    else _escribirContador(buscando ? 'Sin resultados' : '');
}

/** @param {string} texto */
function _escribirContador(texto) {
    const cuenta = $('ayuda-resultados');
    if (cuenta) cuenta.textContent = texto;
}

/** Selecciona una coincidencia (la distingue de las demás), la lleva a la vista y actualiza el contador. */
function _activar(indice) {
    _marcas[_activa]?.classList.remove(CLASE_ACTIVA);
    _activa = indice;
    const marca = _marcas[indice];
    marca.classList.add(CLASE_ACTIVA);
    marca.scrollIntoView({ block: 'center', behavior: Movimiento.reducido() ? 'auto' : 'smooth' });
    _escribirContador(`${indice + 1} de ${_marcas.length}`);
}

/** Pasa a la coincidencia siguiente (1) o anterior (-1), dando la vuelta al llegar al final. @param {1 | -1} sentido */
function _recorrer(sentido) {
    if (!_marcas.length) return;
    _activar((_activa + sentido + _marcas.length) % _marcas.length);
}

/** Vacía la búsqueda y muestra todas las secciones (se usa al abrir la ayuda). */
function limpiar() {
    const input = /** @type {HTMLInputElement | null} */ ($('ayuda-buscar'));
    if (input) input.value = '';
    buscar('');
}

function bindEventos() {
    const input = /** @type {HTMLInputElement | null} */ ($('ayuda-buscar'));
    if (!input) return;
    const filtrar = debounce(() => buscar(input.value), 120);
    input.addEventListener('input', filtrar);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && input.value) {
            // con texto escrito, Escape solo vacía la búsqueda; el modal se cierra con el siguiente
            e.preventDefault();
            e.stopPropagation();
            limpiar();
        } else if (e.key === 'Enter') {
            // Enter recorre las coincidencias (Mayús + Enter, hacia atrás)
            e.preventDefault();
            _recorrer(e.shiftKey ? -1 : 1);
        }
    });
    $('btn-ayuda-buscar-limpiar')?.addEventListener('click', () => { limpiar(); input.focus(); });

    // En PC, con la ayuda abierta, escribir una letra empieza la búsqueda: el foco pasa al campo y la tecla se escribe ahí
    const hayPuntero = window.matchMedia('(hover: hover) and (pointer: fine)');
    document.addEventListener('keydown', (e) => {
        if (!hayPuntero.matches || !$('modal-ayuda')?.classList.contains('show')) return;
        const activo = document.activeElement;
        const focoEnCampo = !!activo && (activo.matches('input, textarea, select') || /** @type {HTMLElement} */ (activo).isContentEditable);
        if (teclaIniciaBusqueda(e, focoEnCampo)) input.focus();
    });
}

export const AyudaBuscador = { bindEventos, limpiar };
