// funciones de otros archivos para usarlas aquí.
import { buscarPacientePorCurp, resumenPacientes } from './pacientesServicio.js';
import { fechaHoraLocal } from '../utilidades.js';
import { pedir, falla, traerTodas } from './api.js';

// reglas de agenda
export const DURACION_CITA_MIN = 60;
export const INTERVALO_CITA_MIN = 30;
export const HORA_APERTURA = '08:00';
export const HORA_CIERRE = '20:00';

// ----- Ayudantes de horario -----
// Piezas pequeñas para trabajar con horas y revisar que una cita sea válida

// Convierte una hora en texto ("09:30") al total de minutos desde la medianoche (570)
const aMinutos = (hora) => {
    const [h, m] = hora.split(':').map(Number); // separa "09:30" en horas (9) y minutos (30)
    return h * 60 + m; // cada hora tiene 60 minutos
};

// Apertura y cierre convertidos a minutos (480 y 1200), para poder compararlos con la hora elegida
const MINUTOS_APERTURA = aMinutos(HORA_APERTURA);
const MINUTOS_CIERRE = aMinutos(HORA_CIERRE);

// Calcula a qué hora termina una cita: su inicio más la duración 
function finDe(inicio) {
    return fechaHoraLocal(new Date(new Date(inicio).getTime() + DURACION_CITA_MIN * 60000)); // convierte el inicio a milisegundos, le suma la duración (minutos × 60000) 
    // y lo vuelve a texto
}
// Devuelve true si la fecha y hora ya pasaron (la compara con el momento actual)
const yaPaso = (inicio) => new Date(inicio) < new Date();

// Arma un objeto de error con la misma forma que usa el resto de la página
const error = (codigo, message) => ({ success: false, codigo, message });

// Error ya armado para cuando la cita no existe (se reutiliza en varias funciones, 404) 
const NO_ENCONTRADA = error('NO_ENCONTRADA', 'No se encontró esta cita en tu agenda. Puede que ya se haya eliminado.');

// Revisa fecha y hora antes de preguntar al servidor; devuelve un error, o null si todo está bien
function validarHorario(fecha, hora) {
    
    // 1) formato: fecha AAAA-MM-DD y hora HH:MM
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || !/^\d{2}:\d{2}$/.test(hora ?? '')) {
        return error('HORARIO_INVALIDO', 'Escribe una fecha y una hora válidas.');
    }
    
    // 2) horario: que empiece después de abrir y termine antes de cerrar
    const minutos = aMinutos(hora);
    if (minutos <MINUTOS_APERTURA || minutos + DURACION_CITA_MIN > MINUTOS_CIERRE) {
        return error('FUERA_DE_HORARIO',
            `El horario de citas es de ${HORA_APERTURA} a ${HORA_CIERRE} (cada cita dura ${DURACION_CITA_MIN} minutos).`);
    }
    
    // 3) que no sea una fecha u hora que ya pasó
    if (yaPaso(`${fecha}T${hora}:00`)) {
        return error('FECHA_PASADA', 'No se puede agendar en una fecha u hora que ya pasó.');
    }
    
    return null; // todo correcto, sin errores
}

// ----- Ayudantes para la API -----
// Piezas que traducen fechas entre la página y el servidor, y detectan citas que chocan

// Une fecha y hora que manda el servidor en un solo texto: "2026-11-25T09:30:00"
const inicioDeApi = (c) => `${c.fecha_cita}T${c.hora_cita.slice(0, 5)}:00`;

// Resta un día a la fecha final: el calendario la pide excluida y el servidor la toma incluida
function ultimoDiaIncluido(hastaExclusivo) {
    const dia = new Date(`${hastaExclusivo.slice(0, 10)}T00:00:00`);
    dia.setDate(dia.getDate() - 1);
    return fechaHoraLocal(dia).slice(0, 10);
}

// Revisa si otra cita del día choca (empieza con menos de una hora de diferencia); excluirId es la cita que se mueve
async function hayEmpalmeApi(fecha, hora, excluirId = null) {
    const delDia = await traerTodas('/citas', { desde: fecha, hasta: fecha });
    const nuevo = new Date(`${fecha}T${hora}:00`).getTime();
    
    return delDia.some(c =>
        c.id !== excluirId &&
        Math.abs(new Date(inicioDeApi(c)).getTime() - nuevo) < DURACION_CITA_MIN * 60000
    );
}

// Error ya armado para cuando el horario está ocupado
const HORARIO_OCUPADO = () => error('HORARIO_OCUPADO', 'Ya hay una cita en ese horario. Elige otra hora.');

// Dirección de una cita en el servidor: "/citas/12" (encodeURIComponent protege el id de caracteres raros)
const rutaCita = (id) => `/citas/${encodeURIComponent(id)}`;

// ----- Funciones que usa el calendario -----
// Son las únicas que usan las pantallas: ver, agendar, cambiar y eliminar citas

// Trae las citas del médico en el rango visible del calendario, con la forma que el calendario necesita
export async function obtenerCitas({ desde, hasta } = {}) {
    // pide las citas del rango (el 'hasta' se ajusta porque el servidor lo toma incluido)
    const lista = await traerTodas('/citas', {
        desde: desde?.slice(0, 10),
        hasta: hasta ? ultimoDiaIncluido(hasta) : undefined
    });
    
    // trae los datos de los pacientes de esas citas en una sola llamada
    const pacientes = await resumenPacientes(lista.map(c => c.paciente.id));
    
    // convierte cada cita: junta fecha y hora (inicio), calcula el fin y agrega los datos del paciente
    return lista.map(c => ({
        id: c.id,
        inicio: inicioDeApi(c),
        fin: finDe(inicioDeApi(c)),
        paciente: pacientes.get(c.paciente.id) ?? { ...c.paciente, curp: '' }
    }));
}

// Agenda una cita nueva: revisa todo en la página y, si pasa, la manda al servidor
export async function crearCita({ fecha, hora, curp }) {
    // 1) que la fecha y la hora sean válidas
    const problema = validarHorario(fecha, hora);
    if (problema) return problema;
    
    // 2) que exista un paciente con esa CURP (la cita necesita su id)
    const paciente = await buscarPacientePorCurp(curp);
    if (!paciente) {
        return error('PACIENTE_NO_ENCONTRADO',
            'No hay un paciente con esa CURP. Regístralo primero con "Nuevo Paciente".');
    }
    
    // 3) que no choque con otra cita del día
    if (await hayEmpalmeApi(fecha, hora)) return HORARIO_OCUPADO();
    
    // 4) manda la cita al servidor; datosUser lleva los datos con los nombres que usa el servidor
    const resp = await pedir('/citas', {
        metodo: 'POST',
        datosUser: { paciente_id: paciente.id, fecha_cita: fecha, hora_cita: hora }
    });
    
    // 5) respuesta: éxito, horario tomado por otra cita (409) o error general
    if (resp.ok) return { success: true };
    if (resp.estado === 409) return HORARIO_OCUPADO();
    return falla(resp, 'No se pudo agendar la cita.');
}

// Cambia la fecha u hora de una cita existente
export async function actualizarCita(id, { fecha, hora }) {
    // pide al servidor la cita actual para saber si existe
    const actual = await pedir(rutaCita(id));
    if (actual.estado === 404) return NO_ENCONTRADA;
    if (!actual.ok) return falla(actual, 'No se pudo cargar la cita.');
    
    // una cita que ya pasó no se puede mover
    if (yaPaso(inicioDeApi(actual.datos))) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede cambiar.');
    
    // revisa que la nueva fecha y hora sean válidas
    const problema = validarHorario(fecha, hora);
    if (problema) return problema;
    
    // si no cambió nada, devuelve éxito sin molestar al servidor
    if (`${fecha}T${hora}:00` === inicioDeApi(actual.datos)) return { success: true };

    // revisa choques con otras citas, excluyendo a esta misma (Number(id))
    if (await hayEmpalmeApi(fecha, hora, Number(id))) return HORARIO_OCUPADO();
    
    const resp = await pedir(rutaCita(id), {
        metodo: 'PATCH', // PATCH: solo se envían los campos que cambian
        datosUser: { fecha_cita: fecha, hora_cita: hora }
    });
    
    // respuesta: éxito, cita no encontrada (404), horario tomado (409) o error general
    if (resp.ok) return { success: true };
    if (resp.estado === 404) return NO_ENCONTRADA;
    if (resp.estado === 409) return HORARIO_OCUPADO();
    return falla(resp, 'No se pudo actualizar la cita.');
}

// Elimina una cita que todavía no ha pasado
export async function eliminarCita(id) {
    // pide la cita al servidor para saber si existe
    const actual = await pedir(rutaCita(id));
    if (actual.estado === 404) return NO_ENCONTRADA;
    if (!actual.ok) return falla(actual, 'No se pudo cargar la cita.');
    
    // una cita que ya pasó no se puede eliminar
    if (yaPaso(inicioDeApi(actual.datos))) return error('CITA_PASADA', 'Esta cita ya pasó: no se puede eliminar.');
    
    // DELETE no lleva datosUser: la dirección ya dice qué cita borrar
    const resp = await pedir(rutaCita(id), { metodo: 'DELETE' });
    
    // respuesta: éxito, cita no encontrada (404) o error general
    if (resp.ok) return { success: true };
    if (resp.estado === 404) return NO_ENCONTRADA;
    return falla(resp, 'No se pudo eliminar la cita.');
}
