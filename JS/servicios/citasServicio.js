// Capa de acceso a datos de citas.
// El calendario SOLO usa estas funciones: HOY leen un JSON y MAÑANA llaman a la API.
// Para conectar la base de datos basta con poner USAR_API = true (y ajustar las URLs).
//
// Cada médico ve y maneja SOLO su propia agenda.
// Una cita pertenece a un médico y a un paciente (cualquier paciente del directorio).
// "Eliminar" quita la cita de la tabla Citas (la tabla no tiene columna de estado).
//
// Con el backend, las reglas de la agenda que el servidor NO aplica (horario de 08:00 a 20:00, citas de
// 30 minutos que no se empalmen) se siguen validando aquí. El servidor sí exige: que el paciente exista,
// que la fecha no sea anterior a hoy y que el médico no tenga otra cita a la misma hora exacta.

import { obtenerMedicoActual } from './sesionServicio.js';
import { buscarPacientePorCurp, resumenPacientes } from './pacientesServicio.js';
import { registrarAuditoria, fechaHoraLocal } from './auditoriaServicio.js';
import { USAR_API } from '../config.js';
import { pedir, falla, traerTodas } from './api.js';

const URL_JSON = 'JSON/citas.json';      // ruta relativa a index.html

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

// La tabla Citas guarda FechaCita y HoraCita por separado; aquí se juntan para comparar y calcular.
const inicioDe = (cita) => `${cita.fechaCita}T${cita.horaCita}`;

const yaPaso = (inicio) => new Date(inicio) < new Date();

const error = (codigo, message) => ({ success: false, codigo, message });

const SIN_SESION = error('SIN_SESION', 'Inicia sesión como médico para manejar la agenda.');
const NO_ENCONTRADA = error('NO_ENCONTRADA', 'No se encontró esta cita en tu agenda. Puede que ya se haya eliminado.');

/** Revisa fecha y hora: formato, que no haya pasado y que quepa en el horario de la agenda. */
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

/** ¿Choca con otra cita activa del mismo médico? (excluirId: la cita que se está moviendo) */
function seEmpalma(lista, medicoId, inicio, excluirId = null) {
    const nuevo = new Date(inicio).getTime();
    const duracion = DURACION_CITA_MIN * 60000;

    return lista.some(c =>
        c.medicoId === medicoId &&
        c.id !== excluirId &&
        Math.abs(new Date(inicioDe(c)).getTime() - nuevo) < duracion
    );
}

// Busca una cita activa de MI agenda (de otro médico responde como si no existiera)
async function buscarCitaPropia(id) {
    const medico = await obtenerMedicoActual();
    if (!medico) return { problema: SIN_SESION };
    
    const lista = await cargarJSON();
    const cita = lista.find(c => c.id === Number(id));
    if (!cita || cita.medicoId !== medico.id) return { problema: NO_ENCONTRADA };
    
    return { medico, lista, cita };
}

// ----- Ayudantes para la API -----

// La API maneja fecha y hora por separado; la aplicación, "2026-10-26T09:00:00"
const inicioDeApi = (c) => `${c.fecha_cita}T${c.hora_cita.slice(0, 5)}:00`;

// El calendario pide "hasta" EXCLUSIVO (medianoche del día siguiente) y la API lo toma INCLUIDO
function ultimoDiaIncluido(hastaExclusivo) {
    const dia = new Date(`${hastaExclusivo.slice(0, 10)}T00:00:00`);
    dia.setDate(dia.getDate() - 1);
    return fechaHoraLocal(dia).slice(0, 10);
}

// ¿Hay otra cita mía dentro de los 30 minutos de ese horario? (el servidor solo rechaza la misma hora exacta)
async function hayEmpalmeApi(fecha, hora, excluirId = null) {
    const delDia = await traerTodas('/citas', { desde: fecha, hasta: fecha });
    const nuevo = new Date(`${fecha}T${hora}:00`).getTime();

    return delDia.some(c =>
        c.id !== excluirId &&
        Math.abs(new Date(inicioDeApi(c)).getTime() - nuevo) < DURACION_CITA_MIN * 60000
    );
}

const HORARIO_OCUPADO = () => error('HORARIO_OCUPADO', 'Ya hay una cita en ese horario. Elige otra hora.');

// ----- Funciones que usa el calendario -----

/**
* Citas del médico en sesión dentro de un rango (el calendario pide solo lo visible).
* Devuelve siempre la misma forma, venga del JSON o de la API:
*   [ { id, inicio: "2026-10-26T09:00:00", fin: "2026-10-26T09:30:00",
*       paciente: { id, nombre, apellidos, curp } } ]
*/
export async function obtenerCitas({ desde, hasta } = {}) {
    if (USAR_API) {
        const lista = await traerTodas('/citas', {
            desde: desde?.slice(0, 10),
            hasta: hasta ? ultimoDiaIncluido(hasta) : undefined
        });

        // La cita trae nombre y apellidos del paciente; la CURP se pide aparte (y se guarda en memoria)
        const pacientes = await resumenPacientes(lista.map(c => c.paciente.id));

        return lista.map(c => ({
            id: c.id,
            inicio: inicioDeApi(c),
            fin: finDe(inicioDeApi(c)),
            paciente: pacientes.get(c.paciente.id) ?? { ...c.paciente, curp: '' }
        }));
    }

    await esperar(150);                    // simula la demora de una red real
    
    const medico = await obtenerMedicoActual();
    if (!medico) return [];
    
    const desdeLocal = desde?.slice(0, 19);    // "2026-10-01T00:00:00" (se ignora la zona horaria)
    const hastaLocal = hasta?.slice(0, 19);
    
    const visibles = (await cargarJSON()).filter(c =>
        c.medicoId === medico.id &&
        (!desdeLocal || inicioDe(c) >= desdeLocal) &&
        (!hastaLocal || inicioDe(c) < hastaLocal)
    );
    
    const pacientes = await resumenPacientes(visibles.map(c => c.pacienteId));
    
    return visibles.map(c => ({
        id: c.id,
        inicio: inicioDe(c),
        fin: finDe(inicioDe(c)),
        paciente: pacientes.get(c.pacienteId) ?? null
    }));
}

/**
* Agenda una cita para un paciente MÍO (se identifica por su CURP).
* Responde { success: true } o { success: false, codigo, message }.
* Con la API real, estas mismas validaciones deben repetirse en el servidor.
*/
export async function crearCita({ fecha, hora, curp }) {
    if (USAR_API) {
        const problema = validarHorario(fecha, hora);
        if (problema) return problema;

        const paciente = await buscarPacientePorCurp(curp);
        if (!paciente) {
            return error('PACIENTE_NO_ENCONTRADO',
                'No hay un paciente con esa CURP. Regístralo primero con "Nuevo Paciente".');
        }

        if (await hayEmpalmeApi(fecha, hora)) return HORARIO_OCUPADO();

        const resp = await pedir('/citas', {
            metodo: 'POST',
            cuerpo: { paciente_id: paciente.id, fecha_cita: fecha, hora_cita: hora }
        });

        if (resp.ok) return { success: true };
        if (resp.estado === 409) return HORARIO_OCUPADO();
        return falla(resp, 'No se pudo agendar la cita.');
    }

    await esperar(300);
    
    const medico = await obtenerMedicoActual();
    if (!medico) return SIN_SESION;
    
    const problema = validarHorario(fecha, hora);
    if (problema) return problema;
    
    const paciente = await buscarPacientePorCurp(curp, medico.id);
    if (!paciente) {
        return error('PACIENTE_NO_ENCONTRADO',
            'No hay un paciente con esa CURP entre tus pacientes. Regístralo primero con "Nuevo Paciente".');
    }

    const lista = await cargarJSON();
    const inicio = `${fecha}T${hora}:00`;

    if (seEmpalma(lista, medico.id, inicio)) {
        return error('HORARIO_OCUPADO', 'Ya hay una cita en ese horario. Elige otra hora.');
    }
    
    const nueva = {
        id: Math.max(0, ...lista.map(c => c.id)) + 1,
        fechaCita: fecha,
        horaCita: `${hora}:00`,
        pacienteId: paciente.id,
        medicoId: medico.id
    };
    lista.push(nueva);
    registrarAuditoria('agendar_cita', { medicoId: medico.id, citaId: nueva.id, pacienteId: paciente.id });
    return { success: true };
}

/**
* Cambia la fecha y/o la hora de una cita MÍA que todavía no ha pasado.
* Responde { success: true } o { success: false, codigo, message }.
*/
export async function actualizarCita(id, { fecha, hora }) {
    if (USAR_API) {
        const actual = await pedir(`/citas/${encodeURIComponent(id)}`);
        if (actual.estado === 404) return NO_ENCONTRADA;
        if (!actual.ok) return falla(actual, 'No se pudo cargar la cita.');

        if (yaPaso(inicioDeApi(actual.datos))) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede cambiar.');

        const problema = validarHorario(fecha, hora);
        if (problema) return problema;

        if (`${fecha}T${hora}:00` === inicioDeApi(actual.datos)) return { success: true };     // no cambió nada
        if (await hayEmpalmeApi(fecha, hora, Number(id))) return HORARIO_OCUPADO();

        const resp = await pedir(`/citas/${encodeURIComponent(id)}`, {
            metodo: 'PATCH',
            cuerpo: { fecha_cita: fecha, hora_cita: hora }
        });

        if (resp.ok) return { success: true };
        if (resp.estado === 404) return NO_ENCONTRADA;
        if (resp.estado === 409) return HORARIO_OCUPADO();
        return falla(resp, 'No se pudo actualizar la cita.');
    }

    await esperar(300);
    
    const { problema: sinCita, medico, lista, cita } = await buscarCitaPropia(id);
    if (sinCita) return sinCita;
    
    if (yaPaso(inicioDe(cita))) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede cambiar.');
    
    const problema = validarHorario(fecha, hora);
    if (problema) return problema;
    
    const inicio = `${fecha}T${hora}:00`;
    if (inicio === inicioDe(cita)) return { success: true };     // no cambió nada
    
    if (seEmpalma(lista, cita.medicoId, inicio, cita.id)) {
        return error('HORARIO_OCUPADO', 'Ya hay una cita en ese horario. Elige otra hora.');
    }
    
    const anterior = inicioDe(cita);
    cita.fechaCita = fecha;
    cita.horaCita = `${hora}:00`;
    registrarAuditoria('reprogramar_cita', { medicoId: medico.id, citaId: cita.id, de: anterior, a: inicio });
    return { success: true };
}

/**
* Elimina una cita MÍA que todavía no ha pasado: la quita de la lista
* y deja de aparecer en el calendario. Responde { success: true } o { success: false, codigo, message }.
*/
export async function eliminarCita(id) {
    if (USAR_API) {
        const actual = await pedir(`/citas/${encodeURIComponent(id)}`);
        if (actual.estado === 404) return NO_ENCONTRADA;
        if (!actual.ok) return falla(actual, 'No se pudo cargar la cita.');

        if (yaPaso(inicioDeApi(actual.datos))) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede eliminar.');

        const resp = await pedir(`/citas/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
        if (resp.ok) return { success: true };
        if (resp.estado === 404) return NO_ENCONTRADA;
        return falla(resp, 'No se pudo eliminar la cita.');
    }

    await esperar(300);
    
    const { problema, medico, lista, cita } = await buscarCitaPropia(id);
    if (problema) return problema;
    
    if (yaPaso(inicioDe(cita))) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede eliminar.');
    
    lista.splice(lista.indexOf(cita), 1);
    registrarAuditoria('cancelar_cita', { medicoId: medico.id, citaId: cita.id });
    return { success: true };
}
