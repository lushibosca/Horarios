import { esHtmlSeguro } from '../core/html.js';

// ====================================================================
// POPUPS FLOTANTES — posicionamiento, cierre y creación
// ====================================================================

export function _posicionarPopup(popup, event) {
    const el = event.currentTarget || event.target;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    requestAnimationFrame(() => {
        if (!popup.isConnected || popup.classList.contains('closing')) return;
        const pw = popup.offsetWidth, ph = popup.offsetHeight;
        let top = rect.bottom + 12;
        let left = rect.left + (rect.width / 2) - (pw / 2);
        if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
        if (left < margin) left = margin;
        if (top + ph > window.innerHeight - margin) top = rect.top - ph - 12;
        if (top < margin) top = margin;
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;

        const triggerCenterX = rect.left + rect.width / 2;
        const triggerCenterY = rect.top + rect.height / 2;
        const originX = Math.round(triggerCenterX - left);
        const originY = Math.round(triggerCenterY - top);
        popup.style.transformOrigin = `${originX}px ${originY}px`;

        popup.style.visibility = '';
        requestAnimationFrame(() => {
            if (!popup.isConnected || popup.classList.contains('closing')) return;
            popup.classList.add('show');
            setTimeout(() => {
                if (!popup.classList.contains('closing')) popup.classList.add('listo');
            }, 280);
        });
    });
}

export function _registrarCierrePopup(popup, selectorTrigger, esMismoTrigger, alCerrar) {
    let cerrado = false;
    const cerrar = () => {
        if (cerrado) return;
        cerrado = true;
        popup.classList.remove('show');
        popup.classList.remove('listo');
        popup.classList.add('closing');
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('scroll', cerrar, true);
        setTimeout(() => {
            popup.remove();
            if (alCerrar) alCerrar(popup);
        }, 200);
    };
    popup._cerrar = cerrar;
    const onClick = (e) => {
        const trigger = e.target.closest(selectorTrigger);
        if (trigger && esMismoTrigger(trigger)) return;
        if (!popup.contains(e.target)) cerrar();
    };
    setTimeout(() => {
        if (cerrado) return;
        document.addEventListener('click', onClick, { capture: true, passive: true });
        document.addEventListener('scroll', cerrar, { capture: true, passive: true });
    }, 10);
    return cerrar;
}

export function _crearPopupFlotante({ className, id, dataset = {}, html, event, selectorTrigger, esMismoTrigger, alCerrar }) {
    const popup = document.createElement('div');
    popup.className = className;
    popup.id = id;
    Object.entries(dataset).forEach(([k, v]) => { popup.dataset[k] = v; });
    if (!esHtmlSeguro(html)) throw new TypeError('_crearPopupFlotante: "html" debe ser un html`...` (core/html.js)');
    popup.innerHTML = html.valor;
    popup.style.visibility = 'hidden';
    document.body.appendChild(popup);

    const cerrar = _registrarCierrePopup(popup, selectorTrigger, esMismoTrigger, alCerrar);
    _posicionarPopup(popup, event);
    return { popup, cerrar };
}
