// Capa de acceso a datos del catálogo de enfermedades y de sus síntomas (tabla EnfermedadesDetalle).
// Con USAR_API = false lee dos JSON; con true, llama al backend.
//
// Con el backend:
//   - Las enfermedades vienen de GET /catalogo/enfermedades (todas las páginas; son ~770 y se piden una vez).
//   - Los síntomas de cada enfermedad se piden al elegirla (GET /catalogo/enfermedades/{id}), no todos juntos.
//   - Las sugerencias a partir de síntomas las calcula el modelo de aprendizaje (POST /ml/predecir) y traen
//     una probabilidad estimada. Es orientativo: no es un diagnóstico.

import { USAR_API } from '../config.js';
import { pedir, traerTodas, mensajeDe } from './api.js';
import { obtenerSintomas } from './sintomasServicio.js';

const URL_JSON = 'JSON/enfermedades.json';                 // ruta relativa a index.html
const URL_JSON_DETALLE = 'JSON/enfermedadesDetalle.json';

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
        const lista = await traerTodas('/catalogo/enfermedades');
        cacheEnfermedades = lista
            .map(({ id, nombre, descripcion }) => ({ id, nombre, descripcion: descripcion ?? '' }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        return cacheEnfermedades;
    }

    await esperar(150);                       // simula la demora de una red real
    
    cacheEnfermedades = (await leerJSON(URL_JSON, 'enfermedades'))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return cacheEnfermedades;
}

/**
* Catálogo completo con los síntomas de cada enfermedad, para el navegador de enfermedades.
* Devuelve [ { id, nombre, descripcion, sintomaIds: [ ... ] } ], ordenada por nombre.
* Con el backend, "sintomaIds" es null: sus síntomas se piden al elegir la enfermedad
* (obtenerSintomasDeEnfermedad), porque traerlos todos serían cientos de peticiones.
*/
export async function obtenerEnfermedadesConSintomas() {
    if (USAR_API) {
        return (await obtenerEnfermedades()).map(e => ({ ...e, sintomaIds: null }));
    }

    const [enfermedades, detalle] = await Promise.all([
        obtenerEnfermedades(),
        cacheDetalle ?? leerJSON(URL_JSON_DETALLE, 'detalle')
    ]);
    cacheDetalle = detalle;
    
    return enfermedades.map(e => ({
        ...e,
        sintomaIds: detalle.filter(d => d.enfermedadId === e.id).map(d => d.sintomaId)
    }));
}

const cacheSintomasDe = new Map();            // enfermedadId -> [ { id, nombre } ]

/** Síntomas de UNA enfermedad: [ { id, nombre } ] (o null si la enfermedad no existe). */
export async function obtenerSintomasDeEnfermedad(enfermedadId) {
    if (cacheSintomasDe.has(enfermedadId)) return cacheSintomasDe.get(enfermedadId);

    let sintomas;

    if (USAR_API) {
        const resp = await pedir(`/catalogo/enfermedades/${encodeURIComponent(enfermedadId)}`);
        if (resp.estado === 404) return null;
        if (!resp.ok) throw new Error(mensajeDe(resp, `HTTP ${resp.estado}`));
        sintomas = resp.datos.sintomas.map(({ id, nombre }) => ({ id, nombre }));
    } else {
        const [catalogo, detalle] = await Promise.all([
            obtenerSintomas(),
            cacheDetalle ?? leerJSON(URL_JSON_DETALLE, 'detalle')
        ]);
        cacheDetalle = detalle;
        const porId = new Map(catalogo.map(s => [s.id, s]));
        sintomas = detalle
            .filter(d => d.enfermedadId === enfermedadId)
            .map(d => porId.get(d.sintomaId))
            .filter(Boolean)
            .map(({ id, nombre }) => ({ id, nombre }));
    }

    cacheSintomasDe.set(enfermedadId, sintomas);
    return sintomas;
}

/**
* Enfermedades que podrían explicar los síntomas indicados, de la más probable a la menos.
* Devuelve [ { id, nombre, coincidencias?, total?, probabilidad? } ]:
*   - Con el JSON de pruebas: coincidencias = cuántos de los síntomas indicados tiene la enfermedad y
*     total = cuántos síntomas tiene registrados.
*   - Con el backend: probabilidad (0 a 1) que estima el modelo de aprendizaje. Es orientativa.
*     Lanza un error si el modelo no está disponible (la pantalla lo avisa).
*/
export async function sugerirEnfermedades(sintomaIds, { limite = 5 } = {}) {
    if (sintomaIds.length === 0) return [];

    if (USAR_API) {
        // El modelo recibe los NOMBRES de los síntomas, no sus ids
        const porId = new Map((await obtenerSintomas()).map(s => [s.id, s.nombre]));
        const sintomas = sintomaIds.map(id => porId.get(id)).filter(Boolean);
        if (sintomas.length === 0) return [];

        const resp = await pedir('/ml/predecir', {
            metodo: 'POST',
            cuerpo: { sintomas, top_n: Math.min(limite, 10) }
        });
        if (!resp.ok) throw new Error(mensajeDe(resp, `HTTP ${resp.estado}`));

        // Una sugerencia sin id no está en el catálogo de la base de datos: no se podría elegir
        return resp.datos.sugerencias
            .filter(s => s.enfermedad_id != null)
            .map(s => ({ id: s.enfermedad_id, nombre: s.enfermedad_es, probabilidad: s.probabilidad }));
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
