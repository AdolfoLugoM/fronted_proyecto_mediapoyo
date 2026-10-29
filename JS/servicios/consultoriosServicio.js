// Capa de acceso a datos de los consultorios.
// HOY lee JSON/consultorios.json; MAÑANA llama a la API (USAR_API = true).
// En la base de datos: tabla "consultorios" (consultorio_id, nombre, ciudad, region).

const USAR_API = false;
const URL_JSON = 'JSON/consultorios.json';     // ruta relativa a index.html
const URL_API = '/api/consultorios';

let cacheConsultorios = null;

async function cargarJSON() {
    if (cacheConsultorios) return cacheConsultorios;
    
    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    
    cacheConsultorios = (await respuesta.json()).consultorios;
    return cacheConsultorios;
}

/** Lista de consultorios: [ { id, nombre, ciudad, region } ] */
export async function obtenerConsultorios() {
    if (USAR_API) {
        const respuesta = await fetch(URL_API);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }
    
    return cargarJSON();
}
