// Capa de acceso a datos de tendencias regionales.
// Las gráficas SOLO usan obtenerTopEnfermedades(): HOY lee un JSON y MAÑANA llama a la API.
// Para conectar la base de datos basta con poner USAR_API = true (y ajustar URL_API).

const USAR_API = false;
const URL_JSON = 'JSON/tendencias.json';     // ruta relativa a index.html
const URL_API = '/api';                       // base de la API futura (backend + base de datos)

let cacheJSON = null;

async function cargarJSON() {
    if (cacheJSON) return cacheJSON;
    
    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    
    cacheJSON = await respuesta.json();
    return cacheJSON;
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

const sumar = (lista) => lista.reduce((suma, valor) => suma + valor, 0);

// Petición GET a la API; ignora los parámetros sin valor
async function pedirAPI(ruta, parametros = {}) {
    const validos = Object.entries(parametros).filter(([, valor]) => valor != null);
    const consulta = new URLSearchParams(validos).toString();
    
    const respuesta = await fetch(`${URL_API}${ruta}${consulta ? `?${consulta}` : ''}`);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return respuesta.json();
}

/**
* Las enfermedades con más casos (por defecto las 5 más comunes), ya ordenadas de mayor a menor.
* Respuesta:
* {
*   meses: ['Ene', ...],
*   regiones: ['Norte', ...],
*   enfermedades: [
*     { nombre, total, porMes: [12 números], porRegion: [un número por región] }
*   ]
* }
* Con la API, el servidor hace el ORDER BY ... LIMIT: solo viajan las 5 enfermedades.
* Con el JSON de pruebas, "anio" se ignora porque el archivo trae un solo año.
*/
export async function obtenerTopEnfermedades({ limite = 5, anio } = {}) {
    if (USAR_API) return pedirAPI('/tendencias/top', { limite, anio });
    
    await esperar(200);                        // simula la demora de una red real
    const datos = await cargarJSON();
    
    const resumen = datos.enfermedades.map(e => {
        // Casos de cada región en el año
        const porRegion = datos.regiones.map(region => sumar(e.series[region]));
        
        // Casos de cada mes sumando todas las regiones
        const porMes = datos.meses.map((_, i) =>
            sumar(datos.regiones.map(region => e.series[region][i]))
        );
        
        return { nombre: e.nombre, total: sumar(porRegion), porMes, porRegion };
    });
    
    return {
        meses: datos.meses,
        regiones: datos.regiones,
        enfermedades: resumen
            .sort((a, b) => b.total - a.total)
            .slice(0, limite)
    };
}
