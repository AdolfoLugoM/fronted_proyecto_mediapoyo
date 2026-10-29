// Capa de acceso a datos del catálogo de síntomas.
// HOY lee un JSON; MAÑANA llama a la API (poniendo USAR_API = true).

const USAR_API = false;
const URL_JSON = 'JSON/sintomas.json';       // ruta relativa a index.html
const URL_API = '/api/sintomas';              // endpoint futuro (backend + base de datos)

let cacheSintomas = null;                     // el catálogo casi no cambia: se pide una sola vez

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

/** Devuelve la lista de síntomas: [ { id, nombre, categoria } ] */
export async function obtenerSintomas() {
    if (cacheSintomas) return cacheSintomas;
    
    if (USAR_API) {
        const respuesta = await fetch(URL_API);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        cacheSintomas = await respuesta.json();
        return cacheSintomas;
    }
    
    await esperar(150);                       // simula la demora de una red real
    
    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    
    cacheSintomas = (await respuesta.json()).sintomas;
    return cacheSintomas;
}