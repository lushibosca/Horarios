"""Servidor de desarrollo: http.server estándar + Cache-Control: no-store, limitado a los archivos de la app.

Evita que el navegador reutilice copias viejas (p. ej. por un Last-Modified en el futuro
guardado cuando el reloj del sistema estaba adelantado).

La carpeta del proyecto tiene secretos y datos personales (.env, .git, registros.json, horarios-push):
solo se entrega lo que se publica, y solo a pedidos dirigidos a localhost o a una IP (un nombre de dominio
ajeno es la señal de un ataque de DNS rebinding desde otra página abierta en el navegador).

Uso: python3 scripts/servidor.py PUERTO INTERFAZ DIRECTORIO
"""
import ipaddress
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

RUTAS_PERMITIDAS = ("/", "/index.html", "/sw.js")
CARPETAS_PERMITIDAS = ("/assets/", "/src/")


def host_permitido(host):
    """localhost o una IP literal (para probar desde el celular); sin Host no hay rebinding posible."""
    if host is None:
        return True
    nombre = host.strip().lower()
    if nombre.startswith("["):  # IPv6: [::1]:8001
        nombre = nombre[1:].split("]")[0]
    elif nombre.count(":") == 1:
        nombre = nombre.split(":")[0]
    if nombre == "localhost":
        return True
    try:
        ipaddress.ip_address(nombre)
        return True
    except ValueError:
        return False


def ruta_permitida(ruta_cruda):
    """Se decide sobre la ruta decodificada: sin barras invertidas ni segmentos que empiecen con punto (.., .env, .git)."""
    ruta = unquote(ruta_cruda.split("?", 1)[0].split("#", 1)[0])
    if "\\" in ruta or "\0" in ruta:
        return False
    if any(segmento.startswith(".") for segmento in ruta.split("/")):
        return False
    return ruta in RUTAS_PERMITIDAS or ruta.startswith(CARPETAS_PERMITIDAS)


class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        if not host_permitido(self.headers.get("Host")):
            self.send_error(HTTPStatus.FORBIDDEN)
            return None
        if not ruta_permitida(self.path):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        # Ignora los condicionales: siempre 200 con el contenido actual, nunca 304.
        for h in ("If-Modified-Since", "If-None-Match"):
            if h in self.headers:
                del self.headers[h]
        return super().send_head()

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None


if __name__ == "__main__":
    puerto, interfaz, directorio = int(sys.argv[1]), sys.argv[2], sys.argv[3]
    servidor = ThreadingHTTPServer((interfaz, puerto), partial(SinCache, directory=directorio))
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
