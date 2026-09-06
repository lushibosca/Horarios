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
        } else if (s === 'pink' || s === 'green' || s === 'blue') {
            html.setAttribute('data-theme', s);
        }
        // s === 'light' -> no se aplica nada, queda el tema claro por defecto
    } catch (e) { }
}());

// Parche anti parpadeo blanco en modo oscuro / temas pastel
