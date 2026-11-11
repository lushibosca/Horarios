import { $ } from '../core/dom.js';
import { EstadoApp } from '../services/estado-app.js';
import { AvisoActualizacion } from './aviso-actualizacion.js';
import { urlScriptConfiable } from '../core/html.js';
import { Movimiento } from '../core/movimiento.js';
import { IconosAnimados } from './iconos-animados.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
// PWA INSTALLER MODULE
// ====================================================================
let deferredPrompt = null;
const btnInstall = $('btn-install');

// Llamado de atención del botón de instalar (solo cuando el navegador permite instalar): el destello de barrido y onda (el mismo del día de hoy del calendario)
// y la flecha que rebota. Pocas veces, para que no moleste (3 al abrir); se corta si el usuario se acerca al botón.
const INICIO_LLAMADO_MS = 1500;
const CICLOS_LLAMADO = 3;
const PAUSA_ENTRE_CICLOS_MS = 2000;
/** @type {ReturnType<typeof setTimeout>[]} */
let _timersLlamado = [];

function _detenerLlamado() {
    _timersLlamado.forEach(clearTimeout);
    _timersLlamado = [];
    btnInstall?.classList.remove('destello-instalar');
}

function _cicloLlamado() {
    if (!btnInstall) return;
    Animaciones._flashElemento(btnInstall, 'destello-instalar');
    IconosAnimados.rebotarFlecha(btnInstall);
}

function _iniciarLlamado() {
    _detenerLlamado();
    if (Movimiento.reducido()) return;
    for (let i = 0; i < CICLOS_LLAMADO; i++) _timersLlamado.push(setTimeout(_cicloLlamado, INICIO_LLAMADO_MS + i * PAUSA_ENTRE_CICLOS_MS));
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

    // Sigue a un worker nuevo hasta que queda activo. La descarga de archivos no ocurre dentro de su `install` (Chromium la limita
    // a 3 pedidos simultáneos ahí, ver sw.js) sino después: al quedar instalado (en espera) se le pide con 'sw-descargar',
    // y recién cuando termina se activa. Por eso "lista" es al activarse, no al instalarse.
    /** @param {ServiceWorkerRegistration} registration @param {ServiceWorker} worker @param {boolean} avisar */
    const _seguirVersionNueva = (registration, worker, avisar) => {
        if (avisar) {
            _actualizando = true;
            // aviso inmediato: ya se sabe que hay una versión nueva aunque todavía se esté descargando
            AvisoActualizacion.iniciar();
        }
        const pedirDescarga = () => worker.postMessage({ tipo: 'sw-descargar' });
        if (worker.state === 'installed') pedirDescarga();
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') pedirDescarga();
            if (!avisar) return;
            if (worker.state === 'activated') { _actualizando = false; AvisoActualizacion.listo(); }
            // descartado: es un error salvo que lo haya reemplazado una versión todavía más nueva (esa tiene su propio seguimiento)
            else if (worker.state === 'redundant' && !registration.installing && !registration.waiting) { _actualizando = false; AvisoActualizacion.error(); }
        });
    };

    const _registrar = () => {
        navigator.serviceWorker.register(urlScriptConfiable('./sw.js'))
            .then(registration => {
                registration.addEventListener('updatefound', () => {
                    const nuevo = registration.installing;
                    if (!nuevo) return;
                    // sin versión activa es la primera instalación: se pide la descarga pero no hay nada que avisar
                    _seguirVersionNueva(registration, nuevo, !!registration.active);
                });
                // Quedó una versión en espera de una apertura anterior (la descarga se cortó o falló): se retoma
                if (registration.waiting) _seguirVersionNueva(registration, registration.waiting, !!registration.active);
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
