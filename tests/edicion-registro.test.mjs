import test from 'node:test';
import assert from 'node:assert/strict';

// Edición de un registro (modal "Editar") ejecutada en Node, sin DOM: el formulario es un puerto simulado.
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => { };
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => { } });

const { EstadoApp } = await import('../src/services/estado-app.js');
const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
const { EdicionRegistro } = await import('../src/services/edicion-registro.js');
GestorPerfiles.inicializar();

const reg = (id, fecha, entrada, salida, extra = {}) => {
    const r = { id, fecha, entrada, salida, tiempoFuera: null, horas: 0, minutos: 0, total: 0, objetivoHoras: 8, ...extra };
    EstadoApp._aplicarCalculoHoras(r, r.entrada, r.salida, r.tiempoFuera);
    return r;
};

/** Deja el estado con `registros`, el puerto del formulario devolviendo `form` y abre la edición de `id`. */
function editar(id, registros, form = {}) {
    const toasts = [];
    const estado = { cerrado: 0, poblado: null, referencia: undefined };
    let datosForm = null;
    EstadoApp.setHorasDiarias(8);
    EstadoApp.setEditandoId(null);
    EstadoApp._setRegistros(registros);
    EstadoApp.configurarNotificaciones({
        formularioEdicion: {
            leer: () => datosForm,
            poblar: (d) => { estado.poblado = d; },
            refrescarHintResumen: () => { },
            tieneCampoReferencia: () => true,
            escribirReferencia: (v) => { estado.referencia = v; },
            bloquearGuardar: () => 'btn-guardar',
            bloquearEliminar: () => 'btn-eliminar',
            liberarEliminar: () => { },
        },
        leerObjetivoEdicion: () => datosForm?.objetivo ?? NaN,
        mostrarToast: (m, t) => toasts.push([m, t]),
        cerrarEdicion: () => { estado.cerrado++; EstadoApp.setEditandoId(null); },
        restaurarBotonGuardarEdicion: () => { },
        setBloqueoEdicion: () => { }, abrirModal: () => { }, verificarBloqueoCredito: () => { },
        actualizarEstadoBotonTimerMain: () => { }, actualizarUI: () => { },
    });
    EdicionRegistro.editar(id);
    // el formulario arranca con lo que poblar() le cargó; cada test cambia solo lo que necesita
    const p = estado.poblado;
    datosForm = p ? {
        fecha: p.fecha, entrada: p.entrada, salida: p.salida, tiempoFuera: p.tiempoFuera, notas: p.notas,
        objetivo: p.objetivo, referencia: p.referencia, creditoActivo: p.creditoActivo, ...form
    } : null;
    return { toasts, estado };
}

test('Edición: abrir el registro carga el formulario con sus datos', () => {
    const { estado } = editar('r1', [reg('r1', '2026-10-20', '09:00', '17:00', { notas: 'Hola', tiempoFuera: '00:30' })]);
    assert.equal(EstadoApp.editandoId(), 'r1');
    assert.deepEqual(estado.poblado, {
        fecha: '2026-10-20', entrada: '09:00', salida: '17:00', tiempoFuera: '00:30', notas: 'Hola',
        objetivo: 8, esCompensatorio: false, referencia: '', creditoActivo: false,
    });
});

test('Edición: guardar con cambios actualiza horas y notas (normalizadas) y cierra el modal', async () => {
    const { toasts, estado } = editar('r1', [reg('r1', '2026-10-20', '09:00', '17:00')], { salida: '18:00', notas: ' Reunión <b> ' });
    await EdicionRegistro.guardar();
    const r = EstadoApp.registroPorId('r1');
    assert.equal(r.salida, '18:00');
    assert.equal(r.total, 9);
    assert.equal(r.notas, 'Reunión b');
    assert.deepEqual(toasts.at(-1), ['Registro actualizado', 'success']);
    assert.equal(estado.cerrado, 1);
});

test('Edición: sin cambios avisa y no toca el registro', async () => {
    const original = reg('r1', '2026-10-20', '09:00', '17:00');
    const { toasts, estado } = editar('r1', [original]);
    await EdicionRegistro.guardar();
    assert.deepEqual(toasts.at(-1), ['Sin cambios', 'info']);
    assert.equal(estado.cerrado, 1);
    assert.equal(EstadoApp.registroPorId('r1').total, 8);
});

test('Edición: rechaza mover el registro a una fecha que ya tiene otro', async () => {
    const { toasts, estado } = editar('r1', [reg('r1', '2026-10-20', '09:00', '17:00'), reg('r2', '2026-10-21', '09:00', '17:00')], { fecha: '2026-10-21' });
    await EdicionRegistro.guardar();
    assert.deepEqual(toasts.at(-1), ['Ya existe otro registro para esa fecha', 'error']);
    assert.equal(estado.cerrado, 0);
    assert.equal(EstadoApp.registroPorId('r1').fecha, '2026-10-20');
});

test('Edición: rechaza un tiempo fuera mayor al tiempo trabajado', async () => {
    const { toasts } = editar('r1', [reg('r1', '2026-10-20', '09:00', '17:00')], { tiempoFuera: '09:00' });
    await EdicionRegistro.guardar();
    assert.deepEqual(toasts.at(-1), ['El tiempo fuera no puede superar el tiempo efectivo', 'error']);
    assert.equal(EstadoApp.registroPorId('r1').tiempoFuera, null);
});

test('Edición: con salida temprana activa guarda el crédito que falta para el objetivo', async () => {
    const { toasts } = editar('r1', [reg('r1', '2026-10-20', '09:00', '15:00')], { creditoActivo: true });
    await EdicionRegistro.guardar();
    const r = EstadoApp.registroPorId('r1');
    assert.equal(r.credito, '02:00');
    assert.equal(r.total, 8);
    assert.deepEqual(toasts.at(-1), ['Guardado con Salida Temprana (+02:00)', 'success']);
});

test('Edición: vaciar entrada y salida elimina el registro', async () => {
    const { toasts, estado } = editar('r1', [reg('r1', '2026-10-20', '09:00', '17:00')], { entrada: '', salida: '' });
    await EdicionRegistro.guardar();
    assert.equal(EstadoApp.registros().length, 0);
    assert.deepEqual(toasts.at(-1), ['Registro eliminado (vacío)', 'info']);
    assert.equal(estado.cerrado, 1);
});

test('Edición: el día a compensar no puede ser posterior al compensatorio ni un día sin excedente', async () => {
    const comp = () => reg('c1', '2026-10-22', '18:18', '18:18');
    let { toasts } = editar('c1', [comp(), reg('r1', '2026-10-23', '09:00', '17:00')], { referencia: '2026-10-23' });
    await EdicionRegistro.guardar();
    assert.deepEqual(toasts.at(-1), ['El día a compensar no puede ser posterior al compensatorio', 'error']);

    ({ toasts } = editar('c1', [comp(), reg('r1', '2026-10-20', '09:00', '17:00')], { referencia: '2026-10-20' }));
    await EdicionRegistro.guardar();
    assert.deepEqual(toasts.at(-1), ['Ese día no tiene excedente disponible (o ya fue usado por otro compensatorio)', 'error']);
    assert.equal(EstadoApp.registroPorId('c1').referenciaCompensatorio, undefined);
});

test('Edición: referencia automática del compensatorio y limpiarla', () => {
    const regs = [reg('c1', '2026-10-22', '18:18', '18:18'), reg('r1', '2026-10-20', '08:00', '18:00')];   // r1: 2 h de excedente
    let { estado } = editar('c1', regs);
    EdicionRegistro.pegarReferencia();
    assert.equal(estado.referencia, '2026-10-20');

    ({ estado } = editar('c1', regs, { referencia: '2026-10-20' }));
    EdicionRegistro.pegarReferencia();
    assert.equal(estado.referencia, '');
});

test('Edición: eliminar desde el modal borra el registro y cierra', async () => {
    const { toasts, estado } = editar('r1', [reg('r1', '2026-10-20', '09:00', '17:00'), reg('r2', '2026-10-21', '09:00', '17:00')]);
    await EdicionRegistro.eliminar();
    assert.deepEqual(EstadoApp.registros().map(r => r.id), ['r2']);
    assert.deepEqual(toasts.at(-1), ['Registro eliminado', 'success']);
    assert.equal(estado.cerrado, 1);
});

test('Edición: el día a compensar no puede estar asignado ya a otro compensatorio', async () => {
    const regs = [
        reg('r1', '2026-10-20', '08:00', '18:00'),                                          // 2 h de excedente
        reg('c1', '2026-10-22', '18:18', '18:18', { referenciaCompensatorio: '2026-10-20' }),
        reg('c2', '2026-10-23', '18:18', '18:18'),
    ];
    const { toasts } = editar('c2', regs, { referencia: '2026-10-20' });
    await EdicionRegistro.guardar();
    assert.match(toasts.at(-1)[0], /^Ese día ya está asignado al compensatorio del /);
    assert.equal(EstadoApp.registroPorId('c2').referenciaCompensatorio, undefined);
});
