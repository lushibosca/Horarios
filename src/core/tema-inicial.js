// Anti-clickjacking: GitHub Pages no permite enviar el header frame-ancestors
// y la CSP en <meta> lo ignora.
// Se oculta siempre: un <iframe sandbox> bloquea la navegación del top sin lanzar excepción.
if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { /** @type {Window} */ (window.top).location = window.self.location.href; } catch (e) { /* sin acceso al almacenamiento o a window.top: se usan los valores por defecto */ }
}

// Listas válidas (copias de TEMAS en ui/gestor-temas.js, de ESTILOS_CALENDARIO en core/estilo-calendario.js y de POSICIONES_HEADER en core/posicion-header.js: este
// script clásico no puede importar módulos; tests/architecture.test.mjs verifica que coincidan). Un valor guardado
// que no esté en la lista se trata como el valor por defecto, igual que hacen esos módulos.
var TEMAS_VALIDOS = ['light', 'dark', 'medianoche', 'pink', 'green', 'blue', 'lilac', 'crema'];
var POSICIONES_HEADER_VALIDAS = ['top', 'bottom', 'left', 'right'];
var ESTILOS_CALENDARIO_VALIDOS = ['legacy', 'relleno-aro', 'cuadrado-aro', 'aro-tinte', 'aro-grueso', 'contorno-brillo', 'subrayado', 'punto'];

(function () {
    try {
        var s = localStorage.getItem('horarios_temaOscuro');
        if (s === null) s = localStorage.getItem('temaOscuro');
        var html = document.documentElement;

        // Compatibilidad con el valor booleano antiguo ('true'/'false')
        if (s === 'true') s = 'dark';
        else if (s === 'false') s = 'light';
        else if (s === null || TEMAS_VALIDOS.indexOf(s) === -1) s = 'dark'; // valor por defecto (también si está corrupto)

        if (s === 'dark') {
            html.classList.add('dark-mode');
        } else if (s !== 'light') {
            html.setAttribute('data-theme', s);
        }
        // s === 'light' -> no se aplica nada, queda el tema claro por defecto
    } catch (e) { /* sin acceso al almacenamiento o a window.top: se usan los valores por defecto */ }
}());

// Estilo de los días del calendario (ver EstiloCalendario): el CSS solo mira <html data-estilo-calendario>; sin valor guardado queda el original ('legacy').
(function () {
    try {
        var e = localStorage.getItem('horarios_estiloCalendario') || 'legacy';
        document.documentElement.setAttribute('data-estilo-calendario', ESTILOS_CALENDARIO_VALIDOS.indexOf(e) === -1 ? 'legacy' : e);
    } catch (err) { /* sin acceso al almacenamiento o a window.top: se usan los valores por defecto */ }
}());

// Posición del encabezado (ver PosicionHeader): el CSS solo mira <html data-header-pos>. PC y móvil guardan la suya (mismo corte que el CSS: 1024px);
// en móvil solo valen arriba y abajo. Sin valor guardado (o inválido para ese modo) queda arriba.
(function () {
    try {
        var escritorio = window.matchMedia('(min-width: 1024px)').matches;
        var p = localStorage.getItem(escritorio ? 'horarios_posicionHeader' : 'horarios_posicionHeaderMovil') || 'top';
        if (POSICIONES_HEADER_VALIDAS.indexOf(p) === -1 || (!escritorio && (p === 'left' || p === 'right'))) p = 'top';
        document.documentElement.setAttribute('data-header-pos', p);
    } catch (err) { /* sin acceso al almacenamiento o a window.top: se usan los valores por defecto */ }
}());

// Reducir animaciones: 'on' | 'off' | 'auto' (sin valor = auto, sigue al sistema).
// Misma regla que Movimiento en app.js; el CSS solo mira <html data-motion>.
(function () {
    try {
        var m = localStorage.getItem('horarios_reducirAnimaciones');
        if (m === null) m = localStorage.getItem('reducirAnimaciones');
        var reducir = m === 'on' || (m !== 'off' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.setAttribute('data-motion', reducir ? 'reduce' : 'full');
    } catch (e) { /* sin acceso al almacenamiento o a window.top: se usan los valores por defecto */ }
}());

// Pantalla de carga: oculta el HTML estático (CSS: html.cargando) hasta que main.js lo quita al terminar de iniciar la UI.
// Red de seguridad: si el módulo falla o tarda demasiado, se muestra la página igual.
(function () {
    var html = document.documentElement;
    html.classList.add('cargando');
    setTimeout(function () { html.classList.remove('cargando'); }, 8000);
}());
