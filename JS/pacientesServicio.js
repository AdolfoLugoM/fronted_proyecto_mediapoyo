// Capa de acceso a datos de pacientes.
// El resto de la app SOLO usa estas funciones: HOY leen un JSON y MAÑANA llaman a la API.
// Para conectar la base de datos basta con poner USAR_API = true (y ajustar las URLs).
//
// Consultorios independientes: cada paciente es UN registro en toda la plataforma (CURP única),
// pero cada consultorio solo encuentra a los pacientes que se atienden con él.
// La lista de consultorios de cada paciente NUNCA sale de esta capa: el navegador no debe saber
// en qué otros lugares se atiende alguien.

import { obtenerMedicoActual } from './sesionServicio.js';
import { registrarAuditoria } from './auditoriaServicio.js';

const USAR_API = false;
const URL_JSON = 'JSON/pacientes.json';     // ruta relativa a index.html
const URL_API = '/api/pacientes';           // endpoint futuro (backend + base de datos)

// Campos que se pueden cambiar al editar (la lista de consultorios nunca se toca desde aquí)
const CAMPOS_EDITABLES = ['nombre', 'apellidos', 'curp', 'fechaNacimiento', 'sexo',
    'telefono', 'correo', 'tipoSangre', 'notas'];

// Lista única en memoria: la leen la búsqueda y la verificación de duplicados,
// y a ella se suman los pacientes nuevos (viven aquí hasta recargar la página).
let cachePacientes = null;

async function cargarJSON() {
    if (cachePacientes) return cachePacientes;

    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    const datos = await respuesta.json();
    cachePacientes = datos.pacientes;
    return cachePacientes;
}

// Quita acentos y mayúsculas: "Lopéz" y "lopez" cuentan como lo mismo
function normalizar(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

// Lo que la pantalla puede ver de un paciente: todo menos la lista de sus consultorios
function publico({ consultorios, ...paciente }) {
    return paciente;
}

const atiendeEn = (paciente, consultorioId) => (paciente.consultorios ?? []).includes(consultorioId);

/**
* Busca pacientes por nombre, apellidos o CURP, solo entre los del consultorio del médico en sesión.
* Devuelve siempre la misma forma, venga del JSON o de la API:
*   { total, pagina, porPagina, resultados: [ { id, nombre, apellidos, curp, ... } ] }
*/
export async function buscarPacientes(termino, { pagina = 1, porPagina = 10 } = {}) {
    if (USAR_API) {
        const parametros = new URLSearchParams({ q: termino, pagina, porPagina });
        const respuesta = await fetch(`${URL_API}?${parametros}`);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }

    await esperar(300);                        // simula la demora de una red real

    const [pacientes, medico] = await Promise.all([cargarJSON(), obtenerMedicoActual()]);
    if (!medico) return { total: 0, pagina, porPagina, resultados: [] };

    const buscado = normalizar(termino);
    const coincidencias = pacientes.filter(p =>
        atiendeEn(p, medico.consultorioId) &&
        normalizar(`${p.nombre} ${p.apellidos} ${p.curp}`).includes(buscado)
    );

    const inicio = (pagina - 1) * porPagina;
    return {
        total: coincidencias.length,
        pagina,
        porPagina,
        resultados: coincidencias.slice(inicio, inicio + porPagina).map(publico)
    };
}

/** Obtiene un paciente por su id (sin la lista de sus consultorios). */
export async function obtenerPaciente(id) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/${encodeURIComponent(id)}`);
        if (respuesta.status === 404) return null;
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }

    await esperar(150);
    const paciente = (await cargarJSON()).find(p => p.id === Number(id));
    return paciente ? publico(paciente) : null;
}

/**
* ¿El paciente se atiende en ese consultorio? Solo lo usan las otras capas de servicio
* (por ejemplo, para decidir si un médico puede abrir un historial). Con API, lo decide el servidor.
*/
export async function atiendeEnConsultorio(pacienteId, consultorioId) {
    const paciente = (await cargarJSON()).find(p => p.id === Number(pacienteId));
    return paciente ? atiendeEn(paciente, consultorioId) : false;
}

/**
* SOLO SIMULACIÓN (la usa citasServicio.js): el paciente con esa CURP, si se atiende en ese consultorio.
* Si se atiende en otro lado responde null igual, para no revelar que existe.
* Con la API, el servidor resuelve la CURP al agendar la cita.
*/
export async function buscarPacientePorCurp(curp, consultorioId) {
    const buscada = String(curp ?? '').trim().toUpperCase();
    const paciente = (await cargarJSON()).find(p => p.curp.toUpperCase() === buscada);
    return paciente && atiendeEn(paciente, consultorioId) ? publico(paciente) : null;
}

/**
* SOLO SIMULACIÓN (la usa citasServicio.js): lo mínimo de varios pacientes para mostrarlos en la agenda.
* Devuelve un Map id -> { id, nombre, apellidos, curp }.
*/
export async function resumenPacientes(ids) {
    const buscados = new Set(ids.map(Number));
    const resumen = new Map();

    for (const p of await cargarJSON()) {
        if (buscados.has(p.id)) resumen.set(p.id, { id: p.id, nombre: p.nombre, apellidos: p.apellidos, curp: p.curp });
    }
    return resumen;
}

/**
* Registra un paciente en el consultorio del médico en sesión.
* - CURP nueva: crea el registro.
* - CURP que ya existe en OTRO consultorio: no la duplica; solo vincula al paciente con este consultorio.
*   El mensaje es el mismo que en un registro nuevo, para no revelar que se atiende en otro lugar.
* - CURP que ya existe en ESTE consultorio: la rechaza (CURP_DUPLICADA).
* Siempre responde { success: true, paciente } o { success: false, codigo, message }.
* Con la API real, el servidor debe volver a validar (y la CURP debe ser UNIQUE en la tabla).
*/
export async function crearPaciente(paciente) {
    if (USAR_API) {
        const respuesta = await fetch(URL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paciente)
        });
        return respuesta.json();
    }

    await esperar(300);

    const medico = await obtenerMedicoActual();
    if (!medico) {
        return { success: false, codigo: 'SIN_SESION', message: 'Inicia sesión como médico para registrar pacientes.' };
    }

    const pacientes = await cargarJSON();
    const curp = paciente.curp.trim().toUpperCase();
    const existente = pacientes.find(p => p.curp.toUpperCase() === curp);

    if (existente) {
        if (atiendeEn(existente, medico.consultorioId)) {
            return {
                success: false,
                codigo: 'CURP_DUPLICADA',
                message: 'Este paciente ya está registrado en tu consultorio. Búscalo en la barra superior.'
            };
        }

        // Se atiende en otro consultorio: se vincula sin crear otro registro y sin cambiar sus datos
        existente.consultorios.push(medico.consultorioId);
        registrarAuditoria('vincular_paciente', { medicoId: medico.id, pacienteId: existente.id });
        return { success: true, paciente: publico(existente) };
    }

    const nuevo = {
        id: Math.max(0, ...pacientes.map(p => p.id)) + 1,
        ...paciente,
        curp,
        consultorios: [medico.consultorioId]
    };
    pacientes.push(nuevo);                     // desde ahora también aparece en la búsqueda de este consultorio
    registrarAuditoria('registrar_paciente', { medicoId: medico.id, pacienteId: nuevo.id });
    return { success: true, paciente: publico(nuevo) };
}

/**
* Actualiza los datos de un paciente del consultorio del médico en sesión.
* Recibe SOLO los campos que cambiaron. La lista de consultorios nunca se puede tocar desde aquí.
* Responde { success: true, paciente } o { success: false, codigo, message }.
* Con la API real, el servidor debe volver a validar todo (permisos, formato y CURP única).
*/
export async function actualizarPaciente(id, cambios) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/${encodeURIComponent(id)}`, {
            method: 'PATCH',                   // PATCH = actualización parcial
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cambios)
        });
        return respuesta.json();
    }

    await esperar(300);

    const medico = await obtenerMedicoActual();
    if (!medico) {
        return { success: false, codigo: 'SIN_SESION', message: 'Inicia sesión como médico para editar pacientes.' };
    }

    const pacientes = await cargarJSON();
    const paciente = pacientes.find(p => p.id === Number(id));
    if (!paciente || !atiendeEn(paciente, medico.consultorioId)) {
        return { success: false, codigo: 'NO_ENCONTRADO', message: 'No se encontró a este paciente en tu consultorio.' };
    }

    // Solo se copian los campos permitidos (aunque manden otros, se ignoran)
    const limpios = {};
    for (const campo of CAMPOS_EDITABLES) {
        if (campo in cambios) limpios[campo] = String(cambios[campo] ?? '').trim();
    }

    if ('curp' in limpios) {
        limpios.curp = limpios.curp.toUpperCase();
        const otro = pacientes.find(p => p.id !== paciente.id && p.curp.toUpperCase() === limpios.curp);
        if (otro) {
            return { success: false, codigo: 'CURP_DUPLICADA', message: 'Esa CURP ya pertenece a otro paciente registrado.' };
        }
    }

    Object.assign(paciente, limpios);
    registrarAuditoria('editar_paciente', { medicoId: medico.id, pacienteId: paciente.id, campos: Object.keys(limpios) });
    return { success: true, paciente: publico(paciente) };
}
