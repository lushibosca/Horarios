# Horarios

## ✨ Características

* **Registro de jornadas:** Carga de jornadas laborales y días especiales (feriados, vacaciones, licencias).
* **Configuración de objetivos:** Definición de horas diarias objetivo (global o individual) y días laborales por semana.
* **Control en tiempo real:** Visualización del tiempo transcurrido, tiempo restante y saldo semanal.
* **Métricas y estadísticas:** Análisis detallado semanal, mensual y anual en base a los registros.
* **Informes detallados:** Generación de reportes mensuales y anuales.
* **Historial y vistas:** Consulta de registros históricos mediante lista o vista de calendario.
* **Múltiples perfiles:** Gestión de distintos perfiles (personales o laborales).
* **Copias de seguridad:** Creación de backups locales y sincronización en la nube mediante GitHub Gist.

## 🚀 Servidor local

Para iniciar el servidor local de desarrollo:

* **Linux / macOS:**
  ```bash
  ./iniciar.sh [puerto]
  ```
* **Windows:**
  Doble clic en `iniciar.bat`, o desde la terminal (CMD / PowerShell):
  ```cmd
  iniciar.bat [puerto]
  ```
  También puedes usar el script de PowerShell:
  ```powershell
  .\iniciar.ps1 [-Port puerto]
  ```
  *(Por defecto utiliza el puerto 8001)*

## 🧪 Desarrollo

```bash
npm ci               # instala TypeScript (solo para chequear tipos, no hay build)
npm test             # tests nativos de Node (dominio, arquitectura, html seguro)
npm run typecheck    # tsc --checkJs sobre src/ (JSDoc, sin transpilar nada)
```

El código se sirve tal cual: `tsc` solo valida los tipos escritos como JSDoc (`/** @type {...} */`).

### Publicar una versión

```bash
npm run release   # sube APP_VERSION y CACHE_NAME (sw.js) a la fecha/hora actual
npm test          # valida que coincidan y que sw.js liste todos los módulos
```

`release` edita `APP_VERSION` (`src/core/constantes.js`, visible en el título de Ajustes) y `CACHE_NAME` (`sw.js`).
Luego hacé commit y push. Sin cambiar `CACHE_NAME`, los usuarios con la PWA instalada siguen viendo la versión cacheada.
Detalle en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#versionado-y-releases).

## 📚 Documentación

* [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): capas, catálogo de módulos, cómo hablan los servicios con la UI, HTML seguro, versionado y releases.
