import { $ } from '../core/dom.js';
import { EstadoApp } from '../services/estado-app.js';
import { AvisoActualizacion } from './aviso-actualizacion.js';

// ====================================================================
// PWA INSTALLER MODULE
// ====================================================================
let deferredPrompt = null;
const btnInstall = $('btn-install');

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
        }
    });

    window.addEventListener('appinstalled', () => {
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
    $('btn-install')?.addEventListener('click', () => instalarApp());
}

// Mínimo entre búsquedas de versión nueva al volver a la app (el navegador por sí solo revisa poco si la PWA queda abierta en segundo plano)
const BUSQUEDA_MIN_MS = 60 * 1000;

function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // El worker informa cuánto lleva descargado de la versión nueva. Solo se avisa si ya había una instalada (no en la primera visita).
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (!navigator.serviceWorker.controller) return;
        const datos = e.data;
        if (datos?.tipo === 'sw-progreso') AvisoActualizacion.progreso(datos.progreso);
        else if (datos?.tipo === 'sw-error') AvisoActualizacion.error();
    });

    const _registrar = () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('SW registrado:', registration.scope);
                registration.addEventListener('updatefound', () => {
                    const nuevo = registration.installing;
                    if (!nuevo || !navigator.serviceWorker.controller) return;
                    // aviso inmediato: ya se sabe que hay una versión nueva aunque todavía se esté descargando
                    AvisoActualizacion.iniciar();
                    nuevo.addEventListener('statechange', () => {
                        if (nuevo.state === 'installed') AvisoActualizacion.listo();
                        else if (nuevo.state === 'redundant') AvisoActualizacion.error();
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
}

export const InstaladorPWA = {
    bindEventos,
    registrarServiceWorker,
    init,
    instalarApp
};
