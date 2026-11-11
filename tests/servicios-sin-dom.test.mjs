import test from 'node:test';
import assert from 'node:assert/strict';

// Sin `document`: si un servicio lo toca, este archivo falla al ejecutarse.
const store = new Map();
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

test('AvisoJornada.registroAbierto toma la jornada abierta de ayer si hoy no tiene registro', async (t) => {
    const { AvisoJornada } = await import('../src/services/aviso-jornada.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const reg = (fecha, entrada, salida) => ({ id: `${fecha}-${entrada}`, fecha, entrada, salida, objetivoHoras: 7 });

    // 31/10/2026 00:26 (sábado): la jornada del viernes 30 sigue abierta
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 31, 0, 26) });

    EstadoApp._setRegistros([reg('2026-10-30', '18:40', null)]);
    assert.equal(AvisoJornada.registroAbierto('2026-10-31')?.fecha, '2026-10-30');

    // Ayer ya tiene salida: nada para avisar
    EstadoApp._setRegistros([reg('2026-10-30', '18:40', '23:00')]);
    assert.equal(AvisoJornada.registroAbierto('2026-10-31'), null);

    // Hoy ya tiene su propio registro cerrado: no se arrastra el de ayer
    EstadoApp._setRegistros([reg('2026-10-30', '18:40', null), reg('2026-10-31', '08:00', '09:00')]);
    assert.equal(AvisoJornada.registroAbierto('2026-10-31'), null);

    // Hoy (sábado) tiene uno abierto, pero no es día hábil: no se avisa
    EstadoApp._setRegistros([reg('2026-10-31', '08:00', null)]);
    assert.equal(AvisoJornada.registroAbierto('2026-10-31'), null);

    // Abierto hace más de 24 h: se considera olvidado
    EstadoApp._setRegistros([reg('2026-10-30', '00:10', null)]);
    assert.equal(AvisoJornada.registroAbierto('2026-10-31'), null);
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

test('ImportarExportar.normalizarRegistrosImportados deja un registro por fecha (el más completo) e ids únicos', async () => {
    const { ImportarExportar } = await import('../src/services/importar-exportar.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const toasts = [];
    EstadoApp.configurarNotificaciones({ mostrarToast: (m, t) => toasts.push([m, t]) });
    const base = { tiempoFuera: null, horas: 0, minutos: 0, total: 0 };
    const lista = [
        { ...base, id: 'aaaaaaaaaa1', fecha: '2026-10-20', entrada: '09:00', salida: null },
        { ...base, id: 'aaaaaaaaaa2', fecha: '2026-10-20', entrada: '09:00', salida: '17:00' },
        { ...base, id: 'aaaaaaaaaa2', fecha: '2026-10-21', entrada: '08:00', salida: '16:00' },
    ];
    const r = ImportarExportar.normalizarRegistrosImportados(lista);
    assert.equal(r.length, 2);
    assert.equal(r.find(x => x.fecha === '2026-10-20').salida, '17:00');
    assert.equal(new Set(r.map(x => x.id)).size, 2);
    assert.match(toasts.at(-1)[0], /1 registro con fecha repetida omitido/);
});

test('ImportarExportar: archivo y Gist comparten validación (prepararRespaldo) y combinación (restaurarRespaldo)', async () => {
    const { ImportarExportar: IE } = await import('../src/services/importar-exportar.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { SeguridadYUtils: S } = await import('../src/core/seguridad.js');
    const toasts = [];
    let confirmaciones = 0;
    EstadoApp.configurarNotificaciones({
        mostrarToast: (m, t) => toasts.push([m, t]),
        confirmarModal: async () => { confirmaciones++; return true; },
        actualizarUI: () => { }, cerrarImportar: () => { }, refrescarConfigSiVisible: () => { },
    });

    assert.equal(IE.errorEstructuraRespaldo([], 'Gist'), 'Estructura del Gist inválida');
    assert.equal(IE.errorEstructuraRespaldo({ registros: [], extra: 1 }, 'Gist'), 'Gist con estructura sospechosa');
    assert.match(IE.errorEstructuraRespaldo({ registros: new Array(S.SECURITY_LIMITS.MAX_REGISTROS + 1) }), /Máximo/);
    assert.ok('error' in await IE.prepararRespaldo({ registros: [], _hashNoCoincide: true }, 'gist'));

    const base = { tiempoFuera: null, horas: 0, minutos: 0, total: 0 };
    const registros = [
        { ...base, id: 'bbbbbbbbbb1', fecha: '2026-10-20', entrada: '09:00', salida: '17:00' },
        { ...base, id: 'bbbbbbbbbb2', fecha: '2026-10-21', entrada: '09:00', salida: '16:00' },
    ];
    const data = { registros, hash: await S.calcularHashSHA256(registros) };
    const { registros: importados } = await IE.prepararRespaldo(data, 'gist');
    assert.equal(importados.length, 2);
    assert.equal(confirmaciones, 0);   // hash correcto: no pide confirmación

    EstadoApp._setRegistros([{ ...base, id: 'cccccccccc1', fecha: '2026-10-20', entrada: '09:00', salida: null }]);
    const diff = IE.calcularDiferencias(importados);
    assert.deepEqual([diff.soloImportados.length, diff.complementarios.length, diff.soloLocal.length], [1, 1, 0]);

    const res = await IE.restaurarRespaldo(data, importados, 'merge', { etiqueta: 'con Gist' });
    assert.equal(res.ok, true);
    assert.equal(EstadoApp.registros().length, 2);
    assert.equal(EstadoApp.registroPorFecha('2026-10-20').salida, '17:00');
    assert.equal(EstadoApp.registroPorFecha('2026-10-20').id, 'cccccccccc1');   // se completa el local, no se reemplaza
    assert.equal(EstadoApp.registros()[0].fecha, '2026-10-21');                 // queda ordenado

    assert.deepEqual(await IE.restaurarRespaldo(data, importados, 'merge'), { ok: false, vacio: true });
});

test('GestionDatos.cargarPerfilActivo repara lo guardado: descarta registros sin fecha, limpia horas inválidas y días hábiles', async () => {
    const { GestionDatos } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    const { GestorHistorial } = await import('../src/services/gestor-historial.js');
    GestorHistorial.clear();
    const perfil = GestorPerfiles.obtenerDatosPerfil();
    const original = { ...perfil };
    Object.assign(perfil, {
        diasHabiles: [5, 1, 1, 'x', 9, 3],
        horasDiarias: 'mucho',
        registros: [
            { id: 'dddddddddd1', fecha: '2026-10-20', entrada: '09:00', salida: '17:00', tiempoFuera: undefined, horas: 0, minutos: 0, total: 0, raro: '<img>' },
            { id: 'dddddddddd1', fecha: '2026-10-21', entrada: '25:99', salida: null, horas: 'x' },
            { id: 'dddddddddd3', fecha: 'no-fecha', entrada: '09:00' },
            'basura',
        ],
    });
    try {
        GestionDatos.cargarPerfilActivo();
        assert.deepEqual(EstadoApp.diasHabiles(), [1, 3, 5]);
        assert.equal(EstadoApp.horasDiarias(), 7);
        const regs = EstadoApp.registros();
        assert.equal(regs.length, 2);
        const r20 = EstadoApp.registroPorFecha('2026-10-20');
        assert.equal(r20.raro, undefined);
        assert.equal(r20.total, 8);   // las horas se recalculan al cargar
        const r21 = EstadoApp.registroPorFecha('2026-10-21');
        assert.equal(r21.entrada, null);
        assert.notEqual(r21.id, r20.id);
    } finally {
        Object.keys(perfil).forEach(k => delete perfil[k]);
        Object.assign(perfil, original);
        GestorHistorial.clear();
    }
});

test('GestorPerfiles: crear, renombrar y eliminar validan el nombre y borran las claves del perfil', async () => {
    const { GestorPerfiles: G } = await import('../src/services/gestor-perfiles.js');
    const { Almacenamiento } = await import('../src/core/almacenamiento.js');
    G.inicializar();

    assert.match(G.crearPerfil('  ').error, /Ingresá/);
    assert.match(G.crearPerfil('Mal<nombre>').error, /no válidos/);
    assert.match(G.crearPerfil('principal').error, /Ya existe/);

    const creado = G.crearPerfil('  Trabajo 2  ');
    assert.equal(creado.nombre, 'Trabajo 2');
    assert.ok(G.obtenerTodosPerfiles()[creado.id]);
    assert.deepEqual(G.renombrarPerfil(creado.id, 'Trabajo 2'), { sinCambios: true });
    assert.match(G.renombrarPerfil(creado.id, 'Principal').error, /Ya existe/);
    assert.deepEqual(G.renombrarPerfil(creado.id, 'Oficina'), { nombre: 'Oficina' });

    Almacenamiento.setItem(`fondoCard_${creado.id}`, 'x');
    Almacenamiento.setItem(`feriadosAR_procesados_${creado.id}`, '[]');
    assert.match(G.eliminarPerfil('default').error, /Principal/);
    assert.deepEqual(G.eliminarPerfil(creado.id), { eraActual: false });
    assert.equal(G.obtenerTodosPerfiles()[creado.id], undefined);
    assert.equal(Almacenamiento.getItem(`fondoCard_${creado.id}`), null);
    assert.equal(Almacenamiento.getItem(`feriadosAR_procesados_${creado.id}`), null);
});

test('GestorPerfiles.guardarDatosPerfilActual conserva los campos del Gist con valor y descarta los vacíos', async () => {
    const { GestorPerfiles: G } = await import('../src/services/gestor-perfiles.js');
    G.inicializar();
    const perfil = G.obtenerDatosPerfil();
    Object.assign(perfil, { gistId: 'abc', gistAutoSync: 0, gistSyncCount_subir: 0, gistLastSync: '', gistRangoDesde: null, otro: 1 });
    G.guardarDatosPerfilActual();
    const guardado = G.obtenerDatosPerfil();
    assert.equal(guardado.gistId, 'abc');
    assert.equal(guardado.gistAutoSync, 0);
    assert.equal(guardado.gistSyncCount_subir, 0);
    assert.equal('gistLastSync' in guardado, false);
    assert.equal('gistRangoDesde' in guardado, false);
    assert.equal('otro' in guardado, false);
    G.CAMPOS_GIST_PERFIL.forEach(k => delete guardado[k]);
    G.guardarDatosPerfilActual();
});

test('SincronizacionGist: el token se valida con lista blanca y uno inválido no se guarda', async () => {
    const { SincronizacionGist: G } = await import('../src/services/sincronizacion-gist.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    assert.equal(G.esTokenValido('ghp_' + 'a'.repeat(36)), true);
    assert.equal(G.esTokenValido('github_pat_' + 'A1_'.repeat(27)), true);
    assert.equal(G.esTokenValido('ghp_abc"><script>'), false);
    assert.equal(G.esTokenValido('corto'), false);

    assert.equal(G.saveCredentials('ghp_' + 'b'.repeat(36), ''), true);
    assert.equal(G.getToken(), 'ghp_' + 'b'.repeat(36));
    assert.equal(G.saveCredentials('token con espacios y ñ', ''), false);
    assert.equal(G.getToken(), 'ghp_' + 'b'.repeat(36));   // no se pisó
    G.saveCredentials('', '');
    assert.equal(G.getToken(), '');
});

test('OperacionesLote: día especial y operaciones por lote rechazan fechas inválidas sin tocar los registros', async () => {
    const { OperacionesLote: F } = await import('../src/services/operaciones-lote.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const avisos = [];
    EstadoApp.configurarNotificaciones({ avisarFichaje: m => avisos.push(m), mostrarToast: m => avisos.push(m) });
    EstadoApp._setRegistros([]);

    assert.deepEqual(await F.registrarDiaEspecial('2026-13-01', 'feriado'), { error: 'Fecha inválida' });
    assert.deepEqual(await F.registrarVacacionesDirecto('no-fecha', '2026-10-20', 'vacaciones'), { error: 'Fecha "Desde" inválida' });
    assert.ok('error' in await F.registrarVacacionesDirecto('2026-10-20', '2026-10-10', 'vacaciones'));
    assert.ok('error' in await F.borrarPeriodoDirecto('2026-10-01', ''));
    assert.equal(EstadoApp.registros().length, 0);
    assert.deepEqual(avisos, ['Fecha inválida', 'Fecha "Desde" inválida', 'La fecha inicial debe ser inferior a la final', 'Verificá ambas fechas']);

    EstadoApp._setRegistros([{ id: 'eeeeeeeeee1', fecha: '2026-10-05', entrada: '09:00', salida: '17:00', tiempoFuera: null, horas: 8, minutos: 0, total: 8 }]);
    assert.deepEqual(await F.registrarDiaEspecial('2026-10-05', 'feriado'), { error: 'Ya existe un registro para esa fecha' });
    assert.equal(avisos.at(-1), 'Ya existe un registro para esa fecha');
});

test('Filtros.aplicarFiltrosInmediato ignora fechas y tipos inválidos', async () => {
    const { Filtros: F } = await import('../src/services/filtros.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    EstadoApp.configurarNotificaciones({ actualizarUI: () => { } });
    F.aplicarFiltrosInmediato('2026-10-01', 'x', '<b>');
    assert.deepEqual(EstadoApp.getFiltroState(), { filtroActivo: true, filtroDesde: '2026-10-01', filtroHasta: null, filtroTipo: null });
    F.aplicarFiltrosInmediato('basura', '', 'otro');
    assert.equal(EstadoApp.getFiltroState().filtroActivo, false);
    F.aplicarFiltrosInmediato('', '', 'normal');
    assert.equal(EstadoApp.getFiltroState().filtroTipo, 'normal');
    F.aplicarFiltrosInmediato('', '', '');
});

test('ImportarExportar.armarRespaldo produce lo que prepararRespaldo acepta (ida y vuelta, también con rango)', async () => {
    const { ImportarExportar: IE } = await import('../src/services/importar-exportar.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    let confirmaciones = 0;
    EstadoApp.configurarNotificaciones({ mostrarToast: () => { }, confirmarModal: async () => { confirmaciones++; return true; } });
    const registros = [{ id: 'ffffffffff1', fecha: '2026-10-20', entrada: '09:00', salida: '17:00', tiempoFuera: null, horas: 8, minutos: 0, total: 8 }];
    for (const extra of [undefined, { rangoExportado: '2026-10-01 a 2026-10-31' }]) {
        const data = await IE.armarRespaldo(registros, extra);
        assert.equal(IE.errorEstructuraRespaldo(data), null);
        assert.equal((await IE.prepararRespaldo(JSON.parse(JSON.stringify(data)))).registros.length, 1);
    }
    assert.equal(confirmaciones, 0);   // el hash coincide: no pide confirmación
});

test('DiasHabiles: editar y eliminar tramos de días hábiles validan y no permiten borrar el primero', async () => {
    const { DiasHabiles: C } = await import('../src/services/dias-habiles.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    let sincronizaciones = 0;
    EstadoApp.configurarNotificaciones({ actualizarUI: () => { } });
    EstadoApp.setSincronizarPushHoyHook(() => { sincronizaciones++; });
    EstadoApp._setHistorialDiasHabilesRaw([{ desde: '0001-01-01', dias: [1, 2, 3, 4, 5] }, { desde: '2026-06-01', dias: [1, 2, 3, 4] }]);

    assert.match((await C.editarTramoDias('2026-06-01', '2026-13-40', [1])).error, /fecha válida/);
    assert.match((await C.editarTramoDias('2026-06-01', '2026-06-01', ['x', 9])).error, /al menos un día/);
    assert.match((await C.editarTramoDias('2026-06-01', '0001-01-01', [1])).error, /Ya existe/);
    assert.match((await C.editarTramoDias('2020-01-01', '2026-06-01', [1])).error, /no encontrado/);
    assert.deepEqual(await C.editarTramoDias('2026-06-01', '2026-07-01', [3, 1, 1]), { ok: true });
    assert.deepEqual(C.tramosDiasHabiles().map(t => [t.desde, t.dias]), [['0001-01-01', [1, 2, 3, 4, 5]], ['2026-07-01', [1, 3]]]);
    assert.equal(sincronizaciones, 1);

    assert.match((await C.eliminarTramoDias('0001-01-01')).error, /primer tramo/);
    assert.deepEqual(await C.eliminarTramoDias('2026-07-01'), { ok: true });
    assert.equal(C.tramosDiasHabiles().length, 1);

    const { AvisoJornada } = await import('../src/services/aviso-jornada.js');
    EstadoApp.setSincronizarPushHoyHook(AvisoJornada.sincronizarHoy);   // se restaura el hook real
});

test('GestionDatos: deshacer y rehacer restauran los registros y recalculan sus horas', async () => {
    const { GestionDatos: D } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorHistorial } = await import('../src/services/gestor-historial.js');
    const toasts = [];
    EstadoApp.configurarNotificaciones({ actualizarUI: () => { }, iniciarTimerAutoCierreBotones: () => { }, mostrarToast: (m) => toasts.push(m) });
    GestorHistorial.clear();
    const r = { id: 'gggggggggg1', fecha: '2026-10-20', entrada: '09:00', salida: '17:00', tiempoFuera: null, horas: 0, minutos: 0, total: 0 };
    EstadoApp._setRegistros([]);
    GestorHistorial.saveState([], 'vacío');
    GestorHistorial.saveState([r], 'agregar');        // el total guardado (0) está desactualizado a propósito

    D.undoAction();
    assert.equal(EstadoApp.registros().length, 0);
    D.redoAction();
    assert.equal(EstadoApp.registros().length, 1);
    assert.equal(EstadoApp.registros()[0].total, 8);   // se recalculó al restaurar
    assert.deepEqual(toasts, ['Deshecho', 'Rehecho']);
    GestorHistorial.clear();
});

test('GestionDatos.cargarPerfilActivo: el perfil manda aunque la pila de deshacer haya quedado vieja', async (t) => {
    const { GestionDatos } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    const { GestorHistorial } = await import('../src/services/gestor-historial.js');
    EstadoApp.configurarNotificaciones({ actualizarUI: () => { }, mostrarToast: () => { } });
    GestorPerfiles.inicializar();
    GestorHistorial.clear();
    EstadoApp._setRegistros([]);
    GestorHistorial.saveState(EstadoApp.registros(), 'inicio');
    await EstadoApp.guardarYActualizar();

    // La escritura de la pila (varios MB) falla por cuota; la del perfil (mucho más chica) entra
    const setItemReal = localStorage.setItem;
    localStorage.setItem = (k, v) => {
        if (k.includes('history')) throw Object.assign(new Error('cuota'), { name: 'QuotaExceededError' });
        setItemReal(k, v);
    };
    t.mock.method(console, 'error', () => { });
    t.mock.method(console, 'warn', () => { });
    try {
        EstadoApp.registros().push(EstadoApp._construirRegistro('2026-10-20', '08:30', null));
        GestorHistorial.saveState(EstadoApp.registros(), 'entrada');
        assert.equal(await EstadoApp.guardarYActualizar(), true);
    } finally {
        localStorage.setItem = setItemReal;
    }

    try {
        GestorPerfiles.inicializar();   // recarga de la app
        GestionDatos.cargarPerfilActivo();
        assert.equal(EstadoApp.registros().length, 1, 'el fichaje guardado en el perfil no se pierde');
        assert.deepEqual(GestorHistorial.getCurrentState().map(r => r.fecha), ['2026-10-20'], 'la pila vuelve a coincidir con el perfil');

        // Un cambio guardado sin pasar por la pila (ej. créditos recalculados desde Ajustes) tampoco se revierte
        const reg = EstadoApp.registros()[0];
        reg.salida = '12:00';
        reg.credito = '03:30';
        await EstadoApp.guardarYActualizar();
        GestorPerfiles.inicializar();
        GestionDatos.cargarPerfilActivo();
        assert.equal(EstadoApp.registros()[0].credito, '03:30');
    } finally {
        GestorHistorial.clear();
        EstadoApp._setRegistros([]);
        await EstadoApp.guardarYActualizar();
    }
});

test('GestionDatos.cargarPerfilActivo: con la pila al día se conserva lo que se puede deshacer', async () => {
    const { GestionDatos } = await import('../src/services/gestion-datos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    const { GestorHistorial } = await import('../src/services/gestor-historial.js');
    EstadoApp.configurarNotificaciones({ actualizarUI: () => { }, mostrarToast: () => { }, iniciarTimerAutoCierreBotones: () => { } });
    GestorPerfiles.inicializar();
    GestorHistorial.clear();
    EstadoApp._setRegistros([]);
    GestorHistorial.saveState(EstadoApp.registros(), 'inicio');
    await EstadoApp.guardarYActualizar();
    EstadoApp.registros().push(EstadoApp._construirRegistro('2026-10-20', '08:30', '15:30'));
    GestorHistorial.saveState(EstadoApp.registros(), 'jornada');
    await EstadoApp.guardarYActualizar();

    try {
        GestorPerfiles.inicializar();
        GestionDatos.cargarPerfilActivo();
        GestionDatos.undoAction();
        assert.equal(EstadoApp.registros().length, 0);
    } finally {
        GestorHistorial.clear();
        EstadoApp._setRegistros([]);
        await EstadoApp.guardarYActualizar();
    }
});

test('ImportarExportar.importarDatos acepta un .json aunque el navegador no informe su tipo, y rechaza otros archivos', async () => {
    const { ImportarExportar } = await import('../src/services/importar-exportar.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const toasts = [];
    EstadoApp.configurarNotificaciones({ mostrarToast: (m) => toasts.push(m) });
    const leidos = [];
    globalThis.FileReader = class { readAsText(f) { leidos.push(f.name); } };
    try {
        ImportarExportar.importarDatos({ name: 'sin-tipo.json', type: '', size: 10 });
        ImportarExportar.importarDatos({ name: 'android.JSON', type: 'application/octet-stream', size: 10 });
        ImportarExportar.importarDatos({ name: 'respaldo', type: 'application/json', size: 10 });
        ImportarExportar.importarDatos({ name: 'foto.png', type: 'image/png', size: 10 });
        assert.deepEqual(leidos, ['sin-tipo.json', 'android.JSON', 'respaldo']);
        assert.deepEqual(toasts, ['Solo se permiten archivos JSON']);
    } finally {
        delete globalThis.FileReader;
    }
});

test('TiempoFuera: menos de 30 s no cuenta, lo demás se suma al registro y la opción de ignorarlo no descuenta', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 28, 10, 0) });
    const { TiempoFuera: F } = await import('../src/services/tiempo-fuera.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    EstadoApp.setIgnorarTiempoFuera(false);
    const reg = { tiempoFuera: '00:10' };

    assert.equal(F.corriendo(), false);
    assert.equal(F.minutosActivos(), 0);
    assert.equal(F.volcarEnRegistro(reg), 0, 'sin temporizador no hace nada');

    F.iniciar();
    t.mock.timers.tick(29_000);
    assert.equal(F.alcanzaMinimo(), false);
    assert.equal(F.volcarEnRegistro(reg), 0, 'muy corto: se descarta');
    assert.equal(reg.tiempoFuera, '00:10');
    assert.equal(F.corriendo(), false);

    F.iniciar();
    t.mock.timers.tick(5 * 60_000 + 40_000);
    assert.equal(F.minutosActivos(), 5);
    EstadoApp.setIgnorarTiempoFuera(true);
    assert.equal(F.minutosActivos(), 0, 'con la opción activa no descuenta');
    EstadoApp.setIgnorarTiempoFuera(false);
    assert.equal(F.volcarEnRegistro(reg), 6, 'redondea a partir de los 30 s');
    assert.equal(reg.tiempoFuera, '00:16');
    assert.equal(F.corriendo(), false);
});

test('Jornada: vigente y activa, con el cruce de medianoche', async () => {
    const { Jornada: F } = await import('../src/services/jornada.js');
    const ayer = { entrada: '22:00', salida: null };
    const abierta = { entrada: '08:00', salida: null };
    const cerrada = { entrada: '08:00', salida: '15:00' };
    const especial = { entrada: '12:12', salida: '12:12' };

    assert.equal(F.jornadaVigente(null, ayer, true), ayer, 'ayer abierto y hoy sin registro');
    assert.equal(F.jornadaVigente(abierta, ayer, true), abierta, 'hoy ya tiene entrada');
    assert.equal(F.jornadaVigente(null, null, false), null);

    assert.equal(F.jornadaActiva(null, ayer, true), ayer);
    assert.equal(F.jornadaActiva(abierta, null, false), abierta);
    assert.equal(F.jornadaActiva(cerrada, null, false), null, 'cerrada no corre');
    assert.equal(F.jornadaActiva(especial, null, false), null, 'un día especial no corre');
    assert.equal(F.jornadaActiva(null, null, false), null);
});

test('EstadoApp.horasTranscurridas: lo corrido hasta ahora, sin la pausa en curso y nunca negativo', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 28, 10, 0) });
    const { EstadoApp } = await import('../src/services/estado-app.js');
    EstadoApp.setIgnorarTiempoFuera(false);
    assert.equal(EstadoApp.horasTranscurridas({ entrada: '08:00' }), 2);
    assert.equal(EstadoApp.horasTranscurridas({ entrada: '08:00', tiempoFuera: '00:30' }), 1.5);
    assert.equal(EstadoApp.horasTranscurridas({ entrada: '08:00' }, 30), 1.5);
    assert.equal(EstadoApp.horasTranscurridas({ entrada: '09:59' }, 30), 0);
});

test('EstadoApp._guardarConCicloSiHoy guarda el perfil antes de la animación de cambio de vista, y si no pudo guardar no cambia de vista', async () => {
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    const llamadas = [];
    let render = null;
    EstadoApp.configurarNotificaciones({
        forzarVista: (vista, fn) => { llamadas.push(`forzarVista:${vista}`); render = fn; },
        prepararMostrarFaseAlRenderizar: (fase) => llamadas.push(`fase:${fase}`),
        actualizarUI: () => llamadas.push('actualizarUI'),
        mostrarToast: () => llamadas.push('toast'),
    });
    EstadoApp.setVistaActual('semana');
    const guardados = [];
    EstadoApp.setPerfilHooks({ guardarDatosPerfilActual: () => { guardados.push(llamadas.length); return true; } });
    try {
        await EstadoApp._guardarConCicloSiHoy('id', true, 'entrada');
        assert.deepEqual(guardados, [0], 'se guarda antes de empezar a cambiar de vista');
        assert.deepEqual(llamadas, ['forzarVista:diaria']);
        render();
        assert.deepEqual(llamadas, ['forzarVista:diaria', 'fase:entrada', 'actualizarUI']);

        llamadas.length = 0;
        EstadoApp.setPerfilHooks({ guardarDatosPerfilActual: () => false });
        assert.equal(await EstadoApp._guardarConCicloSiHoy('id', true, 'entrada'), false);
        assert.deepEqual(llamadas, ['toast'], 'sin guardar no hay cambio de vista ni render');
    } finally {
        EstadoApp.setVistaActual('diaria');
        EstadoApp.setPerfilHooks({ guardarDatosPerfilActual: GestorPerfiles.guardarDatosPerfilActual });
    }
});

test('OperacionesLote: devuelve { ok: true } al registrar y { error } si no pudo guardar, sin lanzar', async () => {
    const { OperacionesLote: L } = await import('../src/services/operaciones-lote.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    GestorPerfiles.inicializar();
    EstadoApp.configurarNotificaciones({ avisarFichaje: () => { }, mostrarToast: () => { }, actualizarUI: () => { }, forzarVista: (_v, fn) => fn() });
    EstadoApp._setRegistros([]);
    try {
        assert.deepEqual(await L.registrarDiaEspecial('2026-10-05', 'feriado'), { ok: true });
        assert.deepEqual(await L.registrarVacacionesDirecto('2026-10-06', '2026-10-07', 'vacaciones'), { ok: true });
        assert.equal(EstadoApp.registros().length, 3);
        assert.deepEqual(await L.registrarVacacionesDirecto('2026-10-06', '2026-10-07', 'vacaciones'), { error: 'Todas las fechas ya están registradas' });

        EstadoApp.setPerfilHooks({ guardarDatosPerfilActual: () => false });
        assert.deepEqual(await L.registrarDiaEspecial('2026-10-08', 'feriado'), { error: 'Error al guardar' });
    } finally {
        EstadoApp.setPerfilHooks({ guardarDatosPerfilActual: GestorPerfiles.guardarDatosPerfilActual });
        EstadoApp._setRegistros([]);
    }
});

test('OperacionesLote.registrarDiaEspecial: la descripción opcional queda en las notas del registro (saneada y sin pasar el máximo)', async () => {
    const { OperacionesLote: L } = await import('../src/services/operaciones-lote.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    const { SeguridadYUtils: S } = await import('../src/core/seguridad.js');
    GestorPerfiles.inicializar();
    EstadoApp.configurarNotificaciones({ avisarFichaje: () => { }, mostrarToast: () => { }, actualizarUI: () => { }, forzarVista: (_v, fn) => fn() });
    EstadoApp._setRegistros([]);
    try {
        assert.deepEqual(await L.registrarDiaEspecial('2026-10-05', 'feriado', S.notasHastaPalabra('Paso a la Inmortalidad del Gral. Güemes')), { ok: true });
        assert.deepEqual(await L.registrarDiaEspecial('2026-10-06', 'feriado', 'Día <b>Nac</b>'), { ok: true });
        assert.deepEqual(await L.registrarDiaEspecial('2026-10-07', 'feriado'), { ok: true });
        assert.deepEqual(await L.registrarDiaEspecial('2026-10-08', 'feriado', ''), { ok: true });
        const porFecha = f => EstadoApp.registroPorFecha(f);
        assert.equal(porFecha('2026-10-05').notas, 'Paso a la Inmortalidad del Gral');
        assert.equal(porFecha('2026-10-06').notas, 'Día bNacb', 'la lista blanca de las notas también rige acá');
        assert.equal('notas' in porFecha('2026-10-07'), false, 'sin descripción el registro queda como antes');
        assert.equal('notas' in porFecha('2026-10-08'), false);
        EstadoApp.registros().forEach(r => assert.equal(S.validarRegistroSeguro(r), true));
    } finally {
        EstadoApp._setRegistros([]);
    }
});

test('FeriadosAR: analiza el catálogo contra los registros y aplica agregar, actualizar y reemplazar en un solo guardado', async () => {
    const { FeriadosAR } = await import('../src/services/feriados-ar.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const { GestorPerfiles } = await import('../src/services/gestor-perfiles.js');
    const { TiposRegistro } = await import('../src/services/tipos-registro.js');
    GestorPerfiles.inicializar();
    EstadoApp.configurarNotificaciones({ avisarFichaje: () => { }, mostrarToast: () => { }, actualizarUI: () => { }, forzarVista: (_v, fn) => fn() });
    const { entrada: cod } = TiposRegistro.obtenerCodigosPorTipo('feriado');
    const feriadoCon = (fecha, notas) => {
        const r = EstadoApp._construirRegistro(fecha, cod, cod);
        if (notas) r.notas = notas;
        return r;
    };
    EstadoApp._setRegistros([
        feriadoCon('2026-01-01', 'Año Nuevo'),                              // al día
        feriadoCon('2026-02-17'),                                           // feriado sin descripción
        EstadoApp._construirRegistro('2026-02-16', '09:00', '17:00'),       // jornada: conflicto
    ]);
    try {
        const items = FeriadosAR.analizar({ anteriores: true, proximos: false });
        const estado = f => items.find(i => i.fecha === f)?.estado;
        assert.equal(estado('2026-01-01'), undefined, 'un feriado con su descripción no se ofrece');
        assert.equal(estado('2026-02-17'), 'actualizar');
        assert.equal(estado('2026-02-16'), 'conflicto');
        assert.equal(estado('2026-03-23'), 'agregar');
        assert.ok(items.every((i, k) => k === 0 || items[k - 1].fecha <= i.fecha), 'ordenados por fecha');
        assert.equal(FeriadosAR.analizar({ anteriores: false, proximos: false }).length, 0);

        // Un conflicto sin "reemplazar" no se toca
        assert.ok('error' in await FeriadosAR.aplicar([{ fecha: '2026-02-16' }]));
        assert.equal(EstadoApp.registroPorFecha('2026-02-16').entrada, '09:00');

        const res = await FeriadosAR.aplicar([{ fecha: '2026-02-16', reemplazar: true }, { fecha: '2026-02-17' }, { fecha: '2026-03-23' }]);
        assert.deepEqual(res, { ok: true, agregados: 1, actualizados: 1, reemplazados: 1 });
        const porFecha = f => EstadoApp.registroPorFecha(f);
        assert.equal(porFecha('2026-02-16').entrada, cod);
        assert.equal(porFecha('2026-02-16').notas, 'Carnaval');
        assert.equal(porFecha('2026-02-17').notas, 'Carnaval');
        assert.equal(porFecha('2026-03-23').notas, 'Puente Turístico');
        assert.equal(EstadoApp.registros().filter(r => r.fecha === '2026-02-16').length, 1, 'el reemplazo no deja duplicados');
        assert.equal(FeriadosAR.analizar({ anteriores: true, proximos: false }).some(i => ['2026-02-16', '2026-02-17', '2026-03-23'].includes(i.fecha)), false);
    } finally {
        EstadoApp._setRegistros([]);
    }
});
