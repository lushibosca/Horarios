import test from 'node:test';
import assert from 'node:assert/strict';
import {
    columnasDesdeOrden, tamanosDeColumnas, prepararColumnas, moverCard, esTamanosColumnasValidos, MAX_COLUMNAS
} from '../src/services/orden-cards.js';

const ORDEN = ['registrar', 'estadisticas', 'historico'];

test('Columnas: sin tamaños guardados se usa el reparto por defecto (todas a la izquierda salvo la última, que va a la derecha)', () => {
    assert.deepEqual(columnasDesdeOrden(ORDEN), [['registrar', 'estadisticas'], ['historico']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, [2, 1]), [['registrar', 'estadisticas'], ['historico']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, [1, 1, 1]), [['registrar'], ['estadisticas'], ['historico']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, [0, 3]), [ORDEN]);   // una columna vacía no existe
    // tamaños que no suman el total (ej. una versión con otra cantidad de tarjetas) o inválidos: reparto por defecto
    assert.deepEqual(columnasDesdeOrden(ORDEN, [4]), [['registrar', 'estadisticas'], ['historico']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, 'x'), [['registrar', 'estadisticas'], ['historico']]);
});

test('Columnas: validación de tamaños (hasta 3, enteros; la primera puede ser 0 por compatibilidad)', () => {
    assert.equal(esTamanosColumnasValidos([1, 2]), true);
    assert.equal(esTamanosColumnasValidos([0, 3]), true);
    assert.equal(esTamanosColumnasValidos([1, 0]), false);
    assert.equal(esTamanosColumnasValidos([1, 1, 1, 1]), false);
    assert.equal(esTamanosColumnasValidos([1.5, 1]), false);
    assert.equal(esTamanosColumnasValidos([]), false);
    assert.equal(esTamanosColumnasValidos([1, 2], 4), false);
    assert.equal(MAX_COLUMNAS, 3);
});

test('Columnas: mover una tarjeta a otra columna, entre dos tarjetas o al final', () => {
    const base = [['registrar'], ['estadisticas', 'historico']];
    assert.deepEqual(moverCard(base, 'registrar', 1, 'historico'), [['estadisticas', 'registrar', 'historico']]);
    assert.deepEqual(moverCard(base, 'historico', 0), [['registrar', 'historico'], ['estadisticas']]);
    assert.deepEqual(moverCard(base, 'historico', 1, 'estadisticas'), [['registrar'], ['historico', 'estadisticas']]);
    assert.equal(moverCard(base, 'estadisticas', 1, 'historico'), null);   // ya está ahí: sin cambio
});

test('Columnas: soltar en el hueco de la derecha abre una columna nueva, y una columna vacía desaparece', () => {
    const base = [['registrar'], ['estadisticas', 'historico']];
    const tres = moverCard(base, 'historico', 2);
    assert.deepEqual(tres, [['registrar'], ['estadisticas'], ['historico']]);
    assert.deepEqual(tamanosDeColumnas(tres), [1, 1, 1]);
    // la única tarjeta de una columna al hueco de al lado no cambia nada (la columna se vacía y se vuelve a abrir)
    assert.equal(moverCard(tres, 'historico', 3), null);
    // vaciar una columna del medio la quita
    assert.deepEqual(moverCard(tres, 'estadisticas', 0), [['registrar', 'estadisticas'], ['historico']]);
    // la primera columna también desaparece si se vacía: la segunda pasa a ser la primera
    assert.deepEqual(moverCard([['registrar'], ['estadisticas', 'historico']], 'registrar', 1), [['estadisticas', 'historico', 'registrar']]);
});

test('Columnas: nunca más de 3 columnas con tarjetas visibles', () => {
    const tres = [['registrar'], ['estadisticas'], ['historico']];
    assert.equal(moverCard(tres, 'historico', 3), null);
    assert.equal(moverCard([['registrar', 'estadisticas'], ['historico']], 'estadisticas', 2, null, { max: 2 }), null);
    // una columna de tarjetas ocultas no cuenta
    const visibles = new Set(['registrar', 'estadisticas']);
    assert.deepEqual(moverCard([['registrar'], ['estadisticas'], ['historico']], 'registrar', 3, null, { max: 3, visibles }), [['estadisticas'], ['historico'], ['registrar']]);
});

test('Columnas: preparar para dibujar funde columnas sin tarjetas visibles y respeta el máximo', () => {
    const cols = [['registrar'], ['estadisticas'], ['historico']];
    assert.deepEqual(prepararColumnas(cols), cols);
    assert.deepEqual(prepararColumnas(cols, 2), [['registrar'], ['estadisticas', 'historico']]);
    assert.deepEqual(prepararColumnas(cols, 3, new Set(['registrar', 'historico'])), [['registrar', 'estadisticas'], ['historico']]);
    // una primera columna sin tarjetas visibles se funde con la siguiente
    assert.deepEqual(prepararColumnas(cols, 3, new Set(['estadisticas', 'historico'])), [['registrar', 'estadisticas'], ['historico']]);
    // no modifica lo que recibe
    assert.deepEqual(cols, [['registrar'], ['estadisticas'], ['historico']]);
});

test('Columnas: en escritorio un movimiento nunca deja una sola columna', () => {
    const opc = { exigirDosColumnas: true };
    // la única tarjeta de una columna no puede pasar a la otra (quedaría una sola)
    assert.equal(moverCard([['registrar', 'estadisticas'], ['historico']], 'historico', 0, null, opc), null);
    // pero sí se puede cambiar de lugar dentro de la derecha o pasar de una columna derecha a otra
    assert.deepEqual(moverCard([['registrar'], ['estadisticas', 'historico']], 'historico', 1, 'estadisticas', opc), [['registrar'], ['historico', 'estadisticas']]);
    assert.deepEqual(moverCard([['registrar'], ['estadisticas'], ['historico']], 'historico', 1, null, opc), [['registrar'], ['estadisticas', 'historico']]);
    // las tarjetas ocultas no cuentan: si 'historico' está oculta, la derecha tiene una sola visible
    const visibles = new Set(['registrar', 'estadisticas']);
    assert.equal(moverCard([['registrar'], ['estadisticas', 'historico']], 'estadisticas', 0, null, { ...opc, visibles }), null);
    // si ya había una sola columna, se puede mover libremente
    assert.deepEqual(moverCard([['registrar', 'estadisticas']], 'estadisticas', 0, 'registrar', opc), [['estadisticas', 'registrar']]);
    // sin la restricción (móvil) se permite
    assert.deepEqual(moverCard([['registrar', 'estadisticas'], ['historico']], 'historico', 0), [['registrar', 'estadisticas', 'historico']]);
});

test('Columnas: tamaños guardados antes de que la tarjeta de estado fuera movible suman una al primer grupo', () => {
    const orden = ['estado', 'registrar', 'estadisticas', 'historico'];
    assert.deepEqual(columnasDesdeOrden(orden, [1, 2]), [['estado', 'registrar'], ['estadisticas', 'historico']]);
    assert.deepEqual(columnasDesdeOrden(orden, [1, 1, 1]), [['estado', 'registrar'], ['estadisticas'], ['historico']]);
    assert.deepEqual(columnasDesdeOrden(orden, [0, 3]), [['estado'], ['registrar', 'estadisticas', 'historico']]);
    assert.deepEqual(columnasDesdeOrden(orden), [['estado', 'registrar', 'estadisticas'], ['historico']]);
});
