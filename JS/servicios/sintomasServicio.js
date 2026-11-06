// Capa de acceso a datos del catálogo de síntomas.
// Con USAR_API = false lee un JSON; con true, llama al backend.
//
// Con el backend, la lista trae solo los síntomas que el modelo de predicción entiende (GET /catalogo/sintomas
// ?solo_modelo=true): así cualquiera que se elija en la consulta se puede usar para sugerir enfermedades.
// El catálogo del backend no tiene categorías, por eso "categoria" queda vacía.

import { USAR_API } from '../config.js';
import { traerTodas } from './api.js';

const URL_JSON = 'JSON/sintomas.json';       // ruta relativa a index.html

let cacheSintomas = null;                     // el catálogo casi no cambia: se pide una sola vez

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

/** Devuelve la lista de síntomas: [ { id, nombre, categoria } ] */
export async function obtenerSintomas() {
    if (cacheSintomas) return cacheSintomas;
    
    if (USAR_API) {
        let lista;
        try {
            lista = await traerTodas('/catalogo/sintomas', { solo_modelo: 'true' });
        } catch (error) {
            // Si el modelo no está cargado el servidor no puede filtrar: se usa el catálogo completo
            // (las sugerencias de enfermedad avisarán que el modelo no está disponible)
            console.warn('Catálogo de síntomas sin filtrar por modelo:', error.message);
            lista = await traerTodas('/catalogo/sintomas');
        }

        cacheSintomas = lista.map(({ id, nombre }) => ({ id, nombre, categoria: '' }));
        return cacheSintomas;
    }

    await esperar(150);                       // simula la demora de una red real
    
    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    
    cacheSintomas = (await respuesta.json()).sintomas;
    return cacheSintomas;
}