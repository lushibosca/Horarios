### BUGS ACTUALES
--Bug al tocar el boton bajar de gist y cancelar el gist merge, e ir para atras hasta ajustes,
la pagina llama a "ir para atras" en el navegador

## (Changelog)

### 260625
* **Fix:** ir para atras al quitar filtro, gist merge desde registros, gist merge desde modal gist 
* **Mantenimiento:** se mueve ConfirmarModal a modal manager module, quedando como funcion interna de este modulo y renombrada a Confirmar

### 260623
* **Mejora:** refactor y creacion de helper _crearOpcion, para los pobladores (semana, mes y anios)
* **Mejora:** Se quitan las funciones de gist del scope async function init, quedando en el modudo de uilogic
* **Mejora:** Se elimina return duplicado de window.uilogic con funciones duplicadas, quedado el return de uilogic como unico return.

### 260622
* **Fix:** Se corrige bug al pasar por encima de un dia con registro con popup hover calendario activo, y un popup sin registro abierto.
* **Nuevo:** Se agrega flash en los campos de fecha de la tarjeta fichar, cuando se selecciona una opcion de registro regular o especial
* **Mejora:** Cambios menores en popup-stat para mejor legibilidad
* **Mejora:** Se agrega horas diarias objetivo al popup-stat promedio diario
* **Mejora:** Se agrega validacion de fecha futura en la importacion (local y nube) de registros
* **Mejora:** Se unifica el tipo de cierre en popup con y sin registro al tocarlo nuevamente

### 260621
* **Fix:** bug al abrir popup calendario sin registro con un popup con registro todavia abierto, cerraba el popup sin registro
* **Fix:** Corrección en el *toggle* al modo lote (evita la transición abrupta en el primer uso).
* **Fix:** Se aplica de forma consistente la validacion de fecha futura para registro
regular, se aplicaba en editar registro pero no en la tarjeta de fichar.
* **Nuevo:** Se agrega un *popup* a los días sin registro en el calendario, con opciones para agregar registros regulares o especiales.
* **Mantenimiento:** Se mueve el chanelog del index al readme.md
* **Mejora:** Se agrega limpieza del estado error en campos de tarjeta fichar
* **Mejora:** Se agrega validacion de fecha futura en el popup sin registro, para ocultar
el boton de agregar registro regular.

### 260618
* **Mejora:** Cambios menores en los colores de los botones de edición y configuración.
* **Nuevo:** Se agrega un *popup* a cada `stat-item` con su descripción, y un *flag* opcional en "saldo" y "tiempo fuera" por mes y año.
* **Mejora:** Se incrementa la cantidad máxima de perfiles de 7 a 9, implementando una variable previamente definida pero sin uso.
* **Fix:** Corrección en el botón de crear perfil, vinculado a la implementación de la nueva variable.

### 260617
* **Mejora:** Se modifica la animación del calendario al cambiar de mes.
* **Nuevo:** Se agrega la opción para elegir cómo calcular el saldo anual de estadísticas (desde el primer registro del año o desde el primer día del año).
* **Fix:** Corrección en el cambio de mes con *swipe* en dispositivos móviles para garantizar una transición fluida sin bloqueos por animación.

### 260616
* **Nuevo:** Se agrega el módulo **FERIADOS AR MODULE** para la detección de días festivos y consulta para agregarlos al registro (funcionamiento *hardcodeado*).
* **Fix:** Corrección al restablecer el perfil; no se guardaba correctamente el estado en el `history manager`.

### 260611
* **Mejora:** La función de restablecer ahora persiste el *gist ID* y resetea la configuración de automatización.