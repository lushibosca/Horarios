"""Servidor de desarrollo: http.server estándar + Cache-Control: no-store.

Evita que el navegador reutilice copias viejas (p. ej. por un Last-Modified en el futuro
guardado cuando el reloj del sistema estaba adelantado).
Uso: python3 scripts/servidor.py PUERTO INTERFAZ DIRECTORIO
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # Ignora los condicionales: siempre 200 con el contenido actual, nunca 304.
        for h in ("If-Modified-Since", "If-None-Match"):
            if h in self.headers:
                del self.headers[h]
        return super().send_head()


if __name__ == "__main__":
    puerto, interfaz, directorio = int(sys.argv[1]), sys.argv[2], sys.argv[3]
    servidor = ThreadingHTTPServer((interfaz, puerto), partial(SinCache, directory=directorio))
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
