// Configuración de la conexión con el backend. Es el único lugar donde se cambia.

// true  = la aplicación habla con el backend FastAPI (hay que iniciarlo; ver conexion_backend.txt)
// false = usa los archivos de la carpeta JSON/ (simulación, sin servidor)
export const USAR_API = true;

// Prefijo de la API. Es una ruta relativa: servidor_dev.py reenvía /api/* al backend, así el navegador
// solo habla con un origen y no hace falta CORS. (Si algún día el frontend se publica en otro dominio,
// aquí iría la URL completa del backend y el backend tendría que permitir ese origen con CORS.)
export const API_BASE = '/api/v1';
