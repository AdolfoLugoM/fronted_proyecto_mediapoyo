"""Servidor de desarrollo del frontend: sirve las páginas y reenvía /api/* al backend.

Así el navegador habla con un solo origen (http://127.0.0.1:8765) y no hace falta CORS en el backend.
Solo usa la biblioteca estándar de Python (no hay nada que instalar).

Uso, desde la carpeta del frontend (con el backend ya encendido):
    python servidor_dev.py                       # frontend en :8765, backend en http://127.0.0.1:8000
    python servidor_dev.py --puerto 9090 --backend http://127.0.0.1:9000

Es solo para desarrollo: no es un servidor de producción.
"""
import argparse
import functools
import http.server
import json
import urllib.error
import urllib.request
from pathlib import Path

# Cabeceras que se copian de la petición al backend y de la respuesta al navegador
DE_PETICION = ("authorization", "content-type", "accept")
DE_RESPUESTA = ("content-type", "retry-after", "www-authenticate")


class Manejador(http.server.SimpleHTTPRequestHandler):
    backend = "http://127.0.0.1:8000"

    # ---- archivos estáticos: sin caché, para ver los cambios al recargar ----
    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _es_api(self) -> bool:
        return self.path.startswith("/api/")

    def do_GET(self):
        self._proxy() if self._es_api() else super().do_GET()

    def do_HEAD(self):
        self._proxy() if self._es_api() else super().do_HEAD()

    def do_POST(self):
        self._proxy() if self._es_api() else self.send_error(405)

    do_PATCH = do_PUT = do_DELETE = do_POST

    # ---- reenvío al backend ----
    def _proxy(self):
        largo = int(self.headers.get("Content-Length") or 0)
        cuerpo = self.rfile.read(largo) if largo else None
        cabeceras = {k: v for k, v in self.headers.items() if k.lower() in DE_PETICION}

        peticion = urllib.request.Request(
            self.backend + self.path, data=cuerpo, headers=cabeceras, method=self.command
        )
        try:
            with urllib.request.urlopen(peticion, timeout=60) as respuesta:
                self._responder(respuesta.status, respuesta.headers, respuesta.read())
        except urllib.error.HTTPError as error:       # 4xx y 5xx del backend: se pasan tal cual
            self._responder(error.code, error.headers, error.read())
        except (urllib.error.URLError, TimeoutError) as error:
            aviso = {"detail": f"No se pudo conectar con el backend en {self.backend}. ¿Está encendido? ({error})"}
            self._responder(502, {"content-type": "application/json"}, json.dumps(aviso).encode())

    def _responder(self, estado, cabeceras, cuerpo: bytes):
        self.send_response(estado)
        for nombre in DE_RESPUESTA:
            valor = cabeceras.get(nombre)
            if valor:
                self.send_header(nombre, valor)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(cuerpo)


def main():
    parser = argparse.ArgumentParser(description="Sirve el frontend y reenvía /api/* al backend")
    parser.add_argument("--puerto", type=int, default=8765)
    parser.add_argument("--backend", default="http://127.0.0.1:8000", help="URL del backend (sin /api)")
    args = parser.parse_args()

    Manejador.backend = args.backend.rstrip("/")
    carpeta = Path(__file__).resolve().parent
    servidor = http.server.ThreadingHTTPServer(
        ("127.0.0.1", args.puerto), functools.partial(Manejador, directory=str(carpeta))
    )
    print(f"Frontend:  http://127.0.0.1:{args.puerto}/login.html")
    print(f"Backend:   {Manejador.backend}  (las peticiones a /api/* se reenvían ahí)")
    print("Ctrl+C para detener")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido")


if __name__ == "__main__":
    main()
