# Arquitectura del Frontend — Horarios

**Última actualización:** 2026-11-05  
**Estado:** Arquitectura modularizada y saneada (76 módulos ES en `src/`, grafo 100% acíclico, cero violaciones de capa, `services/` sin acceso al DOM, tests nativos en `tests/` y chequeo de tipos con `tsc`).

---

## 1. Principios y restricciones de diseño

1. **Cero paso de build (Zero-Build):** El frontend se sirve tal cual está en el repositorio sobre GitHub Pages (o cualquier servidor HTTP estático local). No usa Webpack, Vite ni dependencias de `npm` en el cliente. La única `devDependency` es TypeScript, y solo para validar tipos (no transpila nada).
2. **ES Modules nativos (`import` / `export`):** El navegador carga [`src/main.js`](../src/main.js) mediante `<script type="module" src="src/main.js"></script>` y resuelve el grafo de módulos por HTTP/2.
3. **Grafo Acíclico Dirigido (DAG) y Capas Estrictas:** Ningún módulo importa de una capa superior ni forma ciclos de dependencia (`A → ... → A`). Esto está verificado automáticamente por [`tests/architecture.test.mjs`](../tests/architecture.test.mjs).
4. **CSP estricta (`script-src 'self'` y Trusted Types):** Prohibido el uso de handlers inline (`onclick=...`), `eval` o scripts inline en [`index.html`](../index.html). La CSP exige `require-trusted-types-for 'script'`: `innerHTML` solo acepta lo que devuelve la política `horarios` de [`src/core/html.js`](../src/core/html.js) (`montar`/`aHtmlConfiable` con un ``html`...` ``) y el Service Worker se registra con `urlScriptConfiable('./sw.js')`. Una asignación con string común falla en el navegador.
5. **Tipos con JSDoc, sin transpilar:** `npm run typecheck` ejecuta `tsc` (`checkJs`, `strictNullChecks`, `noImplicitReturns`, `noUnusedLocals`, ver [`tsconfig.json`](../tsconfig.json)) sobre todo `src/`. Los tipos se escriben como comentarios `/** @type {...} */`; el navegador sigue recibiendo el JS tal cual.
6. **Offline-first real (`sw.js`):** Todo archivo `.js`, `.css`, `.svg` o `.json` que forme parte de la app **debe** estar listado en `urlsToCache` dentro de [`sw.js`](../sw.js) para que la PWA funcione sin conexión.

---

## 2. Estructura de directorios

```text
horarios/
├── index.html                  # Documento principal (estructura DOM y carga de assets/módulos)
├── sw.js                       # Service Worker (en la raíz para tener scope sobre todo el proyecto)
├── README.md                   # Documentación general del proyecto
├── LICENSE                     # Licencia MIT
├── package.json                # Scripts: test, typecheck, release (solo devDependency: typescript)
├── tsconfig.json               # Configuración de tsc (checkJs sobre src/, sin emitir archivos)
├── scripts/
│   └── release.mjs             # `npm run release`: sube APP_VERSION y CACHE_NAME
├── .github/workflows/
│   └── tests.yml               # CI: npm ci, typecheck y tests en cada push/PR
├── assets/                     # Recursos estáticos (sin lógica de negocio)
│   ├── manifest.json           # Web App Manifest (PWA)
│   ├── styles/                 # Hojas de estilo divididas en 5 capas de cascada
│   │   ├── tokens.css          # 1. Variables (:root), escala de íconos (--icon-sm/md/lg), modo oscuro y temas de color
│   │   ├── base.css            # 2. Reset, layout, .card, forms, botones, modales base y toast
│   │   ├── tarjetas-vistas.css     # 3. Fichaje/timer, estadísticas/progreso, histórico y calendario/popups
│   │   ├── modales-funciones.css # 4. Gist, configuración/toggles, perfiles, onboarding y drag & drop
│   │   └── responsivo-movimiento.css # 5. Keyframes, @media (hover/móvil/escritorio) y reduced-motion
│   └── icons/                  # Íconos de la app y del manifest (SVG y PNG)
├── src/                        # Código fuente en ES Modules (76 módulos)
│   ├── main.js                 # Punto de entrada (bootstrap de la aplicación)
│   ├── data/                   # Catálogos y datos estáticos puros
│   ├── core/                   # Utilidades transversales de bajo nivel (sin reglas de negocio ni UI)
│   ├── services/               # Estado de la aplicación, reglas de dominio y servicios externos
│   └── ui/                     # Componentes visuales, renderizado DOM, eventos y modales
├── tests/                      # Tests automatizados nativos (`npm test` = `node --test tests/*.mjs`, sin dependencias)
│   ├── architecture.test.mjs   # Capas, ciclos, extensiones .js, precache de sw.js, versión APP_VERSION/CACHE_NAME y services sin DOM
│   ├── domain.test.mjs         # Cálculos horarios, seguridad, compensatorios y arranque completo de la UI
│   ├── html.test.mjs           # Escape automático de core/html.js
│   ├── orden-cards.test.mjs    # Columnas libres de escritorio: reparto, mover, columna nueva y límites
│   ├── edicion-registro.test.mjs # Edición de un registro (modal) sin DOM: guardar, validaciones, crédito, compensatorio, eliminar
│   └── servicios-sin-dom.test.mjs # Servicios ejecutados en Node sin `document`, con formularios simulados
├── docs/                       # Documentación técnica, seguridad y arquitectura
└── horarios-push/              # Backend opcional (Cloudflare Worker para Web Push y métricas anónimas)
```

---

## 3. Capas de la arquitectura y dirección de dependencias

La arquitectura se organiza en **4 capas más el punto de entrada (`main.js`)**. La regla fundamental es que **las capas inferiores jamás importan a las capas superiores**:

```text
┌──────────────────────────────────────────────────────────┐
│                      src/main.js                         │
│        (Bootstrap: inicializa OrquestadorUI y InstaladorPWA)    │
└────────────────────────────┬─────────────────────────────┘
                             │ importa
                             ▼
┌──────────────────────────────────────────────────────────┐
│                        src/ui/                           │
│   Renderizado DOM, listeners de eventos, modales,        │
│   animaciones, gráficos SVG y coordinación de vistas.    │
└──────────────┬────────────────────────────┬──────────────┘
               │ importa                    │ importa
               ▼                            │
┌──────────────────────────────────────┐    │
│            src/services/             │    │
│  Estado central (EstadoApp), cálculos │    │
│  de saldos/compensatorios, filtros,  │    │
│  perfiles, Gist, Push y Feriados.    │    │
└──────────────┬───────────────────────┘    │
               │ importa                    │
               ▼                            ▼
┌──────────────────────────────────────────────────────────┐
│                 src/core/   y   src/data/                │
│  Funciones puras de tiempo, sanitización, SHA-256,       │
│  bus de eventos (EventosApp), wrapper de localStorage,    │
│  helpers DOM básicos y catálogos estáticos.              │
└──────────────────────────────────────────────────────────┘
```

### Reglas por carpeta

| Carpeta | Rango de capa | Qué contiene | Qué puede importar | Qué **NO** debe hacer |
|---|---|---|---|---|
| `src/data/` | `0` | Constantes y catálogos estáticos (`FERIADOS_AR`, `FONDOS_SVG`). | Nada (módulos hoja). | No accede a `document`, `window` ni `localStorage`. |
| `src/core/` | `1` | Helpers de infraestructura base (`TiempoUtils`, `SeguridadYUtils`, `Almacenamiento`, `EventosApp`, `html.js`, `dom.js`, `movimiento.js`, `constantes.js`, `tema-inicial.js`, `busqueda-texto.js`, `estilo-calendario.js`, `geometria-etiquetas.js`). | Solo otros módulos de `src/core/` o `src/data/`. | No importa nada de `src/services/` ni `src/ui/`. |
| `src/services/` | `2` | Estado central (`EstadoApp`), lógica de dominio (`GestionDatos`, `Compensatorios`, `FiltrosYPeriodos`, `SaldoSemanal`, `EstadisticasPeriodo`, `EstadoTarjeta`, `TiposRegistro`, `GestorHistorial`), respaldos (`ImportarExportar`, `SincronizacionGist`), perfiles (`GestorPerfiles`), feriados (`FeriadosAR`) y avisos (`RecordatorioPush`). | `src/core/`, `src/data/` y módulos inferiores de `src/services/` sin formar ciclos. | **Prohibido importar de `src/ui/`**. **Prohibido acceder al DOM** (`document`, `$()`), verificado por test. Toda comunicación hacia la UI pasa por `EstadoApp._notify()`, los puertos de formulario o `EventosApp` (ver 3.1). |
| `src/ui/` | `3` | Lectura de inputs, renderizado de tablas/tarjetas/calendario, modales, temas y animaciones. | `src/ui/` (sin ciclos), `src/services/`, `src/core/`, `src/data/`. | No escribe directamente en `localStorage` para datos de registros (usa `GestionDatos` o `Almacenamiento`). No inserta HTML con datos sin pasar por ``html`...` `` (3.2). |
| `src/main.js` | `4` | Arranque en `DOMContentLoaded`. | `OrquestadorUI`, los módulos de `ui/` que enlazan eventos, `InstaladorPWA`, `FeriadosAR` y `RecordatorioPush`. | No contiene lógica de negocio ni handlers extensos. |

---

## 3.1. Cómo hablan los servicios con la UI (sin tocar el DOM)

`src/services/` **no accede al DOM** (ni `document` ni `$()`); lo verifica `tests/architecture.test.mjs`. Hay tres canales, todos inyectados/escuchados desde la UI:

| Canal | Cuándo usarlo | Ejemplo |
|---|---|---|
| `EstadoApp._notify()` (typedef `Notificaciones`) | Órdenes a la UI o consultas con respuesta (toasts, confirmar, cerrar modales). | `notify.mostrarToast(...)`, `notify.confirmarModal(...)` |
| Puertos de formulario (`FormularioRegistro`, `FormularioEdicion`) | Leer o escribir los campos de un formulario. Los implementa [`src/ui/formularios.js`](../src/ui/formularios.js). | `notify.formularioRegistro.leer()` |
| `EventosApp` (bus pub/sub) | Avisar que algo cambió, sin esperar respuesta. | `historial:cambio`, `perfil:cambio`, `filtros:cambio`, `grupo:editar`, `config:hint-integrado` |

Los valores que devuelven los puertos son **crudos**: el servicio los sanitiza y valida. Gracias a esto los servicios se prueban sin DOM (ver `tests/servicios-sin-dom.test.mjs`).

## 3.2. HTML seguro (`core/html.js`)

Para insertar HTML usá la etiqueta ``html`...` ``: escapa cada interpolación (también dentro de atributos entre comillas). Se inserta marcado sin escapar solo si es otro ``html`...` `` anidado o está envuelto en `crudo()`. Un string común **nunca** se interpreta como HTML: `montar(el, contenido)`, `_crearPopupFlotante` y `Animaciones._renderConFirma` rechazan strings comunes. `montar` es el **único** lugar que asigna `innerHTML` (lo verifica `tests/architecture.test.mjs`); para vaciar un elemento se usa `replaceChildren()`.

```js
import { html, montar } from '../core/html.js';
montar(lista, html`<li>${registro.notas}</li>`);   // notas con <script> se muestra como texto
```

---

## 3.3. Diseño libre de tarjetas por columnas

En escritorio (≥ 1024 px) las tarjetas (`estado`, `registrar`, `estadisticas`, `historico`) se ubican donde las suelta el usuario, en hasta **3 columnas** (3 solo desde 1200 px; con menos ancho el máximo es 2). En móvil van apiladas en una sola columna.

| Pieza | Dónde | Qué hace |
|---|---|---|
| Modelo | `STORAGE_KEYS.ORDEN_CARDS` (lista plana, todas las tarjetas, ocultas incluidas) y `STORAGE_KEYS.COLUMNAS_CARDS` (cuántas tarjetas hay en cada columna, ej. `[2, 1, 1]`) | La lista se corta según los tamaños. Sin tamaños válidos (o con una cantidad de tarjetas distinta) se usa el reparto por defecto: solo la última (Registros) en la segunda columna. En móvil solo se usa `ORDEN_CARDS_MOVIL`. |
| Reglas (sin DOM) | [`services/orden-cards.js`](../src/services/orden-cards.js) | `columnasDesdeOrden`, `prepararColumnas` (funde columnas sin tarjetas visibles y respeta el máximo, sin tocar lo guardado), `moverCard` (columna nueva si el destino es `columnas.length`; las vacías desaparecen; con `exigirDosColumnas` un movimiento nunca deja una sola columna). Cubierto por `tests/orden-cards.test.mjs`. |
| UI | [`ui/orden-tarjetas.js`](../src/ui/orden-tarjetas.js) | Tres contenedores (`#columna-1`, `#right-column`, `#columna-3`); `--columnas` y `data-columnas` en `.container` los fija el JS (con 3 columnas el CSS ensancha la página a 1900 px). El arrastre decide la columna por la posición horizontal del puntero y la posición por la vertical; pegada al borde derecho abre una columna nueva, sin ningún indicador previo. |
| Respaldo | `importar-exportar.js` | Exporta/importa `columnasCards`; un respaldo sin esa clave vuelve al reparto por defecto. |

La tarjeta de estado (`#stats-card`, id lógico `estado`) se mueve como las demás pero **no se puede ocultar**; el resto se oculta con la clase `.hidden` (`CARDS`).

## 4. Catálogo completo de módulos (`src/`)

### 4.1. Datos estáticos (`src/data/`)

| Archivo | Export | Responsabilidad |
|---|---|---|
| [`src/data/feriados.js`](../src/data/feriados.js) | `FERIADOS_AR` | Catálogo estático de feriados nacionales de Argentina por año. |
| [`src/data/fondos.js`](../src/data/fondos.js) | `FONDOS_SVG` | Catálogo de ilustraciones SVG decorativas para la tarjeta de fichaje. |

### 4.2. Núcleo transversal (`src/core/`)

| Archivo | Export | Responsabilidad |
|---|---|---|
| [`src/core/tema-inicial.js`](../src/core/tema-inicial.js) | *(script clásico en `<head>`)* | Aplica el tema oscuro y modo de animaciones (`horarios_temaOscuro`, `horarios_reducirAnimaciones` con fallback legado) antes del primer pintado (anti-FOUC) y protege contra clickjacking. |
| [`src/core/constantes.js`](../src/core/constantes.js) | `APP_NOMBRE`, `APP_VERSION`, `APP_STORAGE_PREFIX`, `STORAGE_KEYS`, `CARDS`, `CARDS_ORDEN`, `TOAST_MS`, `DEMORA_ARRANQUE_MS`, `horasGte`, `horasEq` | Prefijo de aplicación (`horarios_`), claves de `localStorage`, tarjetas (`CARDS` = ocultables, `CARDS_ORDEN` = ubicables, con la de estado), duraciones de toasts y demoras de arranque, comparadores de punto flotante con tolerancia y constantes globales. |
| [`src/core/html.js`](../src/core/html.js) | ``html`...` ``, `crudo`, `montar`, `esHtmlSeguro`, `icono`, `aHtmlConfiable`, `urlScriptConfiable` | Plantillas HTML con escape automático de cada interpolación (ver 3.2) e `icono(href, clase)` para los íconos del sprite SVG (`'#icon-…'`). |
| [`src/core/dom.js`](../src/core/dom.js) | `$`, `setColapsable` | `$` (`getElementById` tipado) y helper de contenedores colapsables. |
| [`src/core/eventos.js`](../src/core/eventos.js) | `EventosApp` | Bus de eventos pub/sub (`on`, `off`, `emit`) (`on` devuelve la función para desuscribirse). |
| [`src/core/movimiento.js`](../src/core/movimiento.js) | `Movimiento` | Detección de `prefers-reduced-motion` y helpers de transición. |
| [`src/core/recarga.js`](../src/core/recarga.js) | `Recarga` | Punto único para recargar la app; la UI registra un manejador con fundido (`ui/recarga-gesto.js`). |
| [`src/core/seguridad.js`](../src/core/seguridad.js) | `SeguridadYUtils` | `limpiarTexto` (caracteres de control, espacios y largo; el formato de cada campo se valida después con lista blanca), `normalizarNotas`, `escapeHtml`, `validarRegistroSeguro` (respaldos importados), `repararRegistrosGuardados` y `sanitizarDiasHabiles` (datos propios al cargar), `esObjetivoHorasValido`, cálculo SHA-256 (`calcularHashSHA256` con fallback JS puro) y `reviverJSONSeguro`. |
| [`src/core/almacenamiento.js`](../src/core/almacenamiento.js) | `Almacenamiento` | Lectura/escritura segura en `localStorage` bajo el namespace `horarios_`, migración automática de claves legadas (`migrarClavesLegadas`), manejo de cuota y resolución de clave por perfil (`setProfileKeyResolver`). |
| [`src/core/tiempo-utils.js`](../src/core/tiempo-utils.js) | `TiempoUtils` | Aritmética de horas (`HH:MM` ↔ minutos), diferencia entre horarios, cruces de medianoche, formato de fechas ISO y rangos semanales. |
| [`src/core/busqueda-texto.js`](../src/core/busqueda-texto.js) | `normalizarBusqueda`, `terminosDeBusqueda`, `textoCoincide`, `rangosCoincidencia`, ... | Búsqueda de texto sin distinguir mayúsculas ni acentos, con mapa de posiciones para resaltar coincidencias en el texto original (sin DOM). |
| [`src/core/estilo-calendario.js`](../src/core/estilo-calendario.js) | `EstiloCalendario`, `ESTILOS_CALENDARIO` | Estilo de los días del calendario (`<html data-estilo-calendario>`): lista de estilos, ciclo y etiqueta. `tema-inicial.js` lo aplica antes del primer pintado. |
| [`src/core/geometria-etiquetas.js`](../src/core/geometria-etiquetas.js) | `geometriaConector`, `geometriaDiagonal`, `repartirLados`, `entradaDebeSubir`, `holguraDescripcion`, `holguraHaciaDerecha`, `nivelDescripcion`, constantes | Geometría de las marcas y etiquetas que cuelgan de la barra de progreso (posiciones, lados, colisiones), sin DOM. También decide qué versión de la descripción de un hito enfocado entra en el lugar libre (larga, abreviada o ninguna) |

### 4.3. Servicios y dominio (`src/services/`)

| Archivo | Export | Responsabilidad |
|---|---|---|
| [`src/services/estado-app.js`](../src/services/estado-app.js) | `EstadoApp` | **Store central de dominio** (hoja en `services/`): mantiene `registros`, `diasHabiles`, `horasDiarias`, `historialDiasHabiles`, estado de edición/filtros, `calcularHoras` y canal `notify` y los typedef de los puertos (`Notificaciones`, `FormularioRegistro`, `FormularioEdicion`). |
| [`src/services/gestion-datos.js`](../src/services/gestion-datos.js) | `GestionDatos` | Carga del perfil activo al arrancar (`cargarPerfilActivo`, repara lo guardado con `SeguridadYUtils.repararRegistrosGuardados`) y comandos de dominio: fichaje desde el formulario de la tarjeta (validación de los datos que llegan por el puerto), recálculo de totales, restablecer el perfil y undo/redo. La edición de un registro está en `EdicionRegistro`. No reexporta otros servicios: para leer estado o cálculos se importa el módulo dueño (`EstadoApp`, `Compensatorios`, `FiltrosYPeriodos`, `ImportarExportar`). |
| [`src/services/edicion-registro.js`](../src/services/edicion-registro.js) | `EdicionRegistro` | Modal de edición de un registro: abrir (`editar`), guardar con validaciones, salida temprana y referencia de compensatorio (`guardar`), `eliminar` y `pegarReferencia`. Usa solo el puerto `formularioEdicion`. |
| [`src/services/aviso-jornada.js`](../src/services/aviso-jornada.js) | `AvisoJornada` | Decide qué aviso de fin de jornada corresponde hoy (jornada abierta, objetivo, tiempo fuera y saldo semanal) y lo programa, reprograma o cancela con `RecordatorioPush`. Registra el hook `EstadoApp.sincronizarPushHoy` para los servicios que no pueden importarlo. |
| [`src/services/compensatorios.js`](../src/services/compensatorios.js) | `Compensatorios` | Cálculo de banco de horas extras, asignación cronológica de horas a francos/compensatorios y tramos históricos de días hábiles (consulta y edición: `tramosDiasHabiles`, `editarTramoDias`, `eliminarTramoDias`). |
| [`src/services/filtros-periodos.js`](../src/services/filtros-periodos.js) | `FiltrosYPeriodos` | Filtrado de registros, cálculo de buffer por período, detección de jornada nocturna de ayer, edición de grupos y carga/borrado por rango. |
| [`src/services/importar-exportar.js`](../src/services/importar-exportar.js) | `ImportarExportar` | Armado del respaldo (`armarRespaldo`, el mismo para archivo completo, rango y Gist) y camino único de restauración para archivo local y Gist: `prepararRespaldo` (estructura, versión, SHA-256 y normalización) y `restaurarRespaldo` (combinar o reemplazar y guardar). |
| [`src/services/saldo-semanal.js`](../src/services/saldo-semanal.js) | `SaldoSemanal` | Cálculo de saldos por semana y mes para las vistas de calendario, resumen y estadísticas. |
| [`src/services/estadisticas-periodo.js`](../src/services/estadisticas-periodo.js) | `EstadisticasPeriodo` | Métricas de un período (semana, mes o año): promedios de entrada/salida, regularidad, conteos por tipo, banco de horas y aprovechamiento del saldo. Lo usan `Estadisticas` y `Reportes`. |
| [`src/services/estado-tarjeta.js`](../src/services/estado-tarjeta.js) | `EstadoTarjeta` | Estado de la tarjeta de fichaje (tiempo de hoy, totales y objetivo de la semana, buffer). Lo que depende de la UI (tiempo fuera en curso, registro de ayer retenido) llega por parámetro. |
| [`src/services/tipos-registro.js`](../src/services/tipos-registro.js) | `TiposRegistro` | Definición y consulta de tipos de registro especiales (feriado, vacaciones, enfermedad, compensatorio, remoto, etc.). |
| [`src/services/gestor-historial.js`](../src/services/gestor-historial.js) | `GestorHistorial` | Pila de estados en memoria y `localStorage` para Deshacer (`undo`) y Rehacer (`redo`). |
| [`src/services/gestor-perfiles.js`](../src/services/gestor-perfiles.js) | `GestorPerfiles` | Gestión multi-perfil: alta, renombre y baja con validación del nombre (`crearPerfil`, `renombrarPerfil`, `eliminarPerfil`, que borra las claves por perfil con `Almacenamiento.borrarClavesDePerfil`), cambio de perfil activo y aislamiento de claves en storage. |
| [`src/services/feriados-ar.js`](../src/services/feriados-ar.js) | `FeriadosAR` | Detección de feriados nacionales del mes en curso y sugerencia automática de carga. |
| [`src/services/sincronizacion-gist.js`](../src/services/sincronizacion-gist.js) | `SincronizacionGist` | Cliente HTTP de la API de GitHub Gist (crear, subir, descargar respaldos en la nube y verificar hashes). |
| [`src/services/recordatorio-push.js`](../src/services/recordatorio-push.js) | `RecordatorioPush` | Suscripción Web Push (VAPID), programación y cancelación de recordatorios de fin de jornada con el Worker, y ping diario anónimo de uso (`registrarUso` → `/api/hola`). |
| [`src/services/orden-cards.js`](../src/services/orden-cards.js) | `normalizarOrdenCards`, `columnasDesdeOrden`, `prepararColumnas`, `moverCard` | Orden de las tarjetas (ocultas incluidas; la de estado se mueve pero no se oculta) y su corte en hasta 3 columnas de escritorio (diseño libre), sin DOM. |

### 4.4. Interfaz de usuario (`src/ui/`)

| Archivo | Export | Responsabilidad |
|---|---|---|
| [`src/ui/orquestador.js`](../src/ui/orquestador.js) | `OrquestadorUI` | Coordinador principal de UI: inicializa todos los submódulos visuales, listeners globales y conecta las notificaciones de `GestionDatos`. |
| [`src/ui/base.js`](../src/ui/base.js) | `UIBase` | Helpers de UI propios: errores de campos, toggles de configuración, selects, flashes de campo, descargas, secciones colapsables y apertura de modales con padre. No reexporta: gestos, toasts, botón Fichar, popups, scroll y animaciones se importan de su módulo. |
| [`src/ui/gestos.js`](../src/ui/gestos.js) | `registrarSwipe`, `debounce`, `_crearPressHold` | Gestos táctiles, debounce y botones de mantener presionado. |
| [`src/ui/recarga-gesto.js`](../src/ui/recarga-gesto.js) | `RecargaGesto` | Reemplaza el pull-to-refresh nativo: las tarjetas se desvanecen al tirar y antes de recargar, y aparecen con fundido al cargar. |
| [`src/ui/toast.js`](../src/ui/toast.js) | `mostrarToast`, `_cerrarToastActual`, `_habilitarCierreToast` | Cola de avisos (toasts) con cierre por click o swipe. |
| [`src/ui/boton-fichar.js`](../src/ui/boton-fichar.js) | `resetearBoton`, `animarExitoFichaje`, `setIconoBtn`, ... | Reseteo del botón Fichar y animación del check de éxito. |
| [`src/ui/popups.js`](../src/ui/popups.js) | `_crearPopupFlotante`, `_posicionarPopup`, `_registrarCierrePopup` | Popups flotantes posicionados junto al elemento disparador (exigen ``html`...` ``). |
| [`src/ui/scroll.js`](../src/ui/scroll.js) | `_scrollA`, `_esperarFinScroll`, `_scrollHastaVisible` | Desplazamiento respetando `prefers-reduced-motion`. |
| [`src/ui/formularios.js`](../src/ui/formularios.js) | `Formularios` | Implementación en DOM de los puertos `FormularioRegistro` y `FormularioEdicion` que usan los servicios. |
| [`src/ui/instalador-pwa.js`](../src/ui/instalador-pwa.js) | `InstaladorPWA` | Captura de `beforeinstallprompt`, registro del Service Worker (`sw.js`) y aviso de actualizaciones. |
| [`src/ui/animaciones.js`](../src/ui/animaciones.js) | `Animaciones` | Transiciones suaves de altura, fade/swap de elementos, mutación animada de textos y scroll asistido. `_renderConFirma` reemplaza HTML solo si cambió (`dataset.firma`) y `_conRendersSinAnimar` lo aplica sin animar mientras dura un cambio de vista. |
| [`src/ui/gestor-temas.js`](../src/ui/gestor-temas.js) | `GestorTemas` | Cambio de tema claro/oscuro y sincronización de `meta[name="theme-color"]`. |
| [`src/ui/gestor-modales.js`](../src/ui/gestor-modales.js) | `GestorModales` | Apertura/cierre de modales accesibles, historial de navegación entre modales y diálogos de confirmación (`confirmar`). |
| [`src/ui/tarjeta-fichaje-vista.js`](../src/ui/tarjeta-fichaje-vista.js) | `TarjetaFichajeVista` | Modelo de vista de la tarjeta de fichaje (`derivarVistaHoy`, `derivarVistaSemana`): títulos, hints, colores, línea de salida estimada y preferencias de texto (formato corto, hint integrado). |
| [`src/ui/tarjeta-fichaje.js`](../src/ui/tarjeta-fichaje.js) | `TarjetaFichaje` | Tarjeta principal de fichaje del día/semana: renderizado (barra de progreso, hints) y actualización general a partir de `EstadoTarjeta` y `TarjetaFichajeVista`. Con el ajuste opcional «Hint integrado en la barra» (`STORAGE_KEYS.HINT_INTEGRADO`, apagado por defecto) la entrada, la salida estimada y la salida con buffer se dibujan sobre la barra; apagado, se usa el `toggle-hint` de texto. Al cerrar una jornada de ayer que cruzó la medianoche, el servicio avisa por `retenerRegistroAyer` y la tarjeta la muestra ~4 s (salida y total) antes de pasar a hoy; un nuevo fichaje lo anula. |
| [`src/ui/tarjeta-ciclo-stats.js`](../src/ui/tarjeta-ciclo-stats.js) | `CicloStats` | Ciclo de textos del número grande en la vista diaria (horas → entrada → tiempo fuera → salida si el registro está cerrado; cada 2 s), con su estado propio. Con el hint integrado (`hitosEnBarra`) las fases de entrada, salida y, con el registro abierto, salida estimada y con banco dejan el texto de las horas y solo resaltan su hito en la barra (2,6 s cada una); el tiempo fuera siempre es texto, y sin hint integrado la entrada y la salida también. Avisa la fase que se muestra con `alCambiarFase`. |
| [`src/ui/tarjeta-tiempo-fuera.js`](../src/ui/tarjeta-tiempo-fuera.js) | `TarjetaTiempoFuera` | Cronómetro en vivo de tiempo fuera (pausa/almuerzo) en la tarjeta principal. |
| [`src/ui/tarjeta-lote.js`](../src/ui/tarjeta-lote.js) | `TarjetaLote` | Modo de carga por lote (múltiples días/licencias desde la tarjeta principal) y helpers de inputs de hora/fecha. |
| [`src/ui/tarjeta-fondos.js`](../src/ui/tarjeta-fondos.js) | `TarjetaFondos` | Selector, sanitización segura con `DOMParser` y renderizado de fondos SVG en la tarjeta de fichaje. |
| [`src/ui/calendario.js`](../src/ui/calendario.js) | `Calendario` | Vista de calendario mensual interactivo en el historial, selector de meses/años más la animación de entrada inicial de los días con registro (`animarEntradaInicial`, respeta `Movimiento`). |
| [`src/ui/calendario-popups.js`](../src/ui/calendario-popups.js) | `CalendarioPopups` | Popups de los días del calendario: detalle del registro (click o hover), día sin registro (cargar jornada regular o especial) y resumen de la semana (long press o click secundario). No depende del mes mostrado. |
| [`src/ui/historico.js`](../src/ui/historico.js) | `Historico` | Renderizado de la lista histórica agrupada por año/mes/semana, grupos de licencias y acciones por fila. |
| [`src/ui/historico-items.js`](../src/ui/historico-items.js) | `HistoricoItems` | Filas de la lista histórica: registro individual (badges de estado, compensatorio, comentario) y cabecera de un grupo de licencias consecutivas. |
| [`src/ui/historico-edicion.js`](../src/ui/historico-edicion.js) | `HistoricoEdicion` | Modales de edición individual y de grupo, candado de bloqueo de edición y popup de filtros. |
| [`src/ui/estadisticas.js`](../src/ui/estadisticas.js) | `Estadisticas` | Tarjeta de estadísticas (semanal, mensual, anual): selectores, renderizado de las métricas de `EstadisticasPeriodo` y popups explicativos de cada indicador. |
| [`src/ui/reportes.js`](../src/ui/reportes.js) | `Reportes` | Generación y descarga de reportes HTML autocontenidos con CSP propia y selector de secciones. |
| [`src/ui/configuracion.js`](../src/ui/configuracion.js) | `Configuracion` | Modal de configuración (jornada laboral, días hábiles, toggles de cálculo, selector de fondo y modal de ayuda). |
| [`src/ui/historial-dias.js`](../src/ui/historial-dias.js) | `HistorialDias` | Modal para administrar tramos históricos de días hábiles cuando cambia la jornada laboral del usuario. |
| [`src/ui/perfiles.js`](../src/ui/perfiles.js) | `Perfiles` | Selector de perfil activo y modal de creación/edición/eliminación de perfiles. |
| [`src/ui/gist-respaldo.js`](../src/ui/gist-respaldo.js) | `GistRespaldo` | Configuración de token/ID de GitHub Gist, sincronización manual/automática y resolución de conflictos. |
| [`src/ui/gist-resumen-merge.js`](../src/ui/gist-resumen-merge.js) | `GistResumenMerge` | Resumen previo a aplicar lo bajado del Gist: selector Combinar/Reemplazar, registros resultantes, cambios de configuración y alerta de registros locales que se pierden. |
| [`src/ui/respaldo-local.js`](../src/ui/respaldo-local.js) | `RespaldoLocal` | Modales y flujo de exportación (completa, mensual o por rango) e importación de archivos `.json` locales. |
| [`src/ui/orden-tarjetas.js`](../src/ui/orden-tarjetas.js) | `OrdenTarjetas` | Visibilidad de tarjetas principales y diseño libre por columnas (ver 3.3): arrastre con pulsación larga, teclado (Alt + flechas) y lista de Ajustes. |
| [`src/ui/arrastre.js`](../src/ui/arrastre.js) | `uiArrastreLargo`, `uiAnimarReubicacion`, `REUBICACION_MS` | Arrastre con pulsación larga (puntero capturado, cancelación) y reubicación animada FLIP; genéricos, sin conocer qué se arrastra. |
| [`src/ui/notificaciones.js`](../src/ui/notificaciones.js) | `Notificaciones` | Modal y controles de configuración de avisos Web Push (anticipación, uso de saldo semanal). |
| [`src/ui/bienvenida-modal.js`](../src/ui/bienvenida-modal.js) | `BienvenidaModal` | Onboarding inicial para configurar horas diarias y días hábiles en el primer uso. |
| [`src/ui/aviso-push.js`](../src/ui/aviso-push.js) | `AvisoPush` | Banner sugerido para activar notificaciones de fin de jornada luego de alcanzar el umbral de uso. |
| [`src/ui/aviso-actualizacion.js`](../src/ui/aviso-actualizacion.js) | `AvisoActualizacion` | Toast con barra de progreso mientras el Service Worker descarga una versión nueva. |
| [`src/ui/ayuda-buscador.js`](../src/ui/ayuda-buscador.js) | `AyudaBuscador` | Buscador del modal de ayuda: filtra secciones y resalta coincidencias (Enter recorre). |
| [`src/ui/barra-hitos.js`](../src/ui/barra-hitos.js) | `BarraHitos` | Marcas de la barra de progreso con el hint integrado: hora (vista diaria) o sigla (vista semanal). Solo dibuja; los datos vienen de `tarjeta-fichaje-vista.js`. En la vista diaria mide cada etiqueta y elige qué versión de su descripción entra (`data-desc`, `--desc-ancho`) para el foco; si a la izquierda de la hora no entra completa pero a la derecha sí, prepara el despliegue (`desplegarADerecha`) que abre la descripción hacia ese lado mientras dura el foco, sin mover la hora (con el registro cerrado es el único lado posible). Las etiquetas vecinas están atenuadas durante el foco, así que no cuentan como obstáculo. |
| [`src/ui/foco-hitos.js`](../src/ui/foco-hitos.js) | `FocoHitos` | Resalta en la barra el hito de la fase que muestra el ciclo del número grande (clase `foco` en la etiqueta y la marca, `hay-foco` en la pista). Solo alterna clases; el dibujo (píldora, descripción, pulso) es CSS. `tarjeta-fichaje.js` lo conecta con `CicloStats.alCambiarFase`. |
| [`src/ui/hover-barra.js`](../src/ui/hover-barra.js) | `HoverBarra` | Solo escritorio (puntero con hover): cursor sobre un hito de la vista diaria = su texto con foco (`CicloStats.fijarFase`); sobre el tramo de un día de la vista semanal = total, entrada y salida con el tramo enfocado (`FocoHitos.enfocarDia`). |
| [`src/ui/iconos-animados.js`](../src/ui/iconos-animados.js) | `IconosAnimados` | Animación de íconos al activar un botón: la flecha de subir/bajar (nube o bandeja, dibujadas como base + flecha en el sprite) sale y vuelve a entrar, y deshacer/rehacer dan una vuelta. Respeta «reducir animaciones». |

---

## 5. Guía de decisión: ¿Dónde ubicar una nueva función o módulo?

Cuando necesites agregar una funcionalidad nueva, usá estas preguntas para decidir su ubicación exacta:

### Caso A: Es una función pura (cálculo matemático, formato de fecha/hora, validación o criptografía)
- **¿No depende del dominio de horarios ni del DOM?** → Va en `src/core/`.
  - *Ejemplo:* Convertir minutos a formato decimal (`8.5h`) → [`src/core/tiempo-utils.js`](../src/core/tiempo-utils.js).
  - *Ejemplo:* Validar el formato de una URL o sanitizar un campo nuevo → [`src/core/seguridad.js`](../src/core/seguridad.js).

### Caso B: Es un catálogo estático de datos (sin lógica)
- **¿Es una lista fija de feriados, íconos, plantillas o configuraciones predeterminadas?** → Va en `src/data/`.
  - *Ejemplo:* Nuevos fondos decorativos o feriados de un nuevo año → [`src/data/fondos.js`](../src/data/fondos.js) o [`src/data/feriados.js`](../src/data/feriados.js).

### Caso C: Es una regla de negocio, cálculo sobre los registros o integración con una API/Storage
- **¿Calcula saldos, filtra registros, transforma datos para guardar o habla con una API externa (Gist, Google Drive, Worker)?** → Va en `src/services/`.
  - **Importante:** Si necesita leer el estado (`registros`, `diasHabiles`, `horasDiarias`), debe importar [`EstadoApp`](../src/services/estado-app.js) (`import { EstadoApp } from './estado-app.js'`), **no** `GestionDatos`, para no introducir ciclos. Lo mismo vale para `ui/`: se importa el módulo dueño de cada función (sin reexportaciones ni funciones de reenvío `(...args) => Otro.fn(...args)`).
  - *Ejemplo:* Regla para calcular francos compensatorios → [`src/services/compensatorios.js`](../src/services/compensatorios.js).
  - *Ejemplo:* Sincronización con Google Drive → Nuevo módulo `src/services/drive-sync.js`.

### Caso D: Lee inputs del usuario, modifica el DOM, abre un modal o dibuja en pantalla
- **¿Interactúa con elementos HTML, eventos de click/teclado o muestra alertas?** → Va en `src/ui/`.
  - Si extiende una vista existente y el archivo tiene **menos de 500 líneas**, agregalo en el módulo correspondiente (`calendario.js`, `configuracion.js`, etc.).
  - Si la funcionalidad supera **~250–300 líneas** o tiene un ciclo de vida propio, creá un archivo dedicado en `src/ui/` con prefijo semántico:
    - Subcomponentes de la tarjeta de fichaje: `src/ui/tarjeta-<nombre>.js` (ej. `tarjeta-tiempo-fuera.js`, `tarjeta-ciclo-stats.js`).
    - Partes de un módulo que creció: `src/ui/<padre>-<parte>.js` (ej. `calendario-popups.js`, `historico-items.js`, `gist-resumen-merge.js`); la parte no importa al padre.
    - Vistas o paneles nuevos: un nombre descriptivo en español (ej. `ayuda-buscador.js`, `aviso-actualizacion.js`).
  - **Regla anti-ciclos en `src/ui/`:** Un submódulo hijo (`tarjeta-tiempo-fuera.js`, `reportes.js`, `respaldo-local.js`) **no debe importar** a su módulo padre (`tarjeta-fichaje.js`, `estadisticas.js`, `gist-respaldo.js`). Si necesita notificar un cambio hacia arriba, usá `EventosApp.emit(...)` o inyectá un callback desde el padre.

### Checklist obligatorio al crear o renombrar un archivo `.js`

1. **Usar `import`/`export` con extensión `.js` explícita** (obligatorio en ES Modules nativos del navegador, ej. `import { TiempoUtils } from '../core/tiempo-utils.js';`).
2. **Registrar el archivo en [`sw.js`](../sw.js):**
   - Agregar la ruta en el array `urlsToCache`.
   - La caché se invalida al publicar con `npm run release` (ver «Versionado y releases» más abajo), no a mano.
3. **Correr la suite de validación arquitectónica y de dominio, y el chequeo de tipos:**
   ```bash
   npm test
   npm run typecheck
   ```

---

## 6. Historial de mejoras arquitectónicas aplicadas

| ID | Mejora arquitectónica | Estado |
|---|---|---|
| **ARQ-1** | Partición del monolito `app.js` (11.366 líneas) en módulos ES nativos bajo `src/` y reorganización de `assets/` en la raíz | ✅ Aplicado |
| **ARQ-2** | Eliminación de las 6 violaciones de capa ascendentes (`core` → `services` y `services` → `ui`) mediante `Almacenamiento.setProfileKeyResolver` y callbacks en `EstadoApp._notify()` | ✅ Aplicado |
| **ARQ-3** | Creación de [`src/services/estado-app.js`](../src/services/estado-app.js) y eliminación del 100% de las dependencias circulares en `src/services/` y `src/ui/` (0 ciclos en todo el grafo) | ✅ Aplicado |
| **ARQ-4** | Extracción de [`src/services/filtros-periodos.js`](../src/services/filtros-periodos.js) reduciendo `gestion-datos.js` de 1.004 a 572 líneas | ✅ Aplicado |
| **ARQ-5** | Creación del bus de eventos liviano [`src/core/eventos.js`](../src/core/eventos.js) (`EventosApp`) para comunicación desacoplada entre módulos | ✅ Aplicado |
| **ARQ-6** | Suite de tests automatizados con `node --test` en [`tests/architecture.test.mjs`](../tests/architecture.test.mjs) y [`tests/domain.test.mjs`](../tests/domain.test.mjs) (sin dependencias externas) | ✅ Aplicado |
| **ARQ-7** | `npm test`, `npm run typecheck` y CI en GitHub Actions; `tsc` con `checkJs` + `strictNullChecks` sobre todo `src/` | ✅ Aplicado |
| **ARQ-8** | `services/` sin acceso al DOM: puertos `FormularioRegistro`/`FormularioEdicion` ([`src/ui/formularios.js`](../src/ui/formularios.js)), eventos `historial:cambio`, `perfil:cambio`, `filtros:cambio`, `grupo:editar` y test que lo exige | ✅ Aplicado |
| **ARQ-9** | [`src/core/html.js`](../src/core/html.js): plantillas con escape automático; popups y lista de secciones de reporte migrados | ✅ Aplicado |
| **ARQ-10** | `ui/base.js` (645 → ~280 líneas) dividido en `gestos`, `toast`, `boton-fichar`, `popups` y `scroll`, con `UIBase` como fachada | ✅ Aplicado |
| **ARQ-11** | Versión centralizada (`APP_VERSION`) y `npm run release` para `APP_VERSION` + `CACHE_NAME` | ✅ Aplicado |
| **ARQ-12** | Saneamiento: código muerto eliminado, ~50 funciones de reenvío y reexportaciones quitadas, `GestionDatos` (75 → 14 miembros) y `UIBase` (53 → 18) sin pasamanos, cálculo de estadísticas y de la tarjeta movidos a `services/` (`EstadisticasPeriodo`, `EstadoTarjeta`) con tests sin DOM, `tarjeta-fichaje.js` (1.012 → 540 líneas) dividido con `tarjeta-fichaje-vista.js`, helper `icono()` y reportes con ``html`...` `` | ✅ Aplicado |
| **ARQ-13** | Unificación y endurecimiento: archivo local y Gist restauran por el mismo camino (`prepararRespaldo`/`restaurarRespaldo`), carga del perfil (`cargarPerfilActivo`) y alta/baja/renombre de perfiles movidos a `services/`, datos guardados reparados al cargar, `sanitizeString` reemplazado por `limpiarTexto` + listas blancas, `montar` como único sink de `innerHTML` y CSP con Trusted Types | ✅ Aplicado |
| **ARQ-14** | Módulos de UI por debajo de 500 líneas (`calendario-popups`, `historico-items`, `gist-resumen-merge`, `arrastre`, `tarjeta-ciclo-stats`), aviso de fin de jornada en `services/aviso-jornada.js`, tramos de días hábiles y armado de respaldos (`armarRespaldo`) en servicios, fechas del lote y filtros validadas en el servicio, claves heredadas y 60 exportaciones internas eliminadas | ✅ Aplicado |
| **ARQ-15** | Tarjeta de atajos eliminada; diseño libre de tarjetas en hasta 3 columnas (3.3) con la tarjeta de estado reubicable; `style.display` reemplazado por `.hidden` en los casos aislados; duraciones, tamaño compacto y esperas pasadas a tokens/constantes (`--dur-*`, `--control-sm`, `TOAST_MS`, `DEMORA_ARRANQUE_MS`); `calcularEstadoCard`, `derivarVistaHoy`, `_renderizarCalendario`, `_popupStat` e `iniciarDragTarjetas` divididos en funciones menores | ✅ Aplicado |

---

## Versionado y releases

La versión vive en **dos lugares** porque `sw.js` es un script clásico y no puede importar módulos ES:

| Dónde | Qué es | Para qué sirve |
|---|---|---|
| `APP_VERSION` en [`src/core/constantes.js`](../src/core/constantes.js) (formato `vAAMMDD`) | Versión visible | Se muestra como `LUSHIBOSCA-vAAMMDD` en el título del modal de Ajustes (`main.js`). |
| `CACHE_NAME` en [`sw.js`](../sw.js) (formato `horarios-vAAMMDD.HHMM-cache`) | Nombre de la caché del Service Worker | Si cambia, los clientes instalan el SW nuevo, descargan los archivos y borran la caché vieja. |

**Para publicar:**

```bash
npm run release   # actualiza APP_VERSION y CACHE_NAME con la fecha/hora actual (scripts/release.mjs)
npm test          # valida que ambos coincidan y que sw.js liste todos los módulos de src/
```

Luego commit y push. Los usuarios ven la versión nueva al recargar la app, cuando el navegador detecta que `sw.js` cambió. Sin ejecutar `release`, la PWA instalada sigue mostrando la versión cacheada (estrategia *cache-first*).

`tests/architecture.test.mjs` falla si `APP_VERSION` y el prefijo de `CACHE_NAME` no coinciden.
