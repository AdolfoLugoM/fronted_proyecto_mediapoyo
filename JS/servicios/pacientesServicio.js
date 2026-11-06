// Capa de acceso a datos de pacientes.
// El resto de la app SOLO usa estas funciones: HOY leen un JSON y MAÑANA llaman a la API.
// Para conectar la base de datos basta con poner USAR_API = true (y ajustar las URLs).
//
// Cada paciente es UN registro en toda la plataforma (CURP única).
// Con el backend (USAR_API = true) el directorio de pacientes es COMPARTIDO: cualquier médico puede buscar
// y ver a cualquier paciente. Lo que sí es privado son las CONSULTAS: cada médico solo ve las suyas
// (las de otros médicos se abren con su llave; ver consultasServicio.js).
// Con el JSON de pruebas (simulación) cada médico solo encuentra a los pacientes con los que se vinculó.
//
// El backend usa otros nombres de campos (snake_case) y otro código de sexo: aquí se traducen,
// así el resto de la aplicación sigue trabajando con { fechaNacimiento, telefono, tipoSangre, sexo M/F }.
// El backend no guarda correo electrónico (la tabla Pacientes no lo tiene).

import { obtenerMedicoActual } from './sesionServicio.js';
import { registrarAuditoria } from './auditoriaServicio.js';
import { USAR_API } from '../config.js';
import { pedir, falla } from './api.js';

const URL_JSON = 'JSON/pacientes.json';     // ruta relativa a index.html

// Campos que se pueden cambiar al editar (la lista de médicos nunca se toca desde aquí)
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

// ----- Traducción entre la aplicación y el backend -----

// La aplicación usa M (masculino) / F (femenino); la base de datos usa H (hombre) / M (mujer)
const SEXO_A_API = { M: 'H', F: 'M' };
const SEXO_DE_API = { H: 'M', M: 'F' };

// Paciente del backend -> paciente que entiende la aplicación
function deApi(p) {
    return {
        id: p.id,
        nombre: p.nombre,
        apellidos: p.apellidos,
        curp: p.curp,
        fechaNacimiento: p.fecha_nacimiento,
        sexo: SEXO_DE_API[p.sexo] ?? p.sexo,
        telefono: p.numero_telefonico ?? '',
        tipoSangre: p.tipo_de_sangre ?? '',
        notas: p.notas ?? ''
    };
}

// ----- Búsqueda sin acentos -----
// El servidor distingue acentos ("hernandez" no encuentra "Hernández") y el médico no escribe con acentos.
// Para encontrar a la persona igual: se le piden al servidor los pacientes cuyo texto contiene los TRAMOS de
// letras que nunca llevan acento (consonantes, sin la n por la ñ), que es un conjunto mayor que el buscado, y
// aquí se afina comparando sin acentos. "hernandez" -> tramos "h", "r", "d", "z" -> servidor -> "Hernández" ✓.
// Se revisan hasta TOPE_CANDIDATOS pacientes: en un directorio enorme una búsqueda muy corta podría dejar fuera
// coincidencias (el servidor no ordena por relevancia); escribir más letras lo evita.

const TOPE_CANDIDATOS = 500;
const MAX_TRAMOS = 5;                          // el servidor acepta hasta 5 palabras por búsqueda

function tramosSinAcento(termino) {
    return normalizar(termino).split(/[\saeiounñ]+/).filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .slice(0, MAX_TRAMOS);
}

async function buscarSinAcentos(termino) {
    const palabras = normalizar(termino).split(/\s+/).filter(Boolean);
    // Sin tramos (por ejemplo "ae") no hay nada que pedir de forma precisa: se busca el texto tal cual
    const buscar = tramosSinAcento(termino).join(' ') || termino;

    const candidatos = [];
    for (let offset = 0; offset < TOPE_CANDIDATOS; offset += 100) {
        const resp = await pedir('/pacientes', { parametros: { buscar, limit: 100, offset } });
        if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);

        candidatos.push(...resp.datos.items);
        if (resp.datos.items.length === 0 || candidatos.length >= resp.datos.total) break;
    }

    return candidatos.map(deApi).filter(p => {
        const texto = normalizar(`${p.nombre} ${p.apellidos} ${p.curp}`);
        return palabras.every(palabra => texto.includes(palabra));
    });
}

// Campos de la aplicación -> campos del backend (solo los que vienen; "" en un opcional = borrarlo = null)
function haciaApi(campos) {
    const salida = {};
    const vacioANulo = (valor) => (String(valor ?? '').trim() === '' ? null : String(valor).trim());

    if ('nombre' in campos) salida.nombre = campos.nombre;
    if ('apellidos' in campos) salida.apellidos = campos.apellidos;
    if ('curp' in campos) salida.curp = String(campos.curp).trim().toUpperCase();
    if ('fechaNacimiento' in campos) salida.fecha_nacimiento = campos.fechaNacimiento;
    if ('sexo' in campos) salida.sexo = SEXO_A_API[campos.sexo] ?? campos.sexo;
    if ('telefono' in campos) salida.numero_telefonico = vacioANulo(campos.telefono);
    if ('tipoSangre' in campos) salida.tipo_de_sangre = vacioANulo(campos.tipoSangre);
    if ('notas' in campos) salida.notas = vacioANulo(campos.notas);
    return salida;               // "correo" se descarta: el backend no lo guarda
}

// Lo que la pantalla puede ver de un paciente: todo menos la lista de sus médicos
function publico({ medicos, ...paciente }) {
    return paciente;
}

const esDe = (paciente, medicoId) => (paciente.medicos ?? []).includes(medicoId);

/**
* Busca pacientes por nombre, apellidos o CURP, solo entre los pacientes del médico en sesión.
* Devuelve siempre la misma forma, venga del JSON o de la API:
*   { total, pagina, porPagina, resultados: [ { id, nombre, apellidos, curp, ... } ] }
*/
export async function buscarPacientes(termino, { pagina = 1, porPagina = 10 } = {}) {
    if (USAR_API) {
        const coincidencias = await buscarSinAcentos(termino);
        const inicio = (pagina - 1) * porPagina;
        return { total: coincidencias.length, pagina, porPagina, resultados: coincidencias.slice(inicio, inicio + porPagina) };
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
        const resp = await pedir(`/pacientes/${encodeURIComponent(id)}`);
        if (resp.estado === 404) return null;
        if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);
        return deApi(resp.datos);
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
    if (USAR_API) {
        // El directorio es compartido: se busca por CURP y se toma la coincidencia exacta
        const buscada = String(curp ?? '').trim().toUpperCase();
        if (!buscada) return null;
        const resp = await pedir('/pacientes', { parametros: { buscar: buscada, limit: 10 } });
        if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);
        const exacto = resp.datos.items.find(p => p.curp.toUpperCase() === buscada);
        return exacto ? deApi(exacto) : null;
    }

    const buscada = String(curp ?? '').trim().toUpperCase();
    const paciente = (await cargarJSON()).find(p => p.curp.toUpperCase() === buscada);
    return paciente && esDe(paciente, medicoId) ? publico(paciente) : null;
}

/**
* SOLO SIMULACIÓN (la usa citasServicio.js): lo mínimo de varios pacientes para mostrarlos en la agenda.
* Devuelve un Map id -> { id, nombre, apellidos, curp }.
*/
const resumenEnMemoria = new Map();      // con la API: id -> resumen ya pedido (no se vuelve a pedir al mismo paciente)

export async function resumenPacientes(ids) {
    if (USAR_API) {
        const resumen = new Map();
        const faltan = [...new Set(ids.map(Number))].filter(id => !resumenEnMemoria.has(id));

        await Promise.all(faltan.map(async (id) => {
            const paciente = await obtenerPaciente(id);
            if (paciente) {
                resumenEnMemoria.set(id, { id, nombre: paciente.nombre, apellidos: paciente.apellidos, curp: paciente.curp });
            }
        }));

        for (const id of ids.map(Number)) if (resumenEnMemoria.has(id)) resumen.set(id, resumenEnMemoria.get(id));
        return resumen;
    }

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
        const resp = await pedir('/pacientes', { metodo: 'POST', cuerpo: haciaApi(paciente) });

        if (resp.ok) return { success: true, paciente: deApi(resp.datos) };
        if (resp.estado === 409) {
            // Como el directorio es compartido, avisar que ya existe no revela nada: el médico lo puede buscar
            return {
                success: false,
                codigo: 'CURP_DUPLICADA',
                message: 'Ya existe un paciente con esa CURP. Búscalo en la barra superior.'
            };
        }
        return falla(resp, 'No se pudo guardar el paciente.');
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
        if (esDe(existente, medico.id)) {
            return {
                success: false,
                codigo: 'CURP_DUPLICADA',
                message: 'Este paciente ya está entre tus pacientes. Búscalo en la barra superior.'
            };
        }

        // Se atiende con otro médico: se vincula sin crear otro registro y sin cambiar sus datos
        existente.medicos.push(medico.id);
        registrarAuditoria('vincular_paciente', { medicoId: medico.id, pacienteId: existente.id });
        return { success: true, paciente: publico(existente) };
    }
    
    const nuevo = {
        id: Math.max(0, ...pacientes.map(p => p.id)) + 1,
        ...paciente,
        curp,
        medicos: [medico.id]
    };
    pacientes.push(nuevo);                     // desde ahora también aparece en la búsqueda de este médico
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
        const resp = await pedir(`/pacientes/${encodeURIComponent(id)}`, {
            metodo: 'PATCH',                   // PATCH = actualización parcial
            cuerpo: haciaApi(cambios)
        });

        if (resp.ok) return { success: true, paciente: deApi(resp.datos) };
        if (resp.estado === 404) {
            return { success: false, codigo: 'NO_ENCONTRADO', message: 'No se encontró a este paciente.' };
        }
        if (resp.estado === 409) {
            return { success: false, codigo: 'CURP_DUPLICADA', message: 'Esa CURP ya pertenece a otro paciente registrado.' };
        }
        return falla(resp, 'No se pudieron guardar los cambios.');
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
