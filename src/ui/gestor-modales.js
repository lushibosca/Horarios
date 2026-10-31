import { $ } from '../core/dom.js';

// ====================================================================
// MODAL MANAGER MODULE
// ====================================================================
const _padres = {};
const _accionesVolver = {
    'modal-confirmar': () => $('modal-confirmar-cancel')?.click(),
};

function registrarAccionVolver(modalId, fn) {
    _accionesVolver[modalId] = fn;
}

let _navegandoHaciaAtras = false;
let _popstatesAIgnorar = 0;
let _resetPopstatesTimeout = null;

function _ignorarProximoPopstate() {
    _popstatesAIgnorar++;
    clearTimeout(_resetPopstatesTimeout);
    _resetPopstatesTimeout = setTimeout(() => { _popstatesAIgnorar = 0; }, 500);
}
let _enAlternanciaHaciaAdelante = false;
let _enAlternanciaHaciaAtras = false;

let _ultimoTrigger = null;
let _ultimoClickCoords = null;
const _origenesModal = {};
const _triggerInfoPorModal = {};

window.addEventListener('pointerdown', (event) => {
    if (/** @type {HTMLElement} */ (event.target).classList.contains('modal')) return;
    _ultimoClickCoords = { x: event.clientX, y: event.clientY };
    _ultimoTrigger = /** @type {HTMLElement} */ (event.target).closest('button, [role="button"], a, .card, .registro-item, .chip, tr, td, [data-modal], .btn-action, .icon-btn') || event.target;
}, true);

window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        const active = document.activeElement;
        if (active && active !== document.body && !active.classList.contains('modal')) {
            _ultimoTrigger = active;
            const r = active.getBoundingClientRect();
            _ultimoClickCoords = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
    }
}, true);

function _calcularOrigen(triggerEl, coords, content) {
    let origenX = window.innerWidth / 2;
    let origenY = window.innerHeight / 2;

    if (triggerEl && document.body.contains(triggerEl)) {
        const tr = triggerEl.getBoundingClientRect();
        if (tr.width > 0 || tr.height > 0) {
            origenX = tr.left + tr.width / 2;
            origenY = tr.top + tr.height / 2;
        } else if (coords && (coords.x !== undefined)) {
            origenX = coords.x;
            origenY = coords.y;
        }
    } else if (coords && (coords.x !== undefined)) {
        origenX = coords.x;
        origenY = coords.y;
    }

    const w = content.offsetWidth || 450;
    const h = content.offsetHeight || 350;
    const left = (window.innerWidth - w) / 2;
    const top = (window.innerHeight - h) / 2;

    const relX = Math.round(origenX - left);
    const relY = Math.round(origenY - top);
    return `${relX}px ${relY}px`;
}

function _aplicarOrigenAnimacion(modal, modalId) {
    const content = /** @type {HTMLElement} */ (modal.querySelector('.modal-content'));
    if (!content) return;

    if (_enAlternanciaHaciaAtras && _origenesModal[modalId]) {
        content.style.transformOrigin = _origenesModal[modalId];
        return;
    }

    const originStr = _calcularOrigen(_ultimoTrigger, _ultimoClickCoords, content);
    content.style.transformOrigin = originStr;
    _origenesModal[modalId] = originStr;
    _triggerInfoPorModal[modalId] = { trigger: _ultimoTrigger, coords: _ultimoClickCoords };
}

window.addEventListener('resize', () => {
    document.querySelectorAll('.modal.show').forEach(modal => {
        const content = /** @type {HTMLElement} */ (modal.querySelector('.modal-content'));
        const info = _triggerInfoPorModal[modal.id];
        if (content && info) {
            const origen = _calcularOrigen(info.trigger, info.coords, content);
            content.style.transformOrigin = origen;
            _origenesModal[modal.id] = origen;
        }
    });
}, { passive: true });

function _getAccionVolver(modalId) {
    return _accionesVolver[modalId] || null;
}

function _ejecutarAccionCierre(modalId) {
    const accionVolver = _getAccionVolver(modalId);
    if (accionVolver) accionVolver();
    else cerrar(modalId);
}

window.addEventListener('popstate', (event) => {
    if (_popstatesAIgnorar > 0) {
        _popstatesAIgnorar--;
        return;
    }

    _navegandoHaciaAtras = true;

    const modalesAbiertos = Array.from(document.querySelectorAll('.modal.show'));
    if (modalesAbiertos.length > 0) {
        const topModal = modalesAbiertos[modalesAbiertos.length - 1];
        _ejecutarAccionCierre(topModal.id);
    }

    setTimeout(() => { _navegandoHaciaAtras = false; }, 50);
});

let _mousedownEnOverlay = false;

function _handleOverlayMousedown(event) {
    _mousedownEnOverlay = event.target.classList.contains('modal') && event.target.classList.contains('show');
}

function handleOutsideClick(event) {
    if (!_mousedownEnOverlay) return;
    if (event.target.classList.contains('modal') && event.target.classList.contains('show')) {
        const modalId = event.target.id;
        if (modalId === 'modal-confirmar') {
            return;
        }
        _ejecutarAccionCierre(modalId);
    }
}

/** @param {any} [callback] */
function abrir(modalId, callback = null) {
    const modal = $(modalId);
    if (!modal) return;

    if (callback) callback();

    _aplicarOrigenAnimacion(modal, modalId);
    modal.classList.add('show');
    document.body.classList.add('modal-open');

    if (!_navegandoHaciaAtras && !_enAlternanciaHaciaAtras) {
        history.pushState({ modalId: modalId }, "");
    }

    setTimeout(() => {
        modal.addEventListener('mousedown', _handleOverlayMousedown);
        modal.addEventListener('click', handleOutsideClick);
    }, 100);
}

/** @param {any} [callback] */
function cerrar(modalId, callback = null) {
    const modal = $(modalId);
    if (!modal) return;

    const content = /** @type {HTMLElement} */ (modal.querySelector('.modal-content'));
    if (content && _origenesModal[modalId]) {
        content.style.transformOrigin = _origenesModal[modalId];
    }

    const estabaAbierto = modal.classList.contains('show');
    modal.classList.remove('show');

    if (document.querySelectorAll('.modal.show').length === 0) {
        document.body.classList.remove('modal-open');
    }

    modal.removeEventListener('mousedown', _handleOverlayMousedown);
    modal.removeEventListener('click', handleOutsideClick);

    if (estabaAbierto && !_navegandoHaciaAtras && !_enAlternanciaHaciaAdelante) {
        _ignorarProximoPopstate();
        history.back();
    }

    if (callback) callback();

    setTimeout(() => {
        if (!modal.classList.contains('show')) {
            delete _origenesModal[modalId];
            delete _triggerInfoPorModal[modalId];
        }
    }, 350);
}

/** @param {any} [callbackCerrar] @param {any} [callbackAbrir] */
function alternar(modalIdCerrar, modalIdAbrir, callbackCerrar = null, callbackAbrir = null) {
    const esHaciaAtras = (_padres[modalIdCerrar] === modalIdAbrir);

    if (esHaciaAtras) {
        _enAlternanciaHaciaAtras = true;
        delete _padres[modalIdCerrar];
    } else {
        _enAlternanciaHaciaAdelante = true;
        if (modalIdCerrar && modalIdAbrir) {
            _padres[modalIdAbrir] = modalIdCerrar;
        }
    }

    cerrar(modalIdCerrar, callbackCerrar);
    abrir(modalIdAbrir, callbackAbrir);

    _enAlternanciaHaciaAdelante = false;
    _enAlternanciaHaciaAtras = false;
}

function cerrarTodos() {
    document.querySelectorAll('.modal.show').forEach(modal => {
        const content = /** @type {HTMLElement} */ (modal.querySelector('.modal-content'));
        if (content && _origenesModal[modal.id]) {
            content.style.transformOrigin = _origenesModal[modal.id];
        }
        modal.classList.remove('show');
        modal.removeEventListener('mousedown', _handleOverlayMousedown);
        modal.removeEventListener('click', handleOutsideClick);
    });
    Object.keys(_padres).forEach(k => delete _padres[k]);
    document.body.classList.remove('modal-open');
    setTimeout(() => {
        Object.keys(_origenesModal).forEach(k => delete _origenesModal[k]);
        Object.keys(_triggerInfoPorModal).forEach(k => delete _triggerInfoPorModal[k]);
    }, 350);
}

function confirmar(texto, labelOk = 'Confirmar', icono = '#icon-trash', opciones = {}) {
    return new Promise((resolve) => {
        const elTexto = $('modal-confirmar-texto');
        const elLabel = $('modal-confirmar-label-ok');
        const elLabelCancel = $('modal-confirmar-label-cancel');
        const elTitulo = $('modal-confirmar-titulo');
        const elIcono = document.querySelector('#modal-confirmar-ok svg use');
        const elIconoCancel = document.querySelector('#modal-confirmar-cancel svg use');
        const btnOk = $('modal-confirmar-ok');
        const btnCancel = $('modal-confirmar-cancel');
        if (!elTexto || !btnOk || !btnCancel) { resolve(false); return; }

        elTexto.textContent = texto;
        if (elLabel) elLabel.textContent = labelOk;
        if (elLabelCancel) elLabelCancel.textContent = opciones.labelCancel || 'Cancelar';
        if (elTitulo) elTitulo.textContent = opciones.titulo || 'Atención';
        if (elIcono) elIcono.setAttribute('href', icono);
        if (elIconoCancel) elIconoCancel.setAttribute('href', opciones.iconoCancel || '#icon-cancelar');

        const modalPadre = document.querySelector('.modal.show');
        const modalPadreId = modalPadre ? modalPadre.id : null;

        function ok() { cleanup(); resolve(true); }
        function cancel() { cleanup(); resolve(false); }

        function onPopstate() {
            _removeListeners();
            resolve(false);
        }

        function _removeListeners() {
            btnOk.removeEventListener('click', ok);
            btnCancel.removeEventListener('click', cancel);
            window.removeEventListener('popstate', onPopstate);
        }

        function cleanup() {
            _removeListeners();
            if (modalPadreId) {
                alternar('modal-confirmar', modalPadreId);
            } else {
                cerrar('modal-confirmar');
            }
        }

        btnOk.addEventListener('click', ok);
        btnCancel.addEventListener('click', cancel);
        window.addEventListener('popstate', onPopstate, { once: true });
        if (modalPadreId) {
            alternar(modalPadreId, 'modal-confirmar');
        } else {
            abrir('modal-confirmar');
        }
    });
}

export const GestorModales = { abrir, cerrar, alternar, cerrarTodos, confirmar, ejecutarAccionCierre: _ejecutarAccionCierre, getPadre: (id) => _padres[id] || null, registrarAccionVolver };
