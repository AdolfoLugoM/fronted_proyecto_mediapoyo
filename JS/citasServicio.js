// Capa de acceso a datos de citas.
// El calendario SOLO usa estas funciones: HOY leen un JSON y MAÑANA llaman a la API.
// Para conectar la base de datos basta con poner USAR_API = true (y ajustar las URLs).
//
// Consultorios independientes: cada consultorio ve y maneja SOLO su propia agenda.
// Una cita pertenece a un consultorio y a un paciente que se atiende en él.
// "Eliminar" no borra el registro: lo marca como cancelado (así queda constancia de que existió).

import { obtenerMedicoActual } from './sesionServicio.js';
import { buscarPacientePorCurp, resumenPacientes } from './pacientesServicio.js';
import { registrarAuditoria, fechaHoraLocal } from './auditoriaServicio.js';

const USAR_API = false;
const URL_JSON = 'JSON/citas.json';      // ruta relativa a index.html
const URL_API = '/api/citas';             // endpoint futuro (backend + base de datos)

// Reglas de la agenda (las usa también el calendario para limitar la hora)
export const DURACION_CITA_MIN = 30;
export const HORA_APERTURA = '08:00';
export const HORA_CIERRE = '20:00';       // la última cita debe TERMINAR a esta hora (empieza a las 19:30)

let citas = null;                         // copia en memoria: los cambios viven aquí hasta recargar la página

async function cargarJSON() {
    if (citas) return citas;
    
    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    
    citas = (await respuesta.json()).citas;
    return citas;
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

// ----- Ayudantes de horario -----

const aMinutos = (hora) => {
    const [h, m] = hora.split(':').map(Number);
    return h * 60 + m;
};

const MINUTOS_APERTURA = aMinutos(HORA_APERTURA);
const MINUTOS_CIERRE = aMinutos(HORA_CIERRE);

function finDe(inicio) {
    return fechaHoraLocal(new Date(new Date(inicio).getTime() + DURACION_CITA_MIN * 60000));
}

const activa = (cita) => cita.estado !== 'cancelada';
const yaPaso = (inicio) => new Date(inicio) < new Date();

const error = (codigo, message) => ({ success: false, codigo, message });

const SIN_SESION = error('SIN_SESION', 'Inicia sesión como médico para manejar la agenda.');
const NO_ENCONTRADA = error('NO_ENCONTRADA', 'No se encontró esta cita en tu agenda. Puede que ya se haya eliminado.');

/** Revisa fecha y hora: formato, que no haya pasado y que quepa en el horario del consultorio. */
function validarHorario(fecha, hora) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || !/^\d{2}:\d{2}$/.test(hora ?? '')) {
        return error('HORARIO_INVALIDO', 'Escribe una fecha y una hora válidas.');
    }
    
    const minutos = aMinutos(hora);
    if (minutos < MINUTOS_APERTURA || minutos + DURACION_CITA_MIN > MINUTOS_CIERRE) {
        return error('FUERA_DE_HORARIO',
            `El horario de citas es de ${HORA_APERTURA} a ${HORA_CIERRE} (cada cita dura ${DURACION_CITA_MIN} minutos).`);
    }
    
    if (yaPaso(`${fecha}T${hora}:00`)) {
        return error('FECHA_PASADA', 'No se puede agendar en una fecha u hora que ya pasó.');
    }
    
    return null;
}

/** ¿Choca con otra cita activa del mismo consultorio? (excluirId: la cita que se está moviendo) */
function seEmpalma(lista, consultorioId, inicio, excluirId = null) {
    const nuevo = new Date(inicio).getTime();
    const duracion = DURACION_CITA_MIN * 60000;
    
    return lista.some(c =>
        activa(c) &&
        c.consultorioId === consultorioId &&
        c.id !== excluirId &&
        Math.abs(new Date(c.inicio).getTime() - nuevo) < duracion
    );
}

// Busca una cita activa de MI consultorio (de otro consultorio responde como si no existiera)
async function buscarCitaPropia(id) {
    const medico = await obtenerMedicoActual();
    if (!medico) return { problema: SIN_SESION };
    
    const lista = await cargarJSON();
    const cita = lista.find(c => c.id === Number(id));
    if (!cita || !activa(cita) || cita.consultorioId !== medico.consultorioId) return { problema: NO_ENCONTRADA };
    
    return { medico, lista, cita };
}

// ----- Funciones que usa el calendario -----

/**
* Citas del consultorio del médico en sesión dentro de un rango (el calendario pide solo lo visible).
* Devuelve siempre la misma forma, venga del JSON o de la API:
*   [ { id, inicio: "2026-10-26T09:00:00", fin: "2026-10-26T09:30:00",
*       paciente: { id, nombre, apellidos, curp } } ]
*/
export async function obtenerCitas({ desde, hasta } = {}) {
    if (USAR_API) {
        const parametros = new URLSearchParams({ desde, hasta });
        const respuesta = await fetch(`${URL_API}?${parametros}`);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }
    
    await esperar(150);                    // simula la demora de una red real
    
    const medico = await obtenerMedicoActual();
    if (!medico) return [];
    
    const desdeLocal = desde?.slice(0, 19);    // "2026-10-01T00:00:00" (se ignora la zona horaria)
    const hastaLocal = hasta?.slice(0, 19);
    
    const visibles = (await cargarJSON()).filter(c =>
        activa(c) &&
        c.consultorioId === medico.consultorioId &&
        (!desdeLocal || c.inicio >= desdeLocal) &&
        (!hastaLocal || c.inicio < hastaLocal)
    );
    
    const pacientes = await resumenPacientes(visibles.map(c => c.pacienteId));
    
    return visibles.map(c => ({
        id: c.id,
        inicio: c.inicio,
        fin: finDe(c.inicio),
        paciente: pacientes.get(c.pacienteId) ?? null
    }));
}

/**
* Agenda una cita para un paciente de MI consultorio (se identifica por su CURP).
* Responde { success: true } o { success: false, codigo, message }.
* Con la API real, estas mismas validaciones deben repetirse en el servidor.
*/
export async function crearCita({ fecha, hora, curp }) {
    if (USAR_API) {
        const respuesta = await fetch(URL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, hora, curp })
        });
        return respuesta.json();
    }
    
    await esperar(300);
    
    const medico = await obtenerMedicoActual();
    if (!medico) return SIN_SESION;
    
    const problema = validarHorario(fecha, hora);
    if (problema) return problema;
    
    const paciente = await buscarPacientePorCurp(curp, medico.consultorioId);
    if (!paciente) {
        return error('PACIENTE_NO_ENCONTRADO',
            'No hay un paciente con esa CURP en tu consultorio. Regístralo primero con "Nuevo Paciente".');
    }
    
    const lista = await cargarJSON();
    const inicio = `${fecha}T${hora}:00`;
    
    if (seEmpalma(lista, medico.consultorioId, inicio)) {
        return error('HORARIO_OCUPADO', 'Ya hay una cita en ese horario. Elige otra hora.');
    }
    
    const nueva = {
        id: Math.max(0, ...lista.map(c => c.id)) + 1,
        inicio,
        consultorioId: medico.consultorioId,
        pacienteId: paciente.id,
        medicoId: medico.id,
        estado: 'agendada'
    };
    lista.push(nueva);
    registrarAuditoria('agendar_cita', { medicoId: medico.id, citaId: nueva.id, pacienteId: paciente.id });
    return { success: true };
}

/**
* Cambia la fecha y/o la hora de una cita de MI consultorio que todavía no ha pasado.
* Responde { success: true } o { success: false, codigo, message }.
*/
export async function actualizarCita(id, { fecha, hora }) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, hora })
        });
        return respuesta.json();
    }
    
    await esperar(300);
    
    const { problema: sinCita, medico, lista, cita } = await buscarCitaPropia(id);
    if (sinCita) return sinCita;
    
    if (yaPaso(cita.inicio)) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede cambiar.');
    
    const problema = validarHorario(fecha, hora);
    if (problema) return problema;
    
    const inicio = `${fecha}T${hora}:00`;
    if (inicio === cita.inicio) return { success: true };     // no cambió nada
    
    if (seEmpalma(lista, cita.consultorioId, inicio, cita.id)) {
        return error('HORARIO_OCUPADO', 'Ya hay una cita en ese horario. Elige otra hora.');
    }
    
    const anterior = cita.inicio;
    cita.inicio = inicio;
    registrarAuditoria('reprogramar_cita', { medicoId: medico.id, citaId: cita.id, de: anterior, a: inicio });
    return { success: true };
}

/**
* "Elimina" una cita de MI consultorio que todavía no ha pasado: la marca como cancelada
* y deja de aparecer en el calendario. Responde { success: true } o { success: false, codigo, message }.
*/
export async function eliminarCita(id) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return respuesta.json();
    }
    
    await esperar(300);
    
    const { problema, medico, cita } = await buscarCitaPropia(id);
    if (problema) return problema;
    
    if (yaPaso(cita.inicio)) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede eliminar.');
    
    cita.estado = 'cancelada';
    registrarAuditoria('cancelar_cita', { medicoId: medico.id, citaId: cita.id });
    return { success: true };
}
