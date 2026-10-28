// Capa de acceso a datos de consultas.
// HOY lee y guarda sobre JSON/historial.json (en memoria); MAÑANA llama a la API (USAR_API = true).
//
// Quién ve el detalle de una consulta (síntomas y observaciones):
//   1. Los médicos del MISMO consultorio donde se atendió: siempre, sin pedir nada.
//   2. Un médico de otro consultorio: solo con permiso del paciente, que le dicta un código
//      de 6 dígitos que le llega a su teléfono. El acceso dura 8 horas.
//   3. Emergencia (el paciente no puede responder): sin código, con motivo obligatorio, 1 hora.
// Todo queda en la auditoría. Las alergias y enfermedades crónicas NO pasan por aquí:
// están en la ficha del paciente y siempre se ven, por seguridad.

import { obtenerSintomas } from './sintomasServicio.js';
import { obtenerMedicos } from './medicosServicio.js';
import { obtenerConsultorios } from './consultoriosServicio.js';
import { obtenerMedicoActual } from './sesionServicio.js';
import { obtenerPaciente, atiendeEnConsultorio } from './pacientesServicio.js';
import { registrarAuditoria, fechaHoraLocal } from './auditoriaServicio.js';

const USAR_API = false;
const URL_JSON = 'JSON/historial.json';      // ruta relativa a index.html
const URL_API = '/api';                       // base de la API futura

const DURACION_CODIGO_MS = 10 * 60_000;       // el código vence a los 10 minutos
const ESPERA_REENVIO_MS = 30_000;             // tiempo mínimo entre dos códigos
const MAX_INTENTOS = 5;                       // fallos permitidos antes de anular el código
const DURACION_ACCESO_MS = 8 * 60 * 60_000;   // acceso concedido por el paciente: una jornada
const DURACION_EMERGENCIA_MS = 60 * 60_000;   // acceso de emergencia: 1 hora
const MIN_MOTIVO = 10;                        // caracteres mínimos del motivo de emergencia

/** Nombre del evento con el que la simulación "envía" el SMS (lo escucha bandejaSimulada.js). */
export const EVENTO_MENSAJE_SIMULADO = 'mediapoyo:mensaje-simulado';

// Lista única en memoria: la lee el historial y a ella se suman las consultas nuevas
// (viven aquí hasta recargar la página).
let cacheConsultas = null;
const codigos = new Map();                    // "medico-paciente" -> { sal, hash, creado, expira, intentos }
const accesos = new Map();                    // "medico-paciente" -> { tipo, motivo, expira }

async function cargarJSON() {
    if (cacheConsultas) return cacheConsultas;

    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    cacheConsultas = (await respuesta.json()).consultas;
    return cacheConsultas;
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));
const clave = (medicoId, pacienteId) => `${medicoId}-${pacienteId}`;
const segundos = (ms) => Math.ceil(ms / 1000);

// Respuestas de error con la misma forma que dará la API
const sinSesion = () => ({ success: false, codigo: 'SIN_SESION', message: 'Inicia sesión como médico para continuar.' });
const sinPermiso = () => ({ success: false, codigo: 'SIN_PERMISO', message: 'Este paciente no está registrado en tu consultorio.' });

// ----- Códigos de 6 dígitos -----

const aHex = (bytes) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const generarSal = () => aHex(crypto.getRandomValues(new Uint8Array(8)));

// Huella SHA-256 de (sal + código). Con servidor real se usaría bcrypt o argon2.
// crypto.subtle solo existe en contextos seguros: https o localhost / 127.0.0.1 (Live Server cumple).
async function calcularHash(sal, codigo) {
    const bytes = new TextEncoder().encode(sal + codigo);
    return aHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

// 6 dígitos al azar, sin sesgo: se descartan los valores que no caben parejos en 1 000 000
function generarCodigo() {
    const limite = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
    const azar = new Uint32Array(1);
    do { crypto.getRandomValues(azar); } while (azar[0] >= limite);
    return String(azar[0] % 1_000_000).padStart(6, '0');
}

// SOLO SIMULACIÓN: en lugar de mandar un SMS, avisa a bandejaSimulada.js.
// Con servidor real, el código se envía por SMS o correo y NUNCA llega al navegador del médico.
function enviarMensajeSimulado(destino, texto) {
    window.dispatchEvent(new CustomEvent(EVENTO_MENSAJE_SIMULADO, { detail: { destino, texto } }));
}

// SOLO SIMULACIÓN: el código ya no sirve (se usó, venció o se anuló), así que se quita de la pantalla
function retirarMensajeSimulado() {
    window.dispatchEvent(new CustomEvent(EVENTO_MENSAJE_SIMULADO, { detail: null }));
}

/** Acceso vigente de un médico al historial de un paciente, o null. Los vencidos se borran. */
function accesoVigente(medicoId, pacienteId) {
    const k = clave(medicoId, pacienteId);
    const acceso = accesos.get(k);
    if (!acceso) return null;

    if (acceso.expira <= Date.now()) {
        accesos.delete(k);
        return null;
    }
    return acceso;
}

// ----- Funciones que usa la aplicación -----

/**
* Historial de un paciente (la consulta más reciente primero).
* Responde { success: true, acceso, consultas } o { success: false, codigo, message }.
*   acceso:   null, o { tipo: "codigo" | "emergencia", expira }
*   consultas: [ { id, fecha, propia, medico, consultorio, detalle } ]
*     - propia: se atendió en el consultorio del médico en sesión
*     - detalle: { sintomas: [{ id, nombre }], observaciones }, o null si no tiene permiso.
*       Si no tiene permiso, medico y consultorio también son null: sin permiso del paciente
*       no se revela con quién ni dónde se atendió.
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

    const [consultas, medicos, consultorios, catalogo] = await Promise.all([
        cargarJSON(),
        obtenerMedicos(),
        obtenerConsultorios(),
        obtenerSintomas().catch(() => [])       // si el catálogo no carga, se muestra "Síntoma N"
    ]);

    const nombreMedico = new Map(medicos.map(m => [m.id, `${m.nombre} ${m.apellidos}`]));
    const nombreConsultorio = new Map(consultorios.map(c => [c.id, c.nombre]));
    const nombreSintoma = new Map(catalogo.map(s => [s.id, s.nombre]));

    const acceso = accesoVigente(medico.id, id);
    registrarAuditoria('abrir_historial', { medicoId: medico.id, pacienteId: id, acceso: acceso?.tipo ?? 'consultorio' });

    return {
        success: true,
        acceso: acceso ? { tipo: acceso.tipo, expira: fechaHoraLocal(new Date(acceso.expira)) } : null,
        consultas: consultas
            .filter(c => c.pacienteId === id)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map(c => {
                const propia = c.consultorioId === medico.consultorioId;
                const visible = propia || acceso !== null;
                
                return {
                    id: c.id,
                    fecha: c.fecha,
                    propia,
                    medico: visible ? { id: c.medicoId, nombre: nombreMedico.get(c.medicoId) ?? 'Médico no identificado' } : null,
                    consultorio: visible ? { id: c.consultorioId, nombre: nombreConsultorio.get(c.consultorioId) ?? 'Consultorio no identificado' } : null,
                    detalle: visible
                        ? {
                            observaciones: c.observaciones ?? '',
                            sintomas: (c.sintomas ?? []).map(s => ({ id: s, nombre: nombreSintoma.get(s) ?? `Síntoma ${s}` }))
                        }
                        : null
                };
            })
    };
}

/**
* Envía un código de 6 dígitos al teléfono del paciente para que autorice al médico en sesión.
* Responde { success: true, destino: "••• ••• 0001", expira } o { success: false, codigo, message }.
* Pedir otro código anula el anterior.
*/
export async function solicitarCodigo(pacienteId) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/pacientes/${encodeURIComponent(pacienteId)}/codigo`, { method: 'POST' });
        return respuesta.json();
    }

    await esperar(400);

    const id = Number(pacienteId);
    const medico = await obtenerMedicoActual();
    if (!medico) return sinSesion();
    if (!await atiendeEnConsultorio(id, medico.consultorioId)) return sinPermiso();

    const k = clave(medico.id, id);
    const anterior = codigos.get(k);
    const desdeAnterior = anterior ? Date.now() - anterior.creado : Infinity;
    if (desdeAnterior < ESPERA_REENVIO_MS) {
        return {
            success: false,
            codigo: 'ESPERA',
            message: `Espera ${segundos(ESPERA_REENVIO_MS - desdeAnterior)} segundos para pedir otro código.`
        };
    }

    const paciente = await obtenerPaciente(id);
    const digitos = (paciente?.telefono ?? '').replace(/\D/g, '');
    if (digitos.length < 7) {
        return {
            success: false,
            codigo: 'SIN_TELEFONO',
            message: 'El paciente no tiene un teléfono válido. Actualízalo en recepción o usa el acceso de emergencia.'
        };
    }

    const codigo = generarCodigo();
    const sal = generarSal();
    const ahora = Date.now();

    codigos.set(k, {                                   // reemplaza al anterior: el viejo deja de servir
        sal,
        hash: await calcularHash(sal, codigo),         // se guarda la huella, nunca el código
        creado: ahora,
        expira: ahora + DURACION_CODIGO_MS,
        intentos: 0
    });

    const destino = `••• ••• ${digitos.slice(-4)}`;
    enviarMensajeSimulado(destino,
        `MediApoyo: tu código es ${codigo}. Dáselo solo al médico que te está atendiendo. Vence en 10 minutos.`);

    registrarAuditoria('solicitar_codigo', { medicoId: medico.id, pacienteId: id });

    return { success: true, destino, expira: fechaHoraLocal(new Date(ahora + DURACION_CODIGO_MS)) };
}

/**
* Comprueba el código que dictó el paciente. Si es correcto, concede 8 horas de acceso.
* Responde { success: true, expira } o { success: false, codigo, message } con codigo:
* SIN_CODIGO, CODIGO_VENCIDO, CODIGO_INCORRECTO o BLOQUEADO (se anuló por demasiados intentos).
*/
export async function verificarCodigo(pacienteId, codigoEscrito) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/pacientes/${encodeURIComponent(pacienteId)}/acceso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo: codigoEscrito })     // en el cuerpo, nunca en la URL
        });
        return respuesta.json();
    }

    await esperar(300);

    const id = Number(pacienteId);
    const medico = await obtenerMedicoActual();
    if (!medico) return sinSesion();

    const k = clave(medico.id, id);
    const registro = codigos.get(k);

    if (!registro) {
        return { success: false, codigo: 'SIN_CODIGO', message: 'No hay un código vigente. Solicita uno nuevo.' };
    }
    if (registro.expira <= Date.now()) {
        codigos.delete(k);
        retirarMensajeSimulado();
        return { success: false, codigo: 'CODIGO_VENCIDO', message: 'El código venció. Solicita uno nuevo.' };
    }

    const limpio = String(codigoEscrito).replace(/\D/g, '');
    if (await calcularHash(registro.sal, limpio) !== registro.hash) {
        registro.intentos += 1;

        if (registro.intentos >= MAX_INTENTOS) {
            codigos.delete(k);
            retirarMensajeSimulado();
            return { success: false, codigo: 'BLOQUEADO', message: 'Demasiados intentos. El código se anuló; solicita uno nuevo.' };
        }
        return {
            success: false,
            codigo: 'CODIGO_INCORRECTO',
            message: `Código incorrecto. Intentos restantes: ${MAX_INTENTOS - registro.intentos}.`
        };
    }

    codigos.delete(k);                                 // un solo uso
    retirarMensajeSimulado();
    const expira = Date.now() + DURACION_ACCESO_MS;
    accesos.set(k, { tipo: 'codigo', motivo: null, expira });
    registrarAuditoria('acceso_codigo', { medicoId: medico.id, pacienteId: id });

    return { success: true, expira: fechaHoraLocal(new Date(expira)) };
}

/**
* Acceso de emergencia: sin código, con motivo obligatorio, por 1 hora.
* Responde { success: true, expira } o { success: false, codigo, message }.
*/
export async function accesoEmergencia(pacienteId, motivo) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/pacientes/${encodeURIComponent(pacienteId)}/acceso-emergencia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo })
        });
        return respuesta.json();
    }

    await esperar(300);

    const id = Number(pacienteId);
    const medico = await obtenerMedicoActual();
    if (!medico) return sinSesion();
    if (!await atiendeEnConsultorio(id, medico.consultorioId)) return sinPermiso();

    const texto = (motivo ?? '').trim();
    if (texto.length < MIN_MOTIVO) {
        return { success: false, codigo: 'MOTIVO_REQUERIDO', message: `Describe el motivo (al menos ${MIN_MOTIVO} caracteres).` };
    }

    // Si ya tiene un acceso que dura más (por ejemplo, el del código), no se acorta
    const vigente = accesoVigente(medico.id, id);
    if (vigente) return { success: true, expira: fechaHoraLocal(new Date(vigente.expira)) };

    const expira = Date.now() + DURACION_EMERGENCIA_MS;
    accesos.set(clave(medico.id, id), { tipo: 'emergencia', motivo: texto, expira });
    registrarAuditoria('acceso_emergencia', { medicoId: medico.id, pacienteId: id, motivo: texto });

    return { success: true, expira: fechaHoraLocal(new Date(expira)) };
}

/** Guarda una consulta nueva a nombre del médico en sesión y de su consultorio. Responde { success, id }. */
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
    if (!await atiendeEnConsultorio(consulta.pacienteId, medico.consultorioId)) return sinPermiso();

    const consultas = await cargarJSON();

    const nueva = {
        id: Math.max(0, ...consultas.map(c => c.id)) + 1,
        fecha: fechaHoraLocal(),
        ...consulta,
        pacienteId: Number(consulta.pacienteId),
        medicoId: medico.id,                           // siempre el de la sesión, aunque el formulario enviara otro
        consultorioId: medico.consultorioId,
        sintomas: consulta.sintomas ?? []
    };

    consultas.push(nueva);
    registrarAuditoria('crear_consulta', { medicoId: medico.id, pacienteId: nueva.pacienteId, consultaId: nueva.id });

    return { success: true, id: nueva.id };
}
