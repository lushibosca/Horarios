# Horarios

Registro de horarios laborales personal, 100% del lado del cliente: los datos se guardan en `localStorage` del navegador, con opción de respaldo/restauracion local (JSON) o sincronización automatizable contra un [Gist de GitHub](https://gist.github.com) personal. Pensada para instalarse como PWA y usarse offline.

## Cómo funciona

La app se organiza en 4 tarjetas principales que se pueden reordenar, ocultar y expandir/colapsar, Cada jornada se guarda como un registro con fecha, hora de entrada, hora de salida y, opcionalmente, tiempo fuera, notas y objetivo horario personalizado. 
A partir de estos datos, configuracion de objetivos horarios y dias laborales, la app calcula las distintas metricas de estadisticas y objetivos seleccionados

### 🟢 Tarjeta de Estado (vista diaria)
![tarjeta de estado](./presentation/stat_diario.png)
### 🟢 Tarjeta de Estado (vista semanal)
![tarjeta de estado](./presentation/stat_semanal.png)
### ⏱️ Tarjeta de Fichaje (modo normal)
![tarjeta de fichaje](./presentation/fichar_normal.png)
### ⏱️ Tarjeta de Fichaje (modo lote)
![tarjeta de fichaje](./presentation/fichar_lote.png)
1) campo para seleccionar un registro especial
2) campos para seleccionar un rango
3) alternar entre modo lote y normal
4) 6) pegar fecha actual o limpiar campo

### 📊 Tarjeta de Estadísticas

Métricas calculadas sobre un período elegido (mensual, anual o semanal): tiempo total trabajado, promedio diario, horario de entrada/salida promedio, regularidad de entrada y de jornada, tiempo fuera acumulado, saldo (horas de más/menos contra el objetivo), cantidad de jornadas y salidas tempranas compensadas. Desde acá también se puede generar un **reporte** descargable del período.

### 📋 Tarjeta de Registros

El historial completo, con:
- **Vista de lista** o **vista de calendario** (navegable por mes).
- **Filtros** por tipo de registro.
- **Deshacer / Rehacer** (Ctrl+Z / Ctrl+Y) para revertir cambios recientes.
- **Respaldar / Restaurar** en formato JSON, combinando con los datos existentes o reemplazándolos por completo.
- Edición y eliminación de cualquier registro individual o de un grupo de días con el mismo tipo especial.

## Características

- **Objetivo diario configurable**: un valor global (horas diarias × días laborales de la semana) que además se puede pisar por registro individual, para casos puntuales como una jornada reducida.
- **Tipos de registro especiales**: Feriado, Licencia, Vacaciones, Asueto, Enfermedad, Paro, Remoto, Capacitación y Compensatorio — cada uno con su propio color/ícono y su forma de contabilizarse en las estadísticas.
- **Saldo de horas**: acumula la diferencia entre horas trabajadas y objetivo, con opciones para calcularlo desde el 1° de enero, desde el 1° del mes, o para que cubra o no los faltantes de días anteriores.
- **Tiempo fuera**: se puede descontar de la jornada o ignorarlo por completo, según preferencia.
- **Múltiples perfiles** (hasta 9): útil para llevar varios trabajos o contextos por separado, cada uno con su propia configuración, registros y sincronización.
- **Sincronización con GitHub Gist**: subir/bajar el respaldo manualmente, o automatizarlo con frecuencia y franja horaria configurables, con modo "combinar" o "reemplazar" al detectar diferencias.
- **Días feriados**: soporte para cargar feriados automáticamente.
- **Modo oscuro** y fondos de interfaz personalizables.
- **Instalable como PWA**, con uso offline una vez cargada.
- **Seguridad de los datos**: Content Security Policy estricta, validación y sanitización de todo lo que se importa (tamaño de archivo, formato de fecha/hora, campos permitidos), y límite de 1000 registros por perfil para mantener todo liviano y consistente.

Creado con ia

[chanelog](./CHANELOG.md)
