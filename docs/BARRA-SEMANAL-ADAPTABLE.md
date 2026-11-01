# Barra semanal adaptable a los registros

Estado: **implementada** (commit `5ecea20`, 2026-10-31). Una primera prueba de la variante B con pesos por objetivo se revirtió; este es el diseño que quedó, que reparte la barra por **horas trabajadas** sobre el objetivo semanal.

## Dónde vive

- **Datos** (tramos, hitos, fracciones, descripciones, prioridad): `_franjasSemana` en `src/ui/tarjeta-fichaje-vista.js`.
- **Dibujo** de los hitos (DOM, posiciones, lado de cada etiqueta, badge de hoy): `src/ui/barra-hitos.js` (`_renderSemana`).
- **Geometría pura** de las etiquetas: `src/core/geometria-etiquetas.js`.
- **Estado de cada día** (`diasSemana`): `calcularEstadoCard` en `src/services/estado-tarjeta.js`. Un elemento por día con `fecha`, `objetivo`, `total`, `activo`, `estado` (constantes `ESTADO_DIA`: `cerrado` | `activo` | `especial` | `sin-salida` | `sin-registro` | `futuro`), `especial` (color del tipo) y `cumplimiento` (`CUMPLIMIENTO`, solo en días cerrados: cumplido | cubierto | faltante).
- El hint integrado debe estar activo para ver los hitos (activo por defecto).

## El modelo

La barra se adapta a lo que se trabajó en lugar de repartirse en franjas fijas por día (el modelo anterior, `2710aa5` y `925c15d`, dejaba la mayor parte vacía en semanas con pocos registros y apilaba los hitos).

1. **La pista completa es el objetivo semanal.**
2. **Cada día ocupa un tramo proporcional a las horas que trabajó** (`d.total`), relleno entero con el color de su estado: verde cumplió, rojo faltó, dorado cubierto por saldo, azul en curso, color del tipo si es especial. Un día corto no deja hueco: queda más angosto.
3. **Lo que falta de la semana es el espacio vacío al final.** La parte llena termina donde termina el último tramo (`franjas.fin`), de modo que la barra sigue mostrando el avance.
4. **Con más horas que el objetivo** la pista se estira hasta lo trabajado: todo entra y la barra queda llena, con los días anteriores algo más angostos. No puede crecer más que la tarjeta, así que el exceso solo se lee en el texto ("Vas X de más").
5. **Días sin horas** (especial, sin salida, sin registro, o con registro pero 0 h): un tramo fijo y chico, `_PESO_DIA_SIN_HORAS = 1` (1 h), para poder marcarlos. Los especiales se rellenan con su color; los demás quedan vacíos.
6. **Escala:** `total = max(objetivoSemana, horasTrabajadas) + tramos fijos`. Si se cumple el objetivo con días sin horas de por medio, la barra queda justo llena.

### Qué días entran

Todos menos `futuro`, **salvo hoy**, que entra aunque no tenga registro todavía (tramo fijo, sin relleno). Así el badge de hoy aparece desde el principio del día. Los demás futuros no entran: ese espacio es lo que falta del objetivo.

### Hitos

- Un hito por día, al final de su tramo, con flecha y etiqueta.
- **Fusión:** los días seguidos `sin-registro` o especiales del mismo color forman un solo hito con rango (`lun–mié`). `sin-salida` no se fusiona. **Hoy nunca se fusiona.**
- **Etiquetas:** cada hito trae la `sigla` de tres letras (`lun`, `mar`, `mié`, ...) y la `inicial` (`L`, `M`, `X`, `J`, `V`, `S`, `D`; rango `L–X`). `barra-hitos.js` usa la inicial solo en móviles (`matchMedia('(max-width: 600px)')`, el corte del CSS responsivo; el resize ya redibuja) y la sigla en pantallas más anchas.
- **Descripción** para lectores de pantalla: siempre con la sigla de tres letras (una "M" sola sería ambigua) y `(hoy)` en el día actual, por ejemplo `mié (hoy) día especial`.
- **Prioridad** si no entran todas las etiquetas en un lado (la resuelve `repartirLados`): hoy (3), días con registro (2), especiales y sin salida (1), sin registro (0). La que no entra queda como punto de anclaje.
- **Badge de hoy:** la etiqueta de hoy lleva la clase `linea-etiqueta--hoy`: fondo `--text-main` y texto `--bg-card`, neutros e invertidos en cada tema para no confundirse con los colores de estado. La clase se pone antes de medir la etiqueta, porque el badge cambia su ancho.

### Remates

El del comienzo toma el color de la primera franja (`vacio` si está vacía); el del final, el del último tramo con relleno.

## Ejemplo

Objetivo 35 h; lunes 7 h cumplido, martes 3,5 h faltante, miércoles especial, jueves y viernes sin registro, sábado futuro. Pista = 35 + 3 tramos fijos = 38 h:

| Tramo | Color | Desde → hasta |
|---|---|---|
| lun | verde | 0 → 7/38 |
| mar | rojo | 7/38 → 10,5/38 |
| mié | color del tipo | 10,5/38 → 11,5/38 |
| jue–vie | vacío (un hito fusionado) | hasta 13,5/38 |

El resto de la pista (más del 60 %) es lo que falta. La parte llena mide 11,5/38.

## Tests

`tests/domain.test.mjs`, bloque de franjas: la semana de ejemplo de arriba, dos días con el objetivo sin cumplir (tramos 7/35 y 10,5/35, ancho 30 %), hoy con badge sin fusionar y entrando sin registro, día sin salida (tramo fijo, no se fusiona, sin relleno), semana con exceso (pista estirada, hito final en 1) y el remate de inicio `vacio` con la primera franja vacía.

## Limitaciones conocidas

- **Comparabilidad entre semanas:** el ancho de cada día depende de las horas, así que una misma jornada no mide lo mismo en semanas distintas ni según el total.
- **Exceso poco visible:** una semana con horas de más se ve igual de llena que una justa. Opciones si hace falta: una marca en el objetivo cuando se supera, o mostrar el porcentaje junto al total. No se diseñó.
- **Hitos que se mueven:** al sumar un día, o al crecer el día en curso una vez superado el objetivo, los hitos se reacomodan. Las transiciones de `left` lo vuelven un deslizamiento suave.
- **Tramo fijo de 1 h:** con una pista de unos 300 px mide unos 9 px; si queda justo para el punto y la flecha, se ajusta en `_PESO_DIA_SIN_HORAS`.
- **Badge y flecha:** el padding vertical del badge hace la etiqueta unos 4 px más alta, así que la flecha de hoy puede apuntar apenas fuera del centro.
- **Hoy sin ficharse aún** lo marca `futuro` el servicio. El badge igualmente aparece (ver "Qué días entran"), pero sin relleno.
- **Sin tramos:** si ningún día entra con color (todo sin registro, sin horas), `_franjasSemana` devuelve `null` y la vista cae al progreso clásico.
