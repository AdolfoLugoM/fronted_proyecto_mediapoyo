// Servicio de síntomas: trae el catálogo de síntomas del servidor
import { traerTodas } from './api.js';

// Lista guardada después de la primera consulta: el catálogo casi no cambia, así que no se vuelve a pedir
let cacheSintomas = null;

export async function obtenerSintomas() {
    if (cacheSintomas) return cacheSintomas; // si ya se pidió antes, la devuelve sin molestar al servidor

    let lista;
    try {
        // solo_modelo: únicamente los síntomas que reconoce el modelo que sugiere enfermedades
        lista = await traerTodas('/catalogo/sintomas', { solo_modelo: 'true' });
    } catch (error) {
        // si esa consulta falla, pide el catálogo completo para que la pantalla siga funcionando
        console.warn('Catálogo de síntomas sin filtrar por modelo:', error.message);
        lista = await traerTodas('/catalogo/sintomas');
    }

    // deja solo id y nombre; 'categoria' va vacía porque la pantalla espera ese campo
    cacheSintomas = lista.map(({ id, nombre }) => ({ id, nombre, categoria: '' }));
    return cacheSintomas;
}
