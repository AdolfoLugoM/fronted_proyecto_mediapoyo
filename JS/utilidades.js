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

/** "2026-09-14T10:30:00" -> "lunes, 14 de septiembre de 2026, 10:30" (hora local) */
export function formatearFechaHora(fechaIso) {
    return new Date(fechaIso).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });
}

/** "2026-09-14T18:40:00" -> "18:40" (hora local, formato de 24 horas) */
export function formatearHora(fechaIso) {
    return new Date(fechaIso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
