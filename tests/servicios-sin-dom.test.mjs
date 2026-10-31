import test from 'node:test';
import assert from 'node:assert/strict';

// Sin `document`: si un servicio lo toca, este archivo falla al ejecutarse.
const store = new Map();
globalThis.Storage = function () { };
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
};
globalThis.window = globalThis;
globalThis.addEventListener = () => { };
globalThis.requestAnimationFrame = () => 0;
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => { } });

test('GestionDatos.agregarRegistro ficha una entrada usando solo el puerto de formulario (sin DOM)', async () => {
    const { GestionDatos: D } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { TiempoUtils } = await import('../src/core/tiempo-utils.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();

    const toasts = [];
    const escrito = {};
    EstadoApp.configurarNotificaciones({
        formularioRegistro: {
            leer: () => ({ fecha: TiempoUtils.obtenerFechaHoy(), entrada: '08:30', salida: '' }),
            escribir: campos => Object.assign(escrito, campos),
            bloquearBoton: () => ({ id: 'btn-simulado' }),
        },
        avisarFichaje: (msg, tipo) => toasts.push([msg, tipo]),
        aplicarFeedbackCampos: () => { },
        resetearBoton: () => { },
        animarExitoFichaje: () => { },
        actualizarUI: () => { },
        mostrarToast: () => { },
        forzarVista: (_vista, fn) => fn(),
    });
    EstadoApp._setRegistros([]);

    await D.agregarRegistro();

    const registros = EstadoApp.registros();
    assert.equal(registros.length, 1);
    assert.equal(registros[0].entrada, '08:30');
    assert.equal(registros[0].salida, null);
    assert.deepEqual(escrito.entrada, '');
    assert.equal(toasts.at(-1)?.[1], 'success');
});

test('GestionDatos.agregarRegistro rechaza una fecha inválida y avisa sin crear registros', async () => {
    const { GestionDatos: D } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');

    const avisos = [];
    const errores = [];
    EstadoApp.configurarNotificaciones({
        formularioRegistro: {
            leer: () => ({ fecha: 'no-es-fecha', entrada: '08:30', salida: '' }),
            escribir: () => { },
            bloquearBoton: () => ({}),
        },
        limpiarError: () => { },
        mostrarError: id => errores.push(id),
        avisarFichaje: msg => avisos.push(msg),
    });
    EstadoApp._setRegistros([]);

    await D.agregarRegistro();

    assert.equal(EstadoApp.registros().length, 0);
    assert.deepEqual(errores, ['fecha']);
    assert.deepEqual(avisos, ['Verificá los campos']);
});

test('RecordatorioPush.enviarNotificacionPrueba pide permiso y envía el mensaje al Service Worker', async () => {
    const { RecordatorioPush } = await import('../src/services/recordatorio-push.js');
    const mensajes = [];
    globalThis.Notification = { permission: 'default', requestPermission: async () => 'granted' };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { serviceWorker: { ready: Promise.resolve({ active: { postMessage: m => mensajes.push(m) } }) } },
    });

    assert.equal(await RecordatorioPush.enviarNotificacionPrueba(5000), 'ok');
    assert.deepEqual(mensajes, [{ tipo: 'notificacion-prueba', demoraMs: 5000 }]);

    globalThis.Notification = { permission: 'denied', requestPermission: async () => 'denied' };
    assert.equal(await RecordatorioPush.enviarNotificacionPrueba(), 'denegado');
    assert.equal(mensajes.length, 1);
});

test('RecordatorioPush.calcularTarget ubica la entrada en la fecha del registro (cruce de medianoche)', async () => {
    const { RecordatorioPush } = await import('../src/services/recordatorio-push.js');
    // Entrada de ayer 18:40, jornada de 7 h: el aviso cae a la 01:40 de hoy (menos el margen del cron de 1 min)
    const esperado = new Date(2026, 9, 30, 18, 40).getTime() + 7 * 3600 * 1000 - 60 * 1000;
    assert.equal(RecordatorioPush.calcularTarget('2026-10-30', '18:40', 7), esperado);
    assert.equal(new Date(esperado).getDate(), 31);
});

test('GestionDatos._registroAbiertoParaPush toma la jornada abierta de ayer si hoy no tiene registro', async (t) => {
    const { GestionDatos: D } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const reg = (fecha, entrada, salida) => ({ id: `${fecha}-${entrada}`, fecha, entrada, salida, objetivoHoras: 7 });

    // 31/10/2026 00:26 (sábado): la jornada del viernes 30 sigue abierta
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 0, 26) });

    EstadoApp._setRegistros([reg('2026-10-30', '18:40', null)]);
    assert.equal(D._registroAbiertoParaPush('2026-10-31')?.fecha, '2026-10-30');

    // Ayer ya tiene salida: nada para avisar
    EstadoApp._setRegistros([reg('2026-10-30', '18:40', '23:00')]);
    assert.equal(D._registroAbiertoParaPush('2026-10-31'), null);

    // Hoy ya tiene su propio registro cerrado: no se arrastra el de ayer
    EstadoApp._setRegistros([reg('2026-10-30', '18:40', null), reg('2026-10-31', '08:00', '09:00')]);
    assert.equal(D._registroAbiertoParaPush('2026-10-31'), null);

    // Hoy (sábado) tiene uno abierto, pero no es día hábil: no se avisa
    EstadoApp._setRegistros([reg('2026-10-31', '08:00', null)]);
    assert.equal(D._registroAbiertoParaPush('2026-10-31'), null);

    // Abierto hace más de 24 h: se considera olvidado
    EstadoApp._setRegistros([reg('2026-10-30', '00:10', null)]);
    assert.equal(D._registroAbiertoParaPush('2026-10-31'), null);
});

test('GestionDatos.agregarRegistro: cerrar la jornada abierta de ayer la retiene en la tarjeta; cerrar la de hoy no', async (t) => {
    const { GestionDatos: D } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const reg = (fecha, entrada, salida) => ({ id: `${fecha}-${entrada}`, fecha, entrada, salida, tiempoFuera: null, objetivoHoras: 7 });

    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 0, 26) });
    const retenidos = [];
    EstadoApp.configurarNotificaciones({
        formularioRegistro: {
            leer: () => ({ fecha: '2026-10-31', entrada: '', salida: '' }),
            escribir: () => { },
            bloquearBoton: () => ({ id: 'btn-simulado' }),
        },
        avisarFichaje: () => { },
        retenerRegistroAyer: id => retenidos.push(id),
    });

    // 00:26: fichar sin entrada cierra la jornada abierta de ayer
    EstadoApp._setRegistros([reg('2026-10-30', '18:40', null)]);
    await D.agregarRegistro();
    assert.equal(EstadoApp.registros()[0].salida, '00:26');
    assert.deepEqual(retenidos, ['2026-10-30-18:40']);

    // El registro de hoy se cierra por el circuito normal, sin retención
    retenidos.length = 0;
    EstadoApp._setRegistros([reg('2026-10-31', '00:10', null)]);
    await D.agregarRegistro();
    assert.equal(EstadoApp.registros()[0].salida, '00:26');
    assert.deepEqual(retenidos, []);
});

test('EstadisticasPeriodo calcula promedios, regularidad y conteos de un rango sin DOM', async () => {
    const { EstadisticasPeriodo: E } = await import('../src/services/estadisticas-periodo.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    EstadoApp.setHorasDiarias(0);

    assert.equal(E.desviacionEstandar([480]), null);
    assert.equal(E.calcularRegularidad(null), '--:--');
    assert.equal(E.calcularRegularidad(15), 'Alta');
    assert.equal(E.calcularRegularidad(30), 'Media');
    assert.equal(E.calcularRegularidad(60), 'Baja');

    const vacio = E.calcularEstadisticasRango([]);
    assert.equal(vacio.diasTrabajados, 0);
    assert.equal(vacio.entradaPromedio, '--:--');

    const stats = E.calcularEstadisticasRango([
        { id: 1, fecha: '2026-10-05', entrada: '08:00', salida: '16:00', total: 8, tiempoFuera: '00:30' },
        { id: 2, fecha: '2026-10-06', entrada: '09:00', salida: '17:00', total: 8 },
    ]);
    assert.equal(stats.diasTrabajados, 2);
    assert.equal(stats.entradaPromedio, '08:30');
    assert.equal(stats.salidaPromedio, '16:30');
    assert.equal(stats.regularidadJornada, 'Alta');
    assert.equal(stats.regularidadEntrada, 'Media');
});

test('EstadoTarjeta.calcularEstadoCard calcula el día y respeta el registro retenido que inyecta la UI', async () => {
    const { EstadoTarjeta } = await import('../src/services/estado-tarjeta.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { TiempoUtils } = await import('../src/core/tiempo-utils.js');
    EstadoApp.setHorasDiarias(7);
    EstadoApp.setDiasHabiles([1, 2, 3, 4, 5]);
    EstadoApp.setIgnorarTiempoFuera(false);

    const hoy = TiempoUtils.obtenerFechaHoy();
    const ayer = TiempoUtils.formatearFechaLocal(new Date(Date.now() - 86400000));
    const regHoy = { id: 'h', fecha: hoy, entrada: '08:00', salida: '15:30', total: 7.5 };
    const regAyer = { id: 'a', fecha: ayer, entrada: '09:00', salida: '17:00', total: 8 };
    EstadoApp._setRegistros([regAyer, regHoy]);

    const est = EstadoTarjeta.calcularEstadoCard();
    assert.equal(est.hoy, hoy);
    assert.equal(est.esRetenido, false);
    assert.equal(est.tiempoHoy, 7.5);

    EstadoApp._setRegistros([regAyer]);
    const retenido = EstadoTarjeta.calcularEstadoCard({ resolverRetenido: () => regAyer });
    assert.equal(retenido.esRetenido, true);
    assert.equal(retenido.hoy, ayer);
    assert.equal(retenido.tiempoHoy, 8);
});

test('EstadoTarjeta.calcularEstadoCard arma diasSemana: sin registro, especial, cerrado y activo en la semana en curso', async (t) => {
    const { EstadoTarjeta } = await import('../src/services/estado-tarjeta.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    EstadoApp.setHorasDiarias(7);
    EstadoApp.setDiasHabiles([1, 2, 3, 4, 5]);
    EstadoApp.setIgnorarTiempoFuera(false);

    // viernes 30/10/2026 14:00: semana del 26/10 al 01/11
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 30, 14, 0) });
    const reg = (fecha, entrada, salida, total) => ({ id: fecha, fecha, entrada, salida, total, objetivoHoras: 7 });
    EstadoApp._setRegistros([
        reg('2026-10-26', '09:00', '16:00', 7),   // lunes cumplido
        reg('2026-10-27', '11:11', '11:11', 0),   // martes: licencia (día especial)
        // miércoles 28 sin registro
        reg('2026-10-29', '09:00', '12:00', 3),   // jueves con faltante
        reg('2026-10-30', '13:00', null, 0)       // viernes: jornada abierta
    ]);

    const { diasSemana } = EstadoTarjeta.calcularEstadoCard();
    // solo los días laborables: sábado y domingo sin registro no aparecen
    assert.deepEqual(diasSemana.map(d => [d.fecha, d.estado]), [
        ['2026-10-26', 'cerrado'],
        ['2026-10-27', 'especial'],
        ['2026-10-28', 'sin-registro'],
        ['2026-10-29', 'cerrado'],
        ['2026-10-30', 'activo']
    ]);
    assert.equal(diasSemana[1].especial, 'purple');
    // resultado de los días cerrados: el lunes cumplió, el jueves (3 h de 7) faltó; los demás estados no lo llevan
    assert.deepEqual(diasSemana.map(d => d.cumplimiento), ['cumplido', undefined, undefined, 'faltante', undefined]);
    assert.equal(diasSemana[0].total, 7);
    assert.equal(diasSemana[4].activo, true);
    assert.ok(diasSemana[4].total > 0 && diasSemana[4].total < 7, 'el día abierto cuenta lo trabajado hasta ahora');

    // un día con faltante que cubre el saldo de otro con exceso queda como 'cubierto'
    EstadoApp._setRegistros([
        reg('2026-10-26', '09:00', '18:00', 9),   // lunes: 2 h de exceso
        reg('2026-10-29', '09:00', '14:00', 5)    // jueves: le faltan 2 h
    ]);
    const conSaldo = EstadoTarjeta.calcularEstadoCard().diasSemana;
    assert.equal(conSaldo.find(d => d.fecha === '2026-10-26').cumplimiento, 'cumplido');
    assert.equal(conSaldo.find(d => d.fecha === '2026-10-29').cumplimiento, 'cubierto');

    // un día remoto cuenta su objetivo completo (no queda como faltante) y una jornada pasada sin salida no se da por cerrada
    EstadoApp._setRegistros([
        reg('2026-10-27', '09:00', null, 0),        // martes: entrada sin salida
        reg('2026-10-28', '16:16', '16:16', 0)      // miércoles: remoto
    ]);
    const conRemoto = EstadoTarjeta.calcularEstadoCard().diasSemana;
    const martes = conRemoto.find(d => d.fecha === '2026-10-27');
    const miercoles = conRemoto.find(d => d.fecha === '2026-10-28');
    assert.equal(martes.estado, 'sin-salida');
    assert.equal(martes.cumplimiento, undefined);
    assert.equal(miercoles.estado, 'cerrado');
    assert.equal(miercoles.total, 7);
    assert.equal(miercoles.cumplimiento, 'cumplido');

    // martes 27/10 10:00: hoy sin registro todavía y el resto de la semana son días futuros
    t.mock.timers.reset();
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 27, 10, 0) });
    EstadoApp._setRegistros([reg('2026-10-26', '09:00', '16:00', 7)]);
    const futuros = EstadoTarjeta.calcularEstadoCard().diasSemana;
    assert.deepEqual(futuros.map(d => [d.fecha, d.estado]), [
        ['2026-10-26', 'cerrado'], ['2026-10-27', 'futuro'], ['2026-10-28', 'futuro'], ['2026-10-29', 'futuro'], ['2026-10-30', 'futuro']
    ]);
});
