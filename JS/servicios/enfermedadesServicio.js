// Servicio de enfermedades: catálogo de enfermedades, sus síntomas y sugerencias de diagnóstico
import { pedir, traerTodas, mensajeDe } from './api.js';
import { obtenerSintomas } from './sintomasServicio.js';

// Catálogo guardado después de la primera consulta, para no volver a pedirlo
let cacheEnfermedades = null;

// Devuelve todas las enfermedades del catálogo, ordenadas alfabéticamente
export async function obtenerEnfermedades() {
    if (cacheEnfermedades) return cacheEnfermedades;

    const lista = await traerTodas('/catalogo/enfermedades');
    cacheEnfermedades = lista
        .map(({ id, nombre, descripcion }) => ({ id, nombre, descripcion: descripcion ?? '' })) // descripción vacía si viene null
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); // localeCompare con 'es' ordena bien las letras con acento
    return cacheEnfermedades;
}

// Igual que la anterior, con 'sintomaIds: null' porque la lista del servidor no trae los síntomas de cada enfermedad
export async function obtenerEnfermedadesConSintomas() {
    return (await obtenerEnfermedades()).map(e => ({ ...e, sintomaIds: null }));
}

// Síntomas ya consultados: enfermedad (id) → su lista de síntomas
const cacheSintomasDe = new Map();

// Devuelve los síntomas de una enfermedad; null si la enfermedad no existe (404)
export async function obtenerSintomasDeEnfermedad(enfermedadId) {
    if (cacheSintomasDe.has(enfermedadId)) return cacheSintomasDe.get(enfermedadId);

    const resp = await pedir(`/catalogo/enfermedades/${encodeURIComponent(enfermedadId)}`);
    if (resp.estado === 404) return null;
    if (!resp.ok) throw new Error(mensajeDe(resp, `HTTP ${resp.estado}`));

    const sintomas = resp.datos.sintomas.map(({ id, nombre }) => ({ id, nombre }));
    cacheSintomasDe.set(enfermedadId, sintomas);
    return sintomas;
}

// Sugiere posibles enfermedades a partir de los síntomas elegidos (las calcula el modelo del servidor)
export async function sugerirEnfermedades(sintomaIds, { limite = 5 } = {}) {
    if (sintomaIds.length === 0) return []; // sin síntomas no hay nada que sugerir

    // el modelo recibe nombres de síntomas, no ids: por eso se busca el nombre de cada id elegido
    const porId = new Map((await obtenerSintomas()).map(s => [s.id, s.nombre]));
    const sintomas = sintomaIds.map(id => porId.get(id)).filter(Boolean); // filter(Boolean) descarta los ids que no se encontraron
    if (sintomas.length === 0) return [];

    const resp = await pedir('/ml/predecir', {
        metodo: 'POST',
        datosUser: { sintomas, top_n: Math.min(limite, 10) } // top_n: cuántas sugerencias pide (máximo 10)
    });
    if (!resp.ok) throw new Error(mensajeDe(resp, `HTTP ${resp.estado}`));

    return resp.datos.sugerencias
        .filter(s => s.enfermedad_id != null) // descarta sugerencias que no existen en el catálogo
        .map(s => ({ id: s.enfermedad_id, nombre: s.enfermedad_es, probabilidad: s.probabilidad }));
}
