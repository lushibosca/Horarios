# Barra semanal adaptable a los registros (idea no implementada)

Estado: **probada y revertida** (2026-10-31). Este documento guarda el diseño por si se retoma.
Se probó la variante B (ver abajo), funcionaba y pasaba los tests, pero se prefirió dejar el modelo actual de franjas fijas.

## Contexto: cómo es hoy la barra semanal

Con el *hint integrado* activo, la barra de la vista semanal (`src/ui/tarjeta-fichaje-vista.js`, `_franjasSemana`) usa **franjas fijas por día**:

- Cada día laborable de la semana (o con registro) ocupa una franja de la **pista completa**, proporcional a su objetivo.
  Con 5 días de 7 h, cada franja es 1/5 de la barra.
- Lo trabajado rellena la franja con el color del estado del día (verde cumplió, rojo faltó, dorado cubierto por saldo, azul en curso, color del tipo si es especial). Un día sin registro o futuro deja la franja vacía.
- Hay un hito por día al final de su franja, con flecha curva y sigla (`lun`, `mar`, ...). Los días seguidos del mismo tipo sin horas (sin registro, futuros, especiales del mismo color) se fusionan en un solo hito con rango (`lun–mié`).
- Si dos siglas del mismo lado no entran, la sigla prueba el otro lado y, si tampoco entra, queda solo el punto de anclaje (prioridad: días con horas, luego especiales, luego sin registro).
- Los datos salen de `diasSemana`, que arma `calcularEstadoCard` (`src/services/estado-tarjeta.js`): un elemento por día con `fecha`, `objetivo`, `total`, `activo`, `estado` (`cerrado` | `activo` | `especial` | `sin-registro` | `futuro`) y `especial` (color del tipo).

### Qué no cierra del modelo actual

En una semana con pocos registros la mayor parte de la barra queda como pista vacía (días futuros) y los hitos de los días ya pasados se apilan. Sirvió de disparador de esta idea, en especial una semana con varios días sin registro y uno especial, donde las siglas se encimaban.

## La idea

Que la barra se **adapte a los registros que hay**: si solo existen lunes y martes (con lunes a viernes configurados como laborables), la barra se divide entre esos dos días y no deja lugar a los días futuros.

Hay dos formas de repartir el ancho:

| | Ancho de cada día | Relleno | Con lunes y martes |
|---|---|---|---|
| **A** | Proporcional a las **horas trabajadas** | Siempre llena | Lunes 7 h y martes 3 h: 70% / 30%, todo relleno |
| **B** | Proporcional a su **objetivo**, solo de los días con registro | Horas / objetivo de cada día | Cada uno 50%; el martes con 3 h de 7 h rellena 43% de su mitad |

### Variante A (literal a lo pedido)

La barra se divide según las horas de cada día y siempre ocupa el 100%.
- Contra: un día corto parece "pequeño" aunque haya cumplido, y uno largo parece más importante. Pierde la información de cuánto faltó en cada día.

### Variante B (la que se probó y se recomendó)

Mantiene el relleno por día contra su objetivo, pero solo reparte la barra entre los días que existen. Es el modelo actual **filtrando los días futuros**, más dos ajustes de peso.

## Diseño de la B

1. **Qué días entran:** todos menos `futuro` (cerrados, en curso, especiales y laborables pasados sin registro).
2. **Peso de la franja:**
   - Día con horas (`cerrado` o `activo`): su objetivo (o `horasDiarias` si el objetivo es 0).
   - Día especial o sin registro: un peso fijo y chico, `_PESO_DIA_SIN_HORAS = 1` (1 h). Así no se llevan casi toda la barra cuando hay varios.
3. **Relleno:** igual que hoy. `min(1, total / peso)` con el color del estado; el especial rellena la franja entera.
4. **Hitos y fusión:** igual que hoy, al final de cada franja. Se fusionan días seguidos `sin-registro` o especiales del mismo color (`lun–mié`). Ya no hace falta el tipo `futuro` en la fusión.
5. **Ancho de la parte llena:** termina donde termina el último relleno (`franjas.fin`), como hoy. La pista cubre el 100% de los días que entran.
6. **Remates:** el del comienzo toma el color de la primera franja (`vacio` si está vacía); el del final, el color del último tramo con relleno. Sin cambios.

### Cambios de código (referencia)

Solo `_franjasSemana` en `src/ui/tarjeta-fichaje-vista.js`; el servicio, el render y el CSS no cambian.

```js
const _PESO_DIA_SIN_HORAS = 1;

function _franjasSemana(todosLosDias, horasDiarias) {
    const diasSemana = (todosLosDias ?? []).filter(d => d.estado !== 'futuro');
    if (!diasSemana.length || !(horasDiarias > 0)) return null;
    const conHoras = d => d.estado === 'cerrado' || d.estado === 'activo';
    const pesos = diasSemana.map(d => conHoras(d) ? (d.objetivo > 0 ? d.objetivo : horasDiarias) : _PESO_DIA_SIN_HORAS);
    const total = pesos.reduce((a, b) => a + b, 0);
    // ...resto igual: relleno = especial ? 1 : conHoras(d) ? min(1, d.total / pesos[i]) : 0
    // tipoFusion: 'sin-registro' o `especial-${color}`; prioridad: conHoras(d) ? 2 : especial ? 1 : 0
}
```

Para la **variante A** el cambio es el peso de los días con horas: usar `d.total` en vez de `d.objetivo`, y el relleno pasa a ser siempre 1 (el color sigue siendo el del estado).

### Tests que cambian (`tests/domain.test.mjs`, bloque de franjas)

- Semana de ejemplo con pesos `7 + 7 + 1 + 1 + 1 = 17` (lun cumplido, mar con 3,5 h, mié especial, jue y vie sin registro, sáb futuro): tramos `[0, 7/17]`, `[7/17, 10,5/17]` y `[14/17, 15/17]`; hitos `lun 7/17`, `mar 14/17`, `mié 15/17`, `jue–vie 1`; `anchoBarra = 15/17·100`.
- Caso nuevo "solo lunes y martes": hitos `lun 0,5` y `mar 1`; `anchoBarra = 100`.
- Se mantiene la aserción del remate de inicio `vacio` cuando la primera franja está vacía.

## Contras y riesgos (a decidir antes de retomarlo)

- **La barra deja de mostrar el avance de la semana.** Con la barra repartida solo entre días existentes, una semana con un único día cumplido se ve completa. Lo que falta de la semana queda solo en el texto de abajo ("Faltan …"). Hoy el espacio vacío cuenta cuánto falta.
- **Los hitos se reacomodan** cada vez que se suma un registro y, con el día abierto, a medida que crece su relleno. Las transiciones de `left` lo vuelven un deslizamiento suave, pero se mueve. La variante A además reacomoda por cada minuto trabajado; la B solo al cambiar la cantidad de días.
- **Comparabilidad entre semanas:** al cambiar el ancho de cada franja según cuántos días hay, una misma jornada no mide lo mismo a lo largo de la semana.
- **Días sin registro:** hay que seguir marcándolos (se pidió explícitamente). Por eso la B les da un peso mínimo en lugar de excluirlos.

## Alternativa para conservar el avance

Si se retoma y se quiere no perder la lectura de "cuánto falta": repartir como en la B, pero agregar una marca de **fin de semana esperado** o un trazo tenue de lo que resta hasta el objetivo semanal, o mostrar el porcentaje del objetivo junto al total. No se diseñó en detalle.

## Datos de contexto

- El hint integrado debe estar activo para ver cualquier hito (activo por defecto desde `86085b2`).
- Commit del modelo actual: `2710aa5` (franjas fijas) y `925c15d` (fusión por tipo consecutivo).
- Capturas que motivaron la idea: semanas con varios días sin registro y uno especial, donde las siglas se apilaban en el primer tercio de la barra.
