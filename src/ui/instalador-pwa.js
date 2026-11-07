import { $ } from '../core/dom.js';
import { EstadoApp } from '../services/estado-app.js';
import { AvisoActualizacion } from './aviso-actualizacion.js';
import { urlScriptConfiable } from '../core/html.js';
import { Movimiento } from '../core/movimiento.js';
import { IconosAnimados } from './iconos-animados.js';

// ====================================================================
// PWA INSTALLER MODULE
// ====================================================================
let deferredPrompt = null;
const btnInstall = $('btn-install');

// Llamado de atención del botón de instalar (solo cuando el navegador permite instalar): un aro que pulsa a su alrededor y la flecha que rebota.
// Pocos ciclos y espaciados (una ronda al abrir y otra unos segundos después), para que no moleste; se corta si el usuario se acerca al botón.
const RONDAS_LLAMADO_MS = [1500, 15000];   // cuándo empieza cada ronda
const CICLOS_POR_RONDA = 3;
const PAUSA_ENTRE_CICLOS_MS = 2200;
/** @type {ReturnType<typeof setTimeout>[]} */
let _timersLlamado = [];

function _detenerLlamado() {
    _timersLlamado.forEach(clearTimeout);
    _timersLlamado = [];
    btnInstall?.classList.remove('llamando');
}

function _cicloLlamado() {
    if (!btnInstall) return;
    btnInstall.classList.remove('llamando');
    void btnInstall.offsetWidth;   // reinicia la animación del aro
    btnInstall.classList.add('llamando');
    IconosAnimados.rebotarFlecha(btnInstall);
}

function _iniciarLlamado() {
    _detenerLlamado();
    if (Movimiento.reducido()) return;
    RONDAS_LLAMADO_MS.forEach(inicio => {
        for (let i = 0; i < CICLOS_POR_RONDA; i++) _timersLlamado.push(setTimeout(_cicloLlamado, inicio + i * PAUSA_ENTRE_CICLOS_MS));
    });
}

function init() {
    if (window.matchMedia('(display-mode: standalone)').matches ||
        /** @type {any} */ (window.navigator).standalone === true) {
        if (btnInstall) btnInstall.style.display = 'none';
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (btnInstall) {
            btnInstall.style.display = 'flex';
            _iniciarLlamado();
        }
    });

    window.addEventListener('appinstalled', () => {
        _detenerLlamado();
        if (btnInstall) btnInstall.style.display = 'none';
        deferredPrompt = null;
        EstadoApp._notify().mostrarToast('¡App instalada con éxito!', 'success');
    });
}

async function instalarApp() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
}

function bindEventos() {
    $('btn-install')?.addEventListener('click', () => { _detenerLlamado(); instalarApp(); });
    ['pointerenter', 'focus'].forEach(ev => $('btn-install')?.addEventListener(ev, _detenerLlamado));
}

// Mínimo entre búsquedas de versión nueva al volver a la app (el navegador por sí solo revisa poco si la PWA queda abierta en segundo plano)
const BUSQUEDA_MIN_MS = 60 * 1000;
// Con la pestaña a la vista y sin recargar (típico en PC) tampoco hay otra revisión: se busca cada tanto
const BUSQUEDA_PERIODICA_MS = 15 * 60 * 1000;

// Hay una versión instalada y está llegando otra (se avisa y se informa el avance). No depende de que la página esté controlada por el worker:
// tras una recarga forzada (Ctrl+Shift+R) la página queda sin controlador aunque haya una versión instalada, y no por eso deja de ser una actualización
let _actualizando = false;

function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // El worker informa cuánto lleva descargado de la versión nueva. Solo se avisa si ya había una instalada (no en la primera visita).
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (!_actualizando) return;
        const datos = e.data;
        if (datos?.tipo === 'sw-progreso') AvisoActualizacion.progreso(datos.progreso);
        else if (datos?.tipo === 'sw-error') AvisoActualizacion.error();
    });

    const _registrar = () => {
        navigator.serviceWorker.register(urlScriptConfiable('./sw.js'))
            .then(registration => {
                registration.addEventListener('updatefound', () => {
                    const nuevo = registration.installing;
                    // sin versión activa es la primera instalación: no hay nada que avisar
                    if (!nuevo || !registration.active) return;
                    _actualizando = true;
                    // aviso inmediato: ya se sabe que hay una versión nueva aunque todavía se esté descargando
                    AvisoActualizacion.iniciar();
                    nuevo.addEventListener('statechange', () => {
                        if (nuevo.state === 'installed') { _actualizando = false; AvisoActualizacion.listo(); }
                        else if (nuevo.state === 'redundant') { _actualizando = false; AvisoActualizacion.error(); }
                    });
                });
                _buscarActualizacionAlVolver(registration);
            })
            .catch(err => console.error('❌ Error SW:', err));
    };
    // Con una versión ya instalada se registra enseguida (no hace falta esperar a que cargue toda la página para detectar una nueva);
    // en la primera visita se espera al load para no competir con la carga inicial.
    if (navigator.serviceWorker.controller || document.readyState === 'complete') {
        _registrar();
    } else {
        window.addEventListener('load', _registrar);
    }
}

function _buscarActualizacionAlVolver(registration) {
    let ultima = Date.now();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - ultima < BUSQUEDA_MIN_MS) return;
        ultima = Date.now();
        registration.update().catch(() => { });
    });
    setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        ultima = Date.now();
        registration.update().catch(() => { });
    }, BUSQUEDA_PERIODICA_MS);
}

export const InstaladorPWA = {
    bindEventos,
    registrarServiceWorker,
    init
};
