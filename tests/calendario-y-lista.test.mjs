import test from 'node:test';
import assert from 'node:assert/strict';

// DOM mínimo: cada id devuelve siempre el mismo elemento, para poder mirar el estado del selector de meses entre renders.
const noop = () => { };
const fakeEl = () => ({
    style: { setProperty: noop, removeProperty: noop },
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    oyentes: {},
    addEventListener(tipo, fn) { (this.oyentes[tipo] ??= []).push(fn); },
    disparar(tipo) { (this.oyentes[tipo] ?? []).forEach(fn => fn({})); },
    removeEventListener: noop,
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    children: [],
    appendChild: noop,
    append: noop,
    replaceChildren: noop,
    insertBefore: noop,
    remove: noop,
    setAttribute: noop,
    removeAttribute: noop,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    focus: noop,
    blur: noop,
    contains: () => false,
    closest: () => null,
    cloneNode: () => fakeEl(),
    parentNode: { dataset: {}, addEventListener: noop, appendChild: noop },
    value: '',
    textContent: '',
});
const elementos = new Map();
const porId = id => {
    if (!elementos.has(id)) elementos.set(id, fakeEl());
    return elementos.get(id);
};

globalThis.window = globalThis;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '0ms', transitionDuration: '0s' });
globalThis.DOMParser = class {
    parseFromString() {
        return {
            documentElement: { tagName: 'svg', querySelectorAll: () => [], attributes: [], outerHTML: '<svg></svg>' },
            querySelector: () => null,
            querySelectorAll: () => [],
        };
    }
};
globalThis.matchMedia = () => ({ matches: true, addEventListener: noop });   // movimiento reducido: las animaciones aplican el cambio enseguida
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
};
globalThis.requestAnimationFrame = fn => { fn(0); return 0; };
globalThis.document = {
    readyState: 'complete',
    body: fakeEl(),
    documentElement: fakeEl(),
    getElementById: porId,
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    createElement: () => fakeEl(),
    createElementNS: () => fakeEl(),
    createDocumentFragment: () => fakeEl(),
    addEventListener: noop,
};

test('El reloj de la tarjeta no cierra el selector de meses; un render normal sí', async () => {
    const { TarjetaFichaje } = await import('../src/ui/tarjeta-fichaje.js');
    const { Calendario } = await import('../src/ui/calendario.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    Calendario.setVistaHistoricoCalendario(true);

    // Abierto hace rato: ya pasó la protección de 4 s de _selectorMesesProtegido
    const selector = porId('calendario-selector-meses');
    selector.style.display = 'grid';

    TarjetaFichaje.actualizarUI(null, true);   // tick del reloj
    await new Promise(r => setTimeout(r, 20));
    assert.equal(selector.style.display, 'grid', 'el tick no debe cerrarlo');

    TarjetaFichaje.actualizarUI();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(selector.style.display, 'none', 'un render normal lo cierra');
});

test('El selector de meses se cierra solo tras 15 s sin tocarlo, y cada interacción reinicia la cuenta', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 28, 10, 0) });
    const { Calendario } = await import('../src/ui/calendario.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    Calendario.bindEventos();
    const selector = porId('calendario-selector-meses');
    const titulo = porId('calendario-titulo-mes');

    selector.style.display = 'none';
    titulo.disparar('click');
    assert.equal(selector.style.display, 'grid', 'se abre');

    t.mock.timers.tick(14000);
    assert.equal(selector.style.display, 'grid', 'antes de los 15 s sigue abierto');

    selector.disparar('pointermove');
    t.mock.timers.tick(14000);
    assert.equal(selector.style.display, 'grid', 'la interacción reinició la cuenta');

    t.mock.timers.tick(1000);
    assert.equal(selector.style.display, 'none', 'pasados 15 s sin tocarlo se cierra');

    // Cerrado a mano no queda una cuenta pendiente que después cierre un selector abierto de nuevo
    titulo.disparar('click');
    t.mock.timers.tick(5000);
    titulo.disparar('click');
    assert.equal(selector.style.display, 'none');
    titulo.disparar('click');
    t.mock.timers.tick(14000);
    assert.equal(selector.style.display, 'grid', 'la cuenta empezó de nuevo al reabrir');
    t.mock.timers.tick(1000);
    assert.equal(selector.style.display, 'none');
});

test('La lista se dibuja solo si se ve: oculta queda pendiente y se dibuja al mostrarla', async (t) => {
    const { TarjetaFichaje } = await import('../src/ui/tarjeta-fichaje.js');
    const { Calendario } = await import('../src/ui/calendario.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    const lista = porId('lista-registros');
    const dibujos = t.mock.method(lista, 'replaceChildren', noop);
    const veces = () => dibujos.mock.callCount();
    Calendario.setVistaHistoricoCalendario(true);

    TarjetaFichaje.actualizarUI();
    assert.equal(veces(), 0, 'con el calendario a la vista no se dibuja');

    Calendario.toggleVistaHistorico();   // pasa a la lista
    assert.equal(veces(), 1, 'al mostrarla se dibuja lo pendiente');

    TarjetaFichaje.actualizarUI();
    assert.equal(veces(), 2, 'a la vista se dibuja en cada render');

    Calendario.toggleVistaHistorico();   // al calendario
    Calendario.toggleVistaHistorico();   // de nuevo a la lista, sin cambios en el medio
    assert.equal(veces(), 2, 'sin cambios no hace falta volver a dibujarla');

    Calendario.toggleVistaHistorico();
    TarjetaFichaje.actualizarUI();
    Calendario.toggleVistaHistorico();
    assert.equal(veces(), 3, 'un cambio con la lista oculta se dibuja una sola vez al mostrarla');
    Calendario.setVistaHistoricoCalendario(true);
});

test('El reloj solo redibuja el calendario cuando cambia el día; un render normal siempre', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 28, 10, 0) });
    const { TarjetaFichaje } = await import('../src/ui/tarjeta-fichaje.js');
    const { Calendario } = await import('../src/ui/calendario.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    Calendario.setVistaHistoricoCalendario(true);
    porId('calendario-selector-meses').style.display = 'none';
    const dibujos = t.mock.method(porId('calendario-grid'), 'replaceChildren', noop);
    const veces = () => dibujos.mock.callCount();

    TarjetaFichaje.actualizarUI();
    assert.equal(veces(), 1);

    TarjetaFichaje.actualizarUI(null, true);
    assert.equal(veces(), 1, 'el tick del mismo día no lo redibuja');

    TarjetaFichaje.actualizarUI();
    assert.equal(veces(), 2, 'un render normal sí');

    t.mock.timers.tick(24 * 60 * 60 * 1000);
    TarjetaFichaje.actualizarUI(null, true);
    assert.equal(veces(), 3, 'el primer tick del día siguiente lo redibuja');
    TarjetaFichaje.actualizarUI(null, true);
    assert.equal(veces(), 3);
});
