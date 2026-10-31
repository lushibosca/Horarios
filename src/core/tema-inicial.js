// Anti-clickjacking: GitHub Pages no permite enviar el header frame-ancestors
// y la CSP en <meta> lo ignora.
// Se oculta siempre: un <iframe sandbox> bloquea la navegación del top sin lanzar excepción.
if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { /** @type {Window} */ (window.top).location = window.self.location.href; } catch (e) { }
}

(function () {
    try {
        var s = localStorage.getItem('horarios_temaOscuro');
        if (s === null) s = localStorage.getItem('temaOscuro');
        var html = document.documentElement;

        // Compatibilidad con el valor booleano antiguo ('true'/'false')
        if (s === 'true') s = 'dark';
        else if (s === 'false') s = 'light';
        else if (s === null) s = 'dark'; // valor por defecto

        if (s === 'dark') {
            html.classList.add('dark-mode');
        } else if (s !== 'light') {
            html.setAttribute('data-theme', s);
        }
        // s === 'light' -> no se aplica nada, queda el tema claro por defecto
    } catch (e) { }
}());

// Reducir animaciones: 'on' | 'off' | 'auto' (sin valor = auto, sigue al sistema).
// Misma regla que Movimiento en app.js; el CSS solo mira <html data-motion>.
(function () {
    try {
        var m = localStorage.getItem('horarios_reducirAnimaciones');
        if (m === null) m = localStorage.getItem('reducirAnimaciones');
        var reducir = m === 'on' || (m !== 'off' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.setAttribute('data-motion', reducir ? 'reduce' : 'full');
    } catch (e) { }
}());
