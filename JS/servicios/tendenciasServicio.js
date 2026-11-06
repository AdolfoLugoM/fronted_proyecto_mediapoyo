// Capa de acceso a datos de tendencias regionales.
// Las gráficas SOLO usan obtenerTopEnfermedades(): con USAR_API = false lee un JSON; con true, llama a
// GET /dashboard del backend.
//
// Con el backend, los datos son las consultas del año de TODOS los médicos (solo conteos) y la "región" es la
// ciudad del médico que atendió. El servidor calcula: las 5 enfermedades más diagnosticadas de cada mes, las
// 5 más diagnosticadas del año, el total anual de esas 5 por región y los casos mensuales por región.

import { USAR_API } from '../config.js';
import { pedir, falla } from './api.js';

const URL_JSON = 'JSON/tendencias.json';     // ruta relativa a index.html

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

/**
* Las enfermedades con más casos (por defecto las 5 más comunes), ya ordenadas de mayor a menor.
*/
export async function obtenerTopEnfermedades({ limite = 5, anio } = {}) {
    if (USAR_API) {
        const resp = await pedir('/dashboard', { parametros: { anio } });
        if (!resp.ok) throw new Error(falla(resp, `HTTP ${resp.estado}`).message);

        const d = resp.datos;
        return {
            anio: d.anio,
            meses: MESES,
            regiones: d.total_anual_por_region.map(r => r.region),
            enfermedades: d.top_anual.map(e => ({
                nombre: e.nombre,
                total: e.casos,
                // casos de esta enfermedad en cada región, buscada por nombre (no por posición)
                porRegion: d.total_anual_por_region.map(r => r.enfermedades.find(x => x.nombre === e.nombre)?.casos ?? 0)
            })),
            mensualPorRegion: d.casos_mensuales_por_region.map(r => ({
                region: r.region,
                porMes: r.meses.map(m => m.casos)
            })),
            topPorMes: d.top_por_mes.map(m => ({
                mes: MESES[m.mes - 1],
                enfermedades: m.enfermedades.map(e => ({ nombre: e.nombre, casos: e.casos }))
            }))
        };
    }

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
    
    const enfermedades = resumen.sort((a, b) => b.total - a.total).slice(0, limite);
    const elegidas = new Set(enfermedades.map(e => e.nombre));

    return {
        meses: datos.meses,
        regiones: datos.regiones,
        enfermedades,
        // Casos de las enfermedades elegidas, mes a mes, en cada región
        mensualPorRegion: datos.regiones.map(region => ({
            region,
            porMes: datos.meses.map((_, i) =>
                sumar(datos.enfermedades.filter(e => elegidas.has(e.nombre)).map(e => e.series[region][i])))
        })),
        // Las más diagnosticadas de cada mes (sumando las regiones)
        topPorMes: datos.meses.map((mes, i) => ({
            mes,
            enfermedades: resumen
                .map(e => ({ nombre: e.nombre, casos: e.porMes[i] }))
                .sort((a, b) => b.casos - a.casos)
                .slice(0, limite)
        }))
    };
}
