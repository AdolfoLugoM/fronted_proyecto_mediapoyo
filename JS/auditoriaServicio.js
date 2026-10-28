// Auditoría: quién hizo qué y cuándo.
// En la simulación vive en la memoria de la página y se ve en la consola (F12).
// Con servidor real, cada registro va a la tabla "auditoria" y lo escribe el SERVIDOR,
// nunca el navegador (un registro que el navegador puede escribir, también lo puede falsificar).

const registros = [];

/** Fecha y hora local con el formato de los JSON: "2026-10-20T09:30:00". Sin argumento, la hora actual. */
export function fechaHoraLocal(fecha = new Date()) {
    const dos = (n) => String(n).padStart(2, '0');
    return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
        `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`;
}

/**
* Registra una acción. Los nombres de acción son los mismos del CHECK de la tabla "auditoria":
* abrir_historial, crear_consulta, solicitar_codigo, acceso_codigo, acceso_emergencia,
* registrar_paciente, vincular_paciente.
*/
export function registrarAuditoria(accion, datos = {}) {
    const registro = { fecha: fechaHoraLocal(), accion, ...datos };
    registros.push(registro);
    console.info('[auditoría]', registro);
}
