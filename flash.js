(function () { try { var s = localStorage.getItem('temaOscuro'); if (s === 'true' || s === null) document.documentElement.classList.add('dark-mode'); } catch (e) { } }());

// Parche anti parpadeo blanco en modo oscuro