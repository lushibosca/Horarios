import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ejecuta sw.js tal cual en un contexto aislado con un `self`, una caché y un `fetch` simulados,
// para comprobar la instalación (descarga de todos los archivos e informe de avance) sin un navegador.
const codigoSw = fs.readFileSync('sw.js', 'utf8');

function crearEntorno({ fallaEn = null } = {}) {
    /** @type {Record<string, Function>} */
    const manejadores = {};
    const mensajes = [];
    const guardados = [];
    const estado = { saltoLaEspera: false };
    const cliente = { postMessage: m => mensajes.push(m) };
    const self = {
        addEventListener: (tipo, fn) => { manejadores[tipo] = fn; },
        clients: { matchAll: async () => [cliente], claim: async () => { } },
        skipWaiting: async () => { estado.saltoLaEspera = true; },
        registration: { scope: 'http://localhost/' },
    };
    const contexto = vm.createContext({
        self,
        console: { error() { }, log() { } },
        URL,
        location: { origin: 'http://localhost' },
        Request: class { constructor(url, opciones) { this.url = url; this.cache = opciones?.cache; } },
        fetch: async (pedido) => ({ ok: pedido.url !== fallaEn, status: pedido.url === fallaEn ? 500 : 200, clone() { return this; } }),
        caches: {
            open: async () => ({ put: async (url) => { guardados.push(url); } }),
            keys: async () => [], delete: async () => true, match: async () => null,
        },
    });
    vm.runInContext(codigoSw, contexto);
    return { manejadores, mensajes, guardados, estado, urls: /** @type {string[]} */ (vm.runInContext('urlsToCache', contexto)) };
}

async function instalar(entorno) {
    let promesa;
    entorno.manejadores.install({ waitUntil: p => { promesa = p; } });
    await promesa;
}

test('Service Worker: la instalación guarda todos los archivos, informa el avance de 0 a 100 y toma el control', async () => {
    const entorno = crearEntorno();
    await instalar(entorno);

    assert.deepEqual([...entorno.guardados].sort(), [...entorno.urls].sort());
    const avances = entorno.mensajes.filter(m => m.tipo === 'sw-progreso').map(m => m.progreso);
    assert.equal(avances[0], 0);
    assert.equal(avances[avances.length - 1], 100);
    assert.ok(avances.every((p, i) => Number.isInteger(p) && (i === 0 || p > avances[i - 1])), 'el avance es entero y siempre crece');
    assert.equal(entorno.estado.saltoLaEspera, true);
    assert.equal(entorno.mensajes.some(m => m.tipo === 'sw-error'), false);
});

test('Service Worker: si falla un archivo, la instalación falla, avisa el error y no toma el control', async () => {
    const entorno = crearEntorno({ fallaEn: './src/main.js' });
    await assert.rejects(() => instalar(entorno));

    assert.equal(entorno.estado.saltoLaEspera, false, 'se conserva la versión anterior');
    assert.ok(entorno.mensajes.some(m => m.tipo === 'sw-error'));
    assert.equal(entorno.mensajes.some(m => m.progreso === 100), false);
});
