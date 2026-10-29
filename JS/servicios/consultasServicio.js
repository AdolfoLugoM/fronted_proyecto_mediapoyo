// Capa de acceso a datos de consultas.
// HOY lee y guarda sobre JSON/historial.json (en memoria); MAÑANA llama a la API (USAR_API = true).
//
// Tabla Consultas: id, pacienteId, medicoId, enfermedadId, edad, peso (kg), altura (cm), fecha, llave, notas.
//
// Quién ve el detalle de una consulta (enfermedad, medidas y notas):
//   1. El médico que la hizo: siempre, sin pedir nada.
//   2. Otro médico: solo la consulta cuya LLAVE le dé el paciente (cada consulta tiene la suya
//      y se le entrega al paciente al terminarla). Desbloquea solo esa consulta.
// Todo queda en la auditoría. Las notas del PACIENTE (alergias, enfermedades crónicas) NO pasan por aquí:
// están en su ficha y siempre se ven, por seguridad.

import { obtenerEnfermedades } from './enfermedadesServicio.js';
import { obtenerMedicos } from './medicosServicio.js';
import { obtenerMedicoActual } from './sesionServicio.js';
import { obtenerPaciente, atiendeEnConsultorio } from './pacientesServicio.js';
import { registrarAuditoria, fechaHoraLocal } from './auditoriaServicio.js';
import { calcularEdad } from '../utilidades.js';

const USAR_API = false;
const URL_JSON = 'JSON/historial.json';      // ruta relativa a index.html
const URL_API = '/api';                       // base de la API futura

const LARGO_LLAVE = 8;
const ALFABETO_LLAVE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin O/0 ni I/1, que se confunden al dictar

// Rangos válidos de las medidas (los mismos que min/max del formulario)
const PESO = { min: 0.5, max: 400 };          // kg
const ALTURA = { min: 30, max: 250 };         // cm

// Lista única en memoria: la lee el historial y a ella se suman las consultas nuevas
// (viven aquí hasta recargar la página).
let cacheConsultas = null;
const desbloqueos = new Map();                // "medico-paciente" -> Set con los ids de las consultas desbloqueadas con su llave

async function cargarJSON() {
    if (cacheConsultas) return cacheConsultas;

    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    cacheConsultas = (await respuesta.json()).consultas;
    return cacheConsultas;
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));
const clave = (medicoId, pacienteId) => `${medicoId}-${pacienteId}`;

// Respuestas de error con la misma forma que dará la API
const sinSesion = () => ({ success: false, codigo: 'SIN_SESION', message: 'Inicia sesión como médico para continuar.' });
const sinPermiso = () => ({ success: false, codigo: 'SIN_PERMISO', message: 'Este paciente no está registrado en tu consultorio.' });
const datoInvalido = (campo, message) => ({ success: false, codigo: 'DATO_INVALIDO', campo, message });

// ----- Llaves -----

// Llave de una consulta nueva (32 símbolos: 256 % 32 = 0, así que no hay sesgo)
function generarLlave() {
    const azar = crypto.getRandomValues(new Uint8Array(LARGO_LLAVE));
    return [...azar].map(b => ALFABETO_LLAVE[b % ALFABETO_LLAVE.length]).join('');
}

// "q5kr-9mgu" y "Q5KR9MGU" cuentan como la misma llave
const normalizarLlave = (texto) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ----- Funciones que usa la aplicación -----

/**
* Historial de un paciente (la consulta más reciente primero).
* Responde { success: true, consultas } o { success: false, codigo, message }.
*   consultas: SOLO las que el médico puede ver: [ { id, fecha, propia, llave, medico, detalle } ]
*     - propia: la hizo el médico en sesión
*     - llave:  solo en las propias, para que se la pueda volver a dar al paciente
*     - detalle: { enfermedad: { id, nombre } | null, edad, peso, altura, notas }
* Las consultas sin permiso NO se envían: ni siquiera se revela que existen hasta que se escriba su llave.
*/
export async function obtenerHistorial(pacienteId) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/pacientes/${encodeURIComponent(pacienteId)}/consultas`);
        return respuesta.json();
    }

    await esperar(200);                        // simula la demora de una red real

    const id = Number(pacienteId);
    const medico = await obtenerMedicoActual();
    if (!medico) return sinSesion();
    if (!await atiendeEnConsultorio(id, medico.consultorioId)) return sinPermiso();

    const [consultas, medicos, enfermedades] = await Promise.all([
        cargarJSON(),
        obtenerMedicos(),
        obtenerEnfermedades().catch(() => [])  // si el catálogo no carga, se muestra "Enfermedad N"
    ]);

    const nombreMedico = new Map(medicos.map(m => [m.id, `${m.nombre} ${m.apellidos}`]));
    const nombreEnfermedad = new Map(enfermedades.map(e => [e.id, e.nombre]));

    const desbloqueadas = desbloqueos.get(clave(medico.id, id)) ?? new Set();
    registrarAuditoria('abrir_historial', { medicoId: medico.id, pacienteId: id });

    return {
        success: true,
        consultas: consultas
            .filter(c => c.pacienteId === id && (c.medicoId === medico.id || desbloqueadas.has(c.id)))
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map(c => {
                const propia = c.medicoId === medico.id;

                return {
                    id: c.id,
                    fecha: c.fecha,
                    propia,
                    llave: propia ? c.llave : null,
                    medico: { id: c.medicoId, nombre: nombreMedico.get(c.medicoId) ?? 'Médico no identificado' },
                    detalle: {
                        enfermedad: c.enfermedadId == null
                            ? null
                            : { id: c.enfermedadId, nombre: nombreEnfermedad.get(c.enfermedadId) ?? `Enfermedad ${c.enfermedadId}` },
                        edad: c.edad,
                        peso: c.peso,
                        altura: c.altura,
                        notas: c.notas ?? ''
                    }
                };
            })
    };
}

/**
* Desbloquea UNA consulta de otro médico con la llave que el paciente recibió en ella.
* Busca entre las consultas de ese paciente la que tenga esa llave.
* Responde { success: true, consultaId, yaVisible } o { success: false, codigo, message }.
*   yaVisible: true si esa consulta ya se podía ver (la hizo él, o ya la había desbloqueado)
* El desbloqueo dura lo que la sesión (en la simulación, hasta recargar la página).
*/
export async function desbloquearConsulta(pacienteId, llaveEscrita) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/pacientes/${encodeURIComponent(pacienteId)}/desbloquear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ llave: llaveEscrita })        // en el cuerpo, nunca en la URL
        });
        return respuesta.json();
    }

    await esperar(300);

    const id = Number(pacienteId);
    const medico = await obtenerMedicoActual();
    if (!medico) return sinSesion();
    if (!await atiendeEnConsultorio(id, medico.consultorioId)) return sinPermiso();

    const buscada = normalizarLlave(llaveEscrita);
    if (buscada.length !== LARGO_LLAVE) {
        return { success: false, codigo: 'LLAVE_INVALIDA', message: `La llave tiene ${LARGO_LLAVE} caracteres.` };
    }

    const consulta = (await cargarJSON()).find(c => c.pacienteId === id && normalizarLlave(c.llave) === buscada);

    if (!consulta) {
        registrarAuditoria('llave_incorrecta', { medicoId: medico.id, pacienteId: id });
        return { success: false, codigo: 'LLAVE_INCORRECTA', message: 'Ninguna consulta de este paciente tiene esa llave.' };
    }

    // Si la hizo él mismo o ya la había desbloqueado, no hay nada nuevo que desbloquear
    const k = clave(medico.id, id);
    if (!desbloqueos.has(k)) desbloqueos.set(k, new Set());
    const yaVisible = consulta.medicoId === medico.id || desbloqueos.get(k).has(consulta.id);

    if (!yaVisible) {
        desbloqueos.get(k).add(consulta.id);
        registrarAuditoria('desbloquear_consulta', { medicoId: medico.id, pacienteId: id, consultaId: consulta.id });
    }

    return { success: true, consultaId: consulta.id, yaVisible };
}

/**
* Guarda una consulta nueva a nombre del médico en sesión.
* Recibe { pacienteId, enfermedadId (o null), peso, altura, notas }.
* La edad, la fecha y la llave NO vienen del formulario: las pone el servicio (con la API, el servidor).
* Responde { success: true, id, llave } o { success: false, codigo, message, campo? }.
*/
export async function crearConsulta(consulta) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/consultas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(consulta)
        });
        return respuesta.json();
    }

    await esperar(300);

    const medico = await obtenerMedicoActual();
    if (!medico) return sinSesion();

    const pacienteId = Number(consulta.pacienteId);
    if (!await atiendeEnConsultorio(pacienteId, medico.consultorioId)) return sinPermiso();

    // Mismas validaciones que hará el servidor (el formulario se puede saltar)
    const peso = Number(consulta.peso);
    if (!(peso >= PESO.min && peso <= PESO.max)) return datoInvalido('peso', `El peso debe estar entre ${PESO.min} y ${PESO.max} kg.`);

    const altura = Number(consulta.altura);
    if (!(altura >= ALTURA.min && altura <= ALTURA.max)) return datoInvalido('altura', `La altura debe estar entre ${ALTURA.min} y ${ALTURA.max} cm.`);

    let enfermedadId = null;
    if (consulta.enfermedadId != null && consulta.enfermedadId !== '') {
        enfermedadId = Number(consulta.enfermedadId);
        const existe = (await obtenerEnfermedades()).some(e => e.id === enfermedadId);
        if (!existe) return datoInvalido('enfermedad', 'Elige una enfermedad del catálogo.');
    }

    const paciente = await obtenerPaciente(pacienteId);
    const consultas = await cargarJSON();

    // La llave debe ser única en toda la tabla
    const usadas = new Set(consultas.map(c => c.llave));
    let llave;
    do { llave = generarLlave(); } while (usadas.has(llave));

    const nueva = {
        id: Math.max(0, ...consultas.map(c => c.id)) + 1,
        pacienteId,
        medicoId: medico.id,                           // siempre el de la sesión, aunque el formulario enviara otro
        enfermedadId,
        edad: calcularEdad(paciente?.fechaNacimiento), // edad del paciente el día de la consulta
        peso,
        altura,
        fecha: fechaHoraLocal(),
        llave,
        notas: String(consulta.notas ?? '').trim()
    };

    consultas.push(nueva);
    registrarAuditoria('crear_consulta', { medicoId: medico.id, pacienteId, consultaId: nueva.id });

    return { success: true, id: nueva.id, llave };
}
