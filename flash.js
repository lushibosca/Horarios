(function () {
    try {
        var s = localStorage.getItem('temaOscuro');
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
// Misma regla que Motion en app.js; el CSS solo mira <html data-motion>.
(function () {
    try {
        var m = localStorage.getItem('reducirAnimaciones');
        var reducir = m === 'on' || (m !== 'off' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.setAttribute('data-motion', reducir ? 'reduce' : 'full');
    } catch (e) { }
}());

// Parche anti parpadeo blanco en modo oscuro / temas pastel
