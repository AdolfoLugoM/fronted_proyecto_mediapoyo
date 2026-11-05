// Capa de acceso a datos de pacientes.
// El resto de la app SOLO usa estas funciones: HOY leen un JSON y MAÑANA llaman a la API.
// Para conectar la base de datos basta con poner USAR_API = true (y ajustar las URLs).
//
// Cada paciente es UN registro en toda la plataforma (CURP única), pero cada médico solo encuentra
// a SUS pacientes: los que registró, con los que ya se vinculó o con los que tiene una cita o una consulta.
// El ER no tiene una tabla de vínculos: la relación médico-paciente sale de Citas y Consultas
// (más los registros hechos en esta sesión). El navegador nunca sabe con qué otros médicos se atiende alguien.

import { obtenerMedicoActual } from './sesionServicio.js';
import { registrarAuditoria } from './auditoriaServicio.js';

const USAR_API = false;
const URL_JSON = 'JSON/pacientes.json';     // ruta relativa a index.html
const URL_CITAS = 'JSON/citas.json';        // solo para saber qué médico atiende a qué paciente
const URL_CONSULTAS = 'JSON/historial.json';
const URL_API = '/api/pacientes';           // endpoint futuro (backend + base de datos)

// Reglas del documento "Diseño de datos" (paso 6). Con la API real, el servidor debe repetirlas.
const CURP_VALIDA = /^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/;
const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const vacio = (valor) => valor == null || String(valor).trim() === '';

const invalido = (campo, message) => ({ success: false, codigo: 'DATO_INVALIDO', campo, message });

// NumeroTelefono es INT: se guarda como número (vacío = null)
const aTelefono = (valor) => vacio(valor) ? null : Number(String(valor).trim());

// Revisa solo los campos que vienen en "datos" (al crear vienen todos los obligatorios)
function validarPaciente(datos, completo) {
    const presente = (campo) => completo || campo in datos;

    for (const campo of ['nombre', 'apellidos']) {
        if (presente(campo) && vacio(datos[campo])) return invalido(campo, 'El nombre y los apellidos no pueden quedar vacíos.');
    }

    if (presente('curp') && !CURP_VALIDA.test(String(datos.curp ?? '').trim().toUpperCase())) {
        return invalido('curp', 'Escribe una CURP válida de 18 caracteres.');
    }

    if (presente('fechaNacimiento')) {
        const texto = String(datos.fechaNacimiento ?? '').trim();
        const [anio, mes, dia] = texto.split('-').map(Number);
        const fecha = new Date(anio, mes - 1, dia);
        const real = /^\d{4}-\d{2}-\d{2}$/.test(texto) && fecha.getFullYear() === anio &&
            fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
        if (!real || anio < 1900 || fecha > new Date()) return invalido('fechaNacimiento', 'Escribe una fecha de nacimiento válida (no puede ser futura).');
    }

    if (presente('sexo') && !['M', 'F'].includes(datos.sexo)) return invalido('sexo', 'El sexo debe ser M o F.');

    if ('tipoSangre' in datos && !vacio(datos.tipoSangre) && !TIPOS_SANGRE.includes(datos.tipoSangre)) {
        return invalido('tipoSangre', 'Elige un tipo de sangre de la lista.');
    }

    if ('telefono' in datos && !vacio(datos.telefono) && !/^\d{10}$/.test(String(datos.telefono).trim())) {
        return invalido('telefono', 'El teléfono debe tener 10 dígitos, solo números.');
    }

    return null;
}

// Campos que se pueden cambiar al editar (la lista de médicos nunca se toca desde aquí)
const CAMPOS_EDITABLES = ['nombre', 'apellidos', 'curp', 'fechaNacimiento', 'sexo',
    'telefono', 'tipoSangre', 'notas'];

// Lista única en memoria: la leen la búsqueda y la verificación de duplicados,
// y a ella se suman los pacientes nuevos (viven aquí hasta recargar la página).
let cachePacientes = null;
const vinculos = new Map();                // pacienteId -> Set con los ids de sus médicos

const vincular = (pacienteId, medicoId) => {
    if (!vinculos.has(pacienteId)) vinculos.set(pacienteId, new Set());
    vinculos.get(pacienteId).add(medicoId);
};

async function leerTabla(url, tabla) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return (await respuesta.json())[tabla];
}

async function cargarJSON() {
    if (cachePacientes) return cachePacientes;
    
    const [pacientes, citas, consultas] = await Promise.all([
        leerTabla(URL_JSON, 'pacientes'),
        leerTabla(URL_CITAS, 'citas'),
        leerTabla(URL_CONSULTAS, 'consultas')
    ]);
    
    for (const fila of [...citas, ...consultas]) vincular(fila.pacienteId, fila.medicoId);
    
    cachePacientes = pacientes;
    return cachePacientes;
}

// Quita acentos y mayúsculas: "Lopéz" y "lopez" cuentan como lo mismo
function normalizar(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

const esDe = (paciente, medicoId) => vinculos.get(paciente.id)?.has(medicoId) ?? false;

// Copia del paciente para la pantalla (así no modifica la lista en memoria)
const publico = (paciente) => ({ ...paciente });

/**
* Busca pacientes por nombre, apellidos o CURP, solo entre los pacientes del médico en sesión.
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
        esDe(p, medico.id) &&
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

/** Obtiene un paciente por su id (sin la lista de sus médicos). */
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
* ¿El paciente es de ese médico? Solo lo usan las otras capas de servicio
* (por ejemplo, para decidir si un médico puede abrir un historial). Con API, lo decide el servidor.
*/
export async function esPacienteDelMedico(pacienteId, medicoId) {
    const paciente = (await cargarJSON()).find(p => p.id === Number(pacienteId));
    return paciente ? esDe(paciente, medicoId) : false;
}

/**
* SOLO SIMULACIÓN (la usa citasServicio.js): el paciente con esa CURP, si es de ese médico.
* Si es de otro médico responde null igual, para no revelar que existe.
* Con la API, el servidor resuelve la CURP al agendar la cita.
*/
export async function buscarPacientePorCurp(curp, medicoId) {
    const buscada = String(curp ?? '').trim().toUpperCase();
    const paciente = (await cargarJSON()).find(p => p.curp.toUpperCase() === buscada);
    return paciente && esDe(paciente, medicoId) ? publico(paciente) : null;
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
* Registra un paciente para el médico en sesión.
* - CURP nueva: crea el registro.
* - CURP que ya existe con OTRO médico: no la duplica; solo vincula al paciente con este médico.
*   El mensaje es el mismo que en un registro nuevo, para no revelar que se atiende con otro médico.
* - CURP que ya es de ESTE médico: la rechaza (CURP_DUPLICADA).
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
    const problema = validarPaciente(paciente, true);
    if (problema) return problema;

    const curp = paciente.curp.trim().toUpperCase();
    const existente = pacientes.find(p => p.curp.toUpperCase() === curp);
    
    if (existente) {
        if (esDe(existente, medico.id)) {
            return {
                success: false,
                codigo: 'CURP_DUPLICADA',
                message: 'Este paciente ya está entre tus pacientes. Búscalo en la barra superior.'
            };
        }

        // Se atiende con otro médico: se vincula sin crear otro registro y sin cambiar sus datos
        vincular(existente.id, medico.id);
        registrarAuditoria('vincular_paciente', { medicoId: medico.id, pacienteId: existente.id });
        return { success: true, paciente: publico(existente) };
    }
    
    const nuevo = {
        id: Math.max(0, ...pacientes.map(p => p.id)) + 1,
        ...paciente,
        nombre: paciente.nombre.trim(),
        apellidos: paciente.apellidos.trim(),
        telefono: aTelefono(paciente.telefono),    // INT; vacío = null
        tipoSangre: paciente.tipoSangre || null,   // "No definido" = null
        curp
    };
    pacientes.push(nuevo);
    vincular(nuevo.id, medico.id);                     // desde ahora también aparece en la búsqueda de este médico
    registrarAuditoria('registrar_paciente', { medicoId: medico.id, pacienteId: nuevo.id });
    return { success: true, paciente: publico(nuevo) };
}

/**
* Actualiza los datos de un paciente del médico en sesión.
* Recibe SOLO los campos que cambiaron. La lista de médicos nunca se puede tocar desde aquí.
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
    if (!paciente || !esDe(paciente, medico.id)) {
        return { success: false, codigo: 'NO_ENCONTRADO', message: 'No se encontró a este paciente entre tus pacientes.' };
    }
    
    // Solo se copian los campos permitidos (aunque manden otros, se ignoran)
    const limpios = {};
    for (const campo of CAMPOS_EDITABLES) {
        if (campo in cambios) limpios[campo] = String(cambios[campo] ?? '').trim();
    }
    
    const problema = validarPaciente(limpios, false);
    if (problema) return problema;

    if ('curp' in limpios) {
        limpios.curp = limpios.curp.toUpperCase();
        const otro = pacientes.find(p => p.id !== paciente.id && p.curp.toUpperCase() === limpios.curp);
        if (otro) {
            return { success: false, codigo: 'CURP_DUPLICADA', message: 'Esa CURP ya pertenece a otro paciente registrado.' };
        }
    }
    
    if ('tipoSangre' in limpios && limpios.tipoSangre === '') limpios.tipoSangre = null;   // "No definido" = null
    if ('telefono' in limpios) limpios.telefono = aTelefono(limpios.telefono);              // INT; vacío = null
    
    Object.assign(paciente, limpios);
    registrarAuditoria('editar_paciente', { medicoId: medico.id, pacienteId: paciente.id, campos: Object.keys(limpios) });
    return { success: true, paciente: publico(paciente) };
}
