import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ejecuta sw.js tal cual en un contexto aislado con un `self`, una caché y un `fetch` simulados,
// para comprobar la instalación (descarga de todos los archivos e informe de avance) sin un navegador.
const codigoSw = fs.readFileSync('sw.js', 'utf8');

function crearEntorno({ fallaEn = null, sinRed = false, enCache = [] } = {}) {
    /** @type {Record<string, Function>} */
    const manejadores = {};
    const mensajes = [];
    const guardados = [];
    const notificaciones = [];
    const estado = { saltoLaEspera: false };
    const cliente = { postMessage: m => mensajes.push(m) };
    const self = {
        addEventListener: (tipo, fn) => { manejadores[tipo] = fn; },
        clients: { matchAll: async () => [cliente], claim: async () => { } },
        skipWaiting: async () => { estado.saltoLaEspera = true; },
        registration: { scope: 'http://localhost/app/', showNotification: async (titulo, opciones) => { notificaciones.push([titulo, opciones.body]); } },
    };
    const contexto = vm.createContext({
        self,
        console: { error() { }, log() { } },
        URL,
        location: { origin: 'http://localhost' },
        Request: class { constructor(url, opciones) { this.url = url; this.cache = opciones?.cache; } },
        Response: { error: () => ({ type: 'error' }) },
        fetch: async (pedido) => {
            if (sinRed) throw new TypeError('Failed to fetch');
            return { ok: pedido.url !== fallaEn, status: pedido.url === fallaEn ? 500 : 200, clone() { return this; } };
        },
        caches: {
            open: async () => ({ put: async (url) => { guardados.push(url); } }),
            keys: async () => [], delete: async () => true,
            match: async (pedido) => (enCache.includes(typeof pedido === 'string' ? pedido : pedido.url) ? { type: 'cacheada', url: pedido.url ?? pedido } : null),
        },
    });
    vm.runInContext(codigoSw, contexto);
    return { manejadores, mensajes, guardados, notificaciones, estado, urls: /** @type {string[]} */ (vm.runInContext('urlsToCache', contexto)) };
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

test('Service Worker: un push con payload inesperado (null, número, texto) igual muestra la notificación por defecto', async () => {
    const entorno = crearEntorno();
    const push = async (data) => {
        let promesa;
        entorno.manejadores.push({ data, waitUntil: p => { promesa = p; } });
        await promesa;
    };
    const conJson = v => ({ json: () => v, text: () => String(v) });
    await push(conJson(null));
    await push(conJson(42));
    await push({ json: () => { throw new Error('no es JSON'); }, text: () => 'hola' });
    await push(conJson({ title: 'Ya podés irte', body: 'x'.repeat(500) }));
    assert.deepEqual(entorno.notificaciones.slice(0, 3), [
        ['Horarios', 'Se cumplió tu horario de hoy'],
        ['Horarios', 'Se cumplió tu horario de hoy'],
        ['Horarios', 'hola'],
    ]);
    assert.equal(entorno.notificaciones[3][0], 'Ya podés irte');
    assert.equal(entorno.notificaciones[3][1].length, 300);
});

test('Service Worker sin conexión: una navegación cae a index.html precacheado y otro recurso falla con Response.error()', async () => {
    const entorno = crearEntorno({ sinRed: true, enCache: ['./index.html'] });
    const responder = async (url, mode) => {
        let promesa;
        entorno.manejadores.fetch({ request: { method: 'GET', url, mode }, respondWith: p => { promesa = p; } });
        return promesa;
    };
    assert.equal((await responder('http://localhost/app/otra-pagina', 'navigate')).type, 'cacheada');
    assert.deepEqual(await responder('http://localhost/app/assets/icons/icon-512.png', 'no-cors'), { type: 'error' });
});
