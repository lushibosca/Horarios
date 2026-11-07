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
    const r = ImportarExportar.normalizarRegistrosImportados(lista, EstadoApp.calcularHoras);
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
    assert.equal(await IE.prepararRespaldo({ registros: [], _hashNoCoincide: true }, 'gist'), null);

    const base = { tiempoFuera: null, horas: 0, minutos: 0, total: 0 };
    const registros = [
        { ...base, id: 'bbbbbbbbbb1', fecha: '2026-10-20', entrada: '09:00', salida: '17:00' },
        { ...base, id: 'bbbbbbbbbb2', fecha: '2026-10-21', entrada: '09:00', salida: '16:00' },
    ];
    const data = { registros, hash: await S.calcularHashSHA256(registros) };
    const importados = await IE.prepararRespaldo(data, 'gist');
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

test('FiltrosYPeriodos: día especial y operaciones por lote rechazan fechas inválidas sin tocar los registros', async () => {
    const { FiltrosYPeriodos: F } = await import('../src/services/filtros-periodos.js');
    const { EstadoApp } = await import('../src/services/estado-app.js');
    const avisos = [];
    EstadoApp.configurarNotificaciones({ avisarFichaje: m => avisos.push(m), mostrarToast: m => avisos.push(m) });
    EstadoApp._setRegistros([]);

    await assert.rejects(F.registrarDiaEspecial('2026-13-01', 'feriado'));
    await assert.rejects(F.registrarVacacionesDirecto('no-fecha', '2026-10-20', 'vacaciones'));
    await assert.rejects(F.registrarVacacionesDirecto('2026-10-20', '2026-10-10', 'vacaciones'));
    await assert.rejects(F.borrarPeriodoDirecto('2026-10-01', ''));
    assert.equal(EstadoApp.registros().length, 0);
    assert.deepEqual(avisos, ['Fecha inválida', 'Fecha "Desde" inválida', 'La fecha inicial debe ser inferior a la final', 'Verificá ambas fechas']);

    EstadoApp._setRegistros([{ id: 'eeeeeeeeee1', fecha: '2026-10-05', entrada: '09:00', salida: '17:00', tiempoFuera: null, horas: 8, minutos: 0, total: 8 }]);
    await assert.rejects(F.registrarDiaEspecial('2026-10-05', 'feriado'));
    assert.equal(avisos.at(-1), 'Ya existe un registro para esa fecha');
});

test('FiltrosYPeriodos.aplicarFiltrosInmediato ignora fechas y tipos inválidos', async () => {
    const { FiltrosYPeriodos: F } = await import('../src/services/filtros-periodos.js');
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
        assert.equal((await IE.prepararRespaldo(JSON.parse(JSON.stringify(data)))).length, 1);
    }
    assert.equal(confirmaciones, 0);   // el hash coincide: no pide confirmación
});

test('Compensatorios: editar y eliminar tramos de días hábiles validan y no permiten borrar el primero', async () => {
    const { Compensatorios: C } = await import('../src/services/compensatorios.js');
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
