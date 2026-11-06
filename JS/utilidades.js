// Funciones pequeñas que usan varias partes de la app.

/** Edad en años a partir de una fecha "AAAA-MM-DD". Devuelve null si no hay fecha. */
export function calcularEdad(fechaIso) {
    if (!fechaIso) return null;
    
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    const hoy = new Date();
    const mesActual = hoy.getMonth() + 1;
    const aunNoCumple = mesActual < mes || (mesActual === mes && hoy.getDate() < dia);
    
    return hoy.getFullYear() - anio - (aunNoCumple ? 1 : 0);
}

/**
 * Fecha de una consulta. "2026-09-14" -> "lunes, 14 de septiembre de 2026" (fecha sola, sin zona horaria:
 * new Date("2026-09-14") la tomaría como UTC y mostraría el día anterior). Si trae hora, la muestra.
 */
export function formatearFecha(fechaIso) {
    if (fechaIso.includes('T')) return formatearFechaHora(fechaIso);
    const [anio, mes, dia] = fechaIso.split('-').map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-MX', { dateStyle: 'full' });
}

/** "2026-09-14T10:30:00" -> "lunes, 14 de septiembre de 2026, 10:30" (hora local) */
export function formatearFechaHora(fechaIso) {
    return new Date(fechaIso).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });
}
