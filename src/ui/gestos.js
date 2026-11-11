// ====================================================================
// GESTOS — swipe, debounce y press & hold
// ====================================================================

export function registrarSwipe(el, callback, { minX = 50, maxY = 80 } = {}) {
    if (!el || el.dataset.swipeInit) return;
    el.dataset.swipeInit = '1';
    let _x = null, _y = null;
    let _direccionBloqueada = null;

    el.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        _x = e.touches[0].clientX;
        _y = e.touches[0].clientY;
        _direccionBloqueada = null;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
        if (_x === null || _y === null) return;

        const dx = Math.abs(e.touches[0].clientX - _x);
        const dy = Math.abs(e.touches[0].clientY - _y);

        if (!_direccionBloqueada && (dx > 5 || dy > 5)) {
            _direccionBloqueada = dx > dy ? 'x' : 'y';
        }

        if (_direccionBloqueada === 'x' && e.cancelable) {
            e.preventDefault();
        }
    }, { passive: false });

    el.addEventListener('touchend', e => {
        if (_x === null || _direccionBloqueada === 'y') {
            _x = null; _y = null;
            return;
        }

        const dx = e.changedTouches[0].clientX - _x;
        const dy = e.changedTouches[0].clientY - _y;
        _x = null; _y = null;

        if (Math.abs(dy) > maxY) return;
        if (Math.abs(dx) < minX) return;
        callback(dx < 0 ? 1 : -1);
    }, { passive: true });
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function _crearPressHold(accionFn) {
    let timeout = null, intervalo = null;
    const iniciar = (arg) => {
        accionFn(arg);
        timeout = setTimeout(() => {
            intervalo = setInterval(() => accionFn(arg), 100);
        }, 500);
    };
    const detener = () => {
        if (timeout) { clearTimeout(timeout); timeout = null; }
        if (intervalo) { clearInterval(intervalo); intervalo = null; }
    };
    const vincular = (btn, arg) => {
        const start = (e) => {
            if (btn.disabled) return;
            if (e.type === 'touchstart') e.preventDefault();
            iniciar(arg);
        };
        const stop = (e) => {
            if (e && e.type === 'touchend') e.preventDefault();
            detener();
        };
        btn.addEventListener('mousedown', start);
        btn.addEventListener('touchstart', start, { passive: false });
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchend', stop, { passive: false });
        btn.addEventListener('touchcancel', stop);
    };
    return { iniciar, detener, vincular };
}
