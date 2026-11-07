# Revisión de la rama `alpha-1-turnos-v2` (doble turno)

**Fecha:** 2026-11-04
**Rama:** `alpha-1-turnos-v2`, creada desde `alpha-1` (`c920b9a`)
**Commits revisados:** `e251519` (dominio), `de07c66` (UI), `d1f2b4c` (ayuda y documentación)
**Estado:** typecheck y 98 tests en verde. **Todavía no se probó en un navegador real.**

Este documento junta los posibles bugs, riesgos y puntos a revisar antes de mergear. Sale de una revisión del código
escrito, no de pruebas manuales, así que cada punto hay que confirmarlo (o descartarlo) probando la app.

---

## 1. Resumen de lo implementado

| Decisión | Implementación | Dónde |
|---|---|---|
| El turno sale del orden horario | No se guarda en el registro: la jornada con la entrada más temprana del día es T1 | `src/services/turnos.js` (`turnoDe`) |
| Especiales y jornadas no se mezclan | Un día tiene un especial o hasta 1/2 jornadas sin superponerse | `Turnos.errorDiaParaJornada`, `conflictoHorario`, `depurarPorDia` |
| El doble turno es del perfil | Solo se cambia en el onboarding de un perfil sin registros | `src/ui/configuracion.js` (`_puedeCambiarDobleTurno`) |
| Tarjeta "inteligente" | Modos sin fichar, turno en curso, entre turnos y día completo (con selector Día · T1 · T2) | `src/services/estado-tarjeta.js` (`_vistaTurnosHoy`), `src/ui/tarjeta-fichaje-vista.js` |
| Push por turno | Id del aviso `…:fecha:tN`; el del T2 absorbe el faltante del T1 | `src/services/aviso-jornada.js`, `src/services/recordatorio-push.js` |

**Garantía principal:** con un solo turno la app tiene que comportarse igual que en `alpha-1`. La respaldan los 84 tests
que ya existían y que pasan sin cambios, pero quedan los casos borde marcados abajo con ⚠️ **(1 turno)**.

---

## 2. Posibles bugs

Severidad: 🔴 alta (datos o números incorrectos) · 🟠 media (comportamiento confuso o inconsistente) · 🟡 baja (borde o cosmético).

### 🔴 B1. Al reasignar objetivos no se recalcula la salida temprana
`Turnos.reestamparObjetivos` (`src/services/turnos.js:93`) cambia `objetivoHoras` cuando una jornada pasa de T1 a T2
(o al revés), pero no recalcula `credito`. Una jornada con salida temprana guardó un crédito calculado contra el objetivo
anterior; si T1 y T2 tienen horas distintas, el total queda inflado o corto.
**Repro:** perfil con T1 = 4 h y T2 = 3 h. Cargar la tarde con salida temprana (queda como T1, crédito hasta 4 h); después
cargar la mañana. La tarde pasa a T2 con objetivo 3 h, pero conserva el crédito calculado para 4 h.
**Arreglo sugerido:** si el registro tiene `credito`, llamar a `Compensatorios._recalcularCreditoRegistro(r, nuevoObjetivo)`.

### 🔴 B2. Al cargar el perfil no se valida la forma del día
`cargarPerfilActivo` (`src/services/gestion-datos.js:77`) repara los registros, pero a propósito no descarta los que rompen
la forma del día (3 jornadas, especial mezclado con jornadas, turnos superpuestos o 2 jornadas en un perfil de un turno).
Se decidió así para no perder datos en silencio, pero esos días quedan con cálculos indefinidos: `objetivoDelDia`
recorta el turno a 2, la tarjeta toma la última jornada y el calendario colorea según la primera.
**Cómo puede pasar:** datos editados a mano, un respaldo importado con otra versión, o deshacer/rehacer combinado con
cambios de modo.
**Sugerencia:** detectar estos días al cargar y avisar al usuario (toast o marca en el histórico), sin borrar nada.

### 🟠 B3. Las estadísticas numeran los turnos por posición entre las jornadas cerradas
`_estadisticasDobleTurno` (`src/services/estadisticas-periodo.js:75`) agrupa solo las jornadas válidas (cerradas). Si un
día tiene el T1 abierto (olvidado) y el T2 cerrado, el T2 se cuenta como "T1" en los promedios de entrada y salida.
**Arreglo:** calcular el turno con `Turnos.turnoDe(r)` sobre el día completo, no por el índice dentro de los cerrados.

### 🟠 B4. El color del histórico es del día y el texto es del turno
`SaldoSemanal.estadoDeRegistro` (`src/services/saldo-semanal.js:127`) usa, con doble turno, el estado del día para el
color y la diferencia del turno para el texto. Un T1 con "-30m" se puede ver en **verde** si el T2 lo compensó, y un T1
cumplido se ve en **rojo** si el día quedó corto. Es intencional, pero puede confundir.
**Revisar:** si se prefiere un color por turno con una marca "compensado por el otro turno".

### 🟠 B5. Un día pasado con un solo turno siempre queda incompleto
El objetivo del día suma el turno que falta (`Compensatorios.objetivoDelDia`), así que un día en el que solo se trabajó un
turno queda en rojo en el calendario y descuenta horas del saldo. Es lo acordado (objetivo por día), pero no existe la
forma de declarar "hoy solo correspondía un turno".
**Revisar:** si hace falta un tipo especial "medio día" o un objetivo por día editable para el turno faltante.

### 🟠 B6. El reporte muestra ✓/✗ por jornada contra el objetivo del turno, sin etiqueta de turno
El "Detalle diario" de `src/ui/reportes.js` (alrededor de la línea 113) arma una fila por registro: con doble turno
aparecen dos filas con la misma fecha, sin "T1/T2", y el ✓/✗ compara cada jornada contra su turno, no contra el día. El
resumen semanal sí trabaja por día, así que el reporte puede contradecirse.
**Arreglo:** agregar el turno a la columna Día o Horario y decidir si el indicador es por día.

### 🟠 B7. La sincronización automática del Gist falla en cada intento si hay modos cruzados
Si un perfil de un turno baja automáticamente un Gist de doble turno con el comportamiento "combinar"
(`src/ui/gist-respaldo.js:406` → `restaurarRespaldo`, `src/services/importar-exportar.js:431`), se rechaza y muestra un
toast de error en **cada** sincronización.
**Arreglo:** detectarlo una sola vez y pausar la sincronización automática (o pasar a preguntar), con un aviso claro.

### 🟠 B8. El resumen de combinación del Gist no avisa lo que se va a omitir
`GistResumenMerge` no muestra `diff.omitidos` (jornadas que no entran en su día) ni avisa antes de aplicar que combinar
un respaldo de doble turno en un perfil de un turno no está permitido; el error aparece recién al tocar "Aplicar".

### 🟠 B9. Combinar respaldos de doble turno identifica las jornadas por fecha + entrada
`_claveCombinacion` (`src/services/importar-exportar.js:356`) busca la jornada equivalente por `fecha|entrada`. Si en un
dispositivo se corrigió la entrada (08:00 → 08:05), al combinar se la toma como una jornada distinta:
- si se superpone, se omite y no se completa la salida que faltaba;
- si no se superpone y hay lugar, **se agrega como turno extra** (duplicado lógico).

**Revisar:** buscar coincidencias por id primero (los ids se conservan entre dispositivos) y usar `fecha|entrada` solo
como respaldo.

### 🟠 B10. Cancelar el aviso de un turno invalida cualquier programación en vuelo
`cancelarFinDeJornada` (`src/services/recordatorio-push.js:346`) incrementa `_generacionCancelada` para cualquier
cancelación de hoy, sin mirar el turno. Si la programación del T2 está en vuelo (reintentos con red lenta) y llega una
cancelación del T1, el aviso del T2 puede quedar descartado localmente (`_guardarInfoActiva` no se ejecuta) aunque el
Worker sí lo haya guardado.
**Repro probable:** cerrar el T1 y abrir el T2 muy seguido con mala conexión.
**Arreglo:** guardar el turno de la generación en vuelo y solo invalidarla si la cancelación es del mismo turno.

### 🟡 B11. La superposición no cruza fechas
`conflictoHorario` (`src/services/turnos.js:139`) compara solo jornadas de la misma fecha. Un T2 de 22:00 a 02:00 del día D
no choca con un T1 a la 01:00 del día D+1, aunque en tiempo real se superponen.

### 🟡 B12. Rendimiento con doble turno: búsquedas O(n) por fila
Con doble turno, `estadoDeRegistro` llama a `Turnos.registrosDelDia(r.fecha)`, que filtra todos los registros, en cada
fila del histórico y en cada celda del calendario. `objetivoPorDefecto` hace lo mismo cuando está activo el "objetivo
diario global". Con miles de registros queda O(n²) por render. Con un turno no cambia nada.
**Arreglo:** pasar el índice `Turnos.indexarPorFecha` ya armado (como se hace en el saldo), o cachearlo por render.

### 🟡 B13. El ciclo de stats del día completo no dice de qué turno es cada dato
En el modo "día completo" el ciclo muestra la entrada del T1, la salida del T2 y el tiempo fuera sumado, sin indicar el
turno (`src/ui/tarjeta-fichaje.js:100`, `_datosJornadaVisible`).

### 🟡 B14. La marca de compensatorio queda solo en el T1
El excedente compensado se ancla a la primera jornada del día, así que la marca "→ fecha" aparece solo en la fila del T1.
No es un error de cálculo, pero el T2 no muestra que el día fue usado para un compensatorio.

### 🟡 B15. Cambios menores de comportamiento con un turno ⚠️ (1 turno)
- Al fichar una entrada, el aviso push ahora se programa con `AvisoJornada.sincronizarHoy()` en lugar de llamar directo a
  `programarFinDeJornada`. Respeta el "objetivo diario global", que antes se ignoraba en este camino. Es un arreglo, pero
  cambia el horario del aviso para quien tenga esa opción activa.
- En el pool semanal, un registro reparado con salida pero sin entrada ya no genera deuda (antes contaba 0 h contra el objetivo).
- Al cambiar el día en el calendario o al restaurar, el aviso programado de otro día se cancela antes de programar el nuevo.

---

## 3. Puntos de UX a validar en el navegador

1. **Ancho del título de la tarjeta en el celular:** nombre del día + selector Día·T1·T2 + badge "Finalizado" + etiqueta de
   tiempo fuera. Es probable que no entre en pantallas angostas.
2. **El selector dentro de la tarjeta:** tocar T1/T2 no debería cambiar a la vista semanal (se corta la propagación) y tiene
   que volver solo a "Día" a los 8 s (`_SELECCION_TURNO_MS`). Revisar foco y teclado (accesibilidad).
3. **Badge "Entre turnos":** que se distinga del "En curso" (no parpadea) y que tenga buen contraste en tema claro y oscuro.
4. **Onboarding de un perfil nuevo:** confirmar que al crear un perfil se abre el onboarding con el interruptor habilitado.
   No se probó el camino `crearPerfil` → recarga → `BienvenidaModal`.
5. **Interruptor bloqueado fuera del onboarding:** que se vea su estado (activo o no) y no parezca roto.
6. **Fila plegable de horas del T2:** animación al activar/desactivar y borde entre filas en la lista de ajustes.
7. **Popup del calendario con dos turnos:** altura en el celular y posición respecto de la celda; el botón "Agregar turno 2".
8. **"Agregar turno 2" desde el calendario:** precarga la fecha en el formulario; confirmar que queda claro qué completar.
9. **Modal de edición:** no indica de qué turno es el registro que se edita ni que el objetivo por defecto depende del turno.
10. **Texto de la ayuda:** revisar redacción y que el buscador encuentre "doble turno".

---

## 4. Compatibilidad y datos

- **Respaldos de un turno:** no llevan las claves nuevas (`dobleTurno`, `horasDiariasT2`), así que siguen siendo legibles
  por versiones anteriores de la app.
- **Respaldos de doble turno en una versión anterior:** se rechazan con "estructura sospechosa". Es lo buscado (evita que
  la versión vieja descarte el T2), pero **un usuario con doble turno y dos dispositivos tiene que actualizar los dos**
  antes de sincronizar por Gist.
- **`SCHEMA_VERSION`** no se subió. Las claves nuevas ya hacen que las versiones anteriores rechacen el archivo, así que
  no es necesario, pero conviene decidirlo explícitamente.
- **Pila de deshacer:** las reasignaciones de objetivos se guardan dentro del mismo estado, así que deshacer las revierte.
  No hay pruebas de deshacer/rehacer con doble turno.
- **Restablecer el perfil:** pone `dobleTurno = false` y vuelve al onboarding. Confirmar que no queda en almacenamiento
  ningún dato de turnos del perfil anterior (por ejemplo, la info del aviso push con `turno`).

---

## 5. Lo que no cubren los tests

| Área | Situación |
|---|---|
| Interruptor y stepper del T2 en ajustes | Sin test (DOM) |
| Selector Día·T1·T2 y retorno automático | Sin test |
| Popups del calendario con dos turnos | Sin test |
| Push por turno (`_claveRecordatorio`, cancelación por turno, B10) | Sin test |
| Resumen de combinación del Gist con omitidos | Sin test |
| Reasignación de objetivos con salida temprana (B1) | Sin test (falla esperada) |
| Deshacer/rehacer con doble turno | Sin test |
| Estadísticas con un turno abierto (B3) | Sin test |
| Rendimiento con muchos registros (B12) | Sin medir |

---

## 6. Prueba manual sugerida

1. Crear un perfil nuevo → en el onboarding activar **Doble turno** → T1 = 4 h, T2 = 3 h → revisar el total semanal.
2. Fichar la entrada → la tarjeta muestra "T1" y la salida estimada a las 4 h.
3. Fichar la salida antes de las 4 h → modo **Entre turnos**: "Faltan X: se suman al turno 2" y "Próximo: Turno 2".
4. Fichar de nuevo → T2 en curso: la salida estimada incluye el faltante del T1.
5. Intentar un tercer fichaje → "Ya están registrados los 2 turnos de este día".
6. Cerrar el T2 → total del día; tocar T1 y T2 en el selector; esperar a que vuelva a "Día".
7. Calendario: el color del día, el popup con dos bloques y la edición de cada turno.
8. Editar el T2 para que empiece antes que el T1 → se intercambian los objetivos (salvo los editados a mano).
9. Cargar un feriado en un día con jornadas → rechazado; cargar una jornada en un feriado → rechazada.
10. Exportar un respaldo → importarlo en un perfil de un turno: **combinar** se rechaza y **reemplazar** adopta el doble turno.
11. Con avisos activados (cuenta de testing l-lus): aviso del T1, cerrar, abrir el T2 → aviso del T2 con el faltante incluido.
12. Repetir 2 a 7 con un perfil de **un turno** y comparar contra `alpha-1`.
