// Servicio de tendencias: trae las estadísticas de enfermedades para las gráficas
import { pedir, falla } from './api.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Pide los datos del dashboard de un año y los acomoda como los necesitan las gráficas
export async function obtenerTopEnfermedades({ anio } = {}) {
    // si 'anio' no viene, pedir() no lo agrega y el servidor elige el año por su cuenta
    const resp = await pedir('/dashboard', { parametros: { anio } });
    if (!resp.ok) throw new Error(falla(resp, `HTTP ${resp.estado}`).message); // falla() arma el mensaje legible del error

    const d = resp.datos;
    return {
        anio: d.anio,
        meses: MESES,
        regiones: d.total_anual_por_region.map(r => r.region), // solo los nombres de las regiones
        enfermedades: d.top_anual.map(e => ({
            nombre: e.nombre,
            total: e.casos,

            // casos de esta enfermedad en cada región (0 si esa región no tuvo ninguno)
            porRegion: d.total_anual_por_region.map(r => r.enfermedades.find(x => x.nombre === e.nombre)?.casos ?? 0)
        })),
        // casos de cada mes, región por región
        mensualPorRegion: d.casos_mensuales_por_region.map(r => ({
            region: r.region,
            porMes: r.meses.map(m => m.casos)
        })),
        // enfermedades más frecuentes de cada mes (el servidor manda el mes como 1-12; aquí se cambia a su nombre)
        topPorMes: d.top_por_mes.map(m => ({
            mes: MESES[m.mes - 1],
            enfermedades: m.enfermedades.map(e => ({ nombre: e.nombre, casos: e.casos }))
        }))
    };
}
