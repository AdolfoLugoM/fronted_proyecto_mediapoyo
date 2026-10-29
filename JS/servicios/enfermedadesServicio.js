// Capa de acceso a datos del catálogo de enfermedades y de sus síntomas (tabla EnfermedadesDetalle).
// HOY lee dos JSON; MAÑANA llama a la API (poniendo USAR_API = true).

const USAR_API = false;
const URL_JSON = 'JSON/enfermedades.json';                 // ruta relativa a index.html
const URL_JSON_DETALLE = 'JSON/enfermedadesDetalle.json';
const URL_API = '/api/enfermedades';                        // endpoint futuro (backend + base de datos)

let cacheEnfermedades = null;                 // el catálogo casi no cambia: se pide una sola vez
let cacheDetalle = null;

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

async function leerJSON(url, propiedad) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return (await respuesta.json())[propiedad];
}

/** Devuelve la lista de enfermedades: [ { id, nombre, descripcion } ], ordenada por nombre. */
export async function obtenerEnfermedades() {
    if (cacheEnfermedades) return cacheEnfermedades;

    if (USAR_API) {
        const respuesta = await fetch(URL_API);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        cacheEnfermedades = await respuesta.json();
        return cacheEnfermedades;
    }

    await esperar(150);                       // simula la demora de una red real

    cacheEnfermedades = (await leerJSON(URL_JSON, 'enfermedades'))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return cacheEnfermedades;
}

/**
* Enfermedades que tienen los síntomas indicados, de la más probable a la menos.
* Devuelve [ { id, nombre, coincidencias, total } ]:
*   coincidencias = cuántos de los síntomas indicados tiene la enfermedad
*   total         = cuántos síntomas tiene registrados la enfermedad
* Con la API, el servidor hace el JOIN con EnfermedadesDetalle y el GROUP BY.
*/
export async function sugerirEnfermedades(sintomaIds, { limite = 5 } = {}) {
    if (sintomaIds.length === 0) return [];

    if (USAR_API) {
        const parametros = new URLSearchParams({ sintomas: sintomaIds.join(','), limite });
        const respuesta = await fetch(`${URL_API}/sugerencias?${parametros}`);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }

    const [enfermedades, detalle] = await Promise.all([
        obtenerEnfermedades(),
        cacheDetalle ?? leerJSON(URL_JSON_DETALLE, 'detalle')
    ]);
    cacheDetalle = detalle;

    const buscados = new Set(sintomaIds);
    const conteo = new Map();                 // enfermedadId -> { coincidencias, total }

    for (const { enfermedadId, sintomaId } of detalle) {
        const fila = conteo.get(enfermedadId) ?? { coincidencias: 0, total: 0 };
        fila.total += 1;
        if (buscados.has(sintomaId)) fila.coincidencias += 1;
        conteo.set(enfermedadId, fila);
    }

    return enfermedades
        .map(e => ({ id: e.id, nombre: e.nombre, ...(conteo.get(e.id) ?? { coincidencias: 0, total: 0 }) }))
        .filter(e => e.coincidencias > 0)
        // Primero las que tienen más síntomas en común; a empate, la que tenga mayor proporción cubierta
        .sort((a, b) => b.coincidencias - a.coincidencias || b.coincidencias / b.total - a.coincidencias / a.total)
        .slice(0, limite);
}
