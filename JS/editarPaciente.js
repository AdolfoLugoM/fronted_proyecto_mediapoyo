// Edición de los datos de un paciente desde el lápiz de cada fila de la tabla de resultados.
//
// - busqueda.js crea el lápiz y llama a abrirEdicion(paciente).
// - "Cancelar" (o Escape) cierra el modal sin tocar nada.
// - "Guardar" valida, manda SOLO los campos que cambiaron al servicio y, si sale bien,
//   avisa al resto de la app con el evento 'paciente-actualizado'
//   (lo escuchan la tabla de resultados y el historial para redibujarse).

import { actualizarPaciente } from './pacientesServicio.js';
import { mostrarAviso } from './avisos.js';

const modal = document.getElementById('modal-editar-paciente');
const formulario = document.getElementById('formulario-editar-paciente');
const btnCancelar = document.getElementById('btn-cancelar-edicion');
const btnGuardar = document.getElementById('btn-guardar-edicion');
const campoCurp = document.getElementById('editar-curp');
const campoNacimiento = document.getElementById('editar-nacimiento');

// name del campo en el formulario -> propiedad del paciente (igual que en el registro)
const CAMPOS = {
    nombre: 'nombre',
    apellidos: 'apellidos',
    curp: 'curp',
    nacimiento: 'fechaNacimiento',
    sexo: 'sexo',
    telefono: 'telefono',
    correo: 'correo',
    'tipo-sangre': 'tipoSangre',
    notas: 'notas'
};

let pacienteEditable = null;     // el paciente que se está editando
let guardando = false;
let focoAnterior = null;         // a dónde regresa el foco al cerrar el modal (el lápiz de la fila)

// Fecha de hoy en hora local (toISOString usaría UTC y en la noche daría el día siguiente)
function hoyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ----- Formulario -----

function llenarFormulario(paciente) {
    for (const [campo, propiedad] of Object.entries(CAMPOS)) {
        const elemento = formulario.elements[campo];
        if (elemento) elemento.value = paciente[propiedad] ?? '';
    }
}

function leerFormulario() {
    const datos = Object.fromEntries(new FormData(formulario));
    const paciente = {};
    for (const [campo, propiedad] of Object.entries(CAMPOS)) {
        paciente[propiedad] = (datos[campo] ?? '').trim();
    }
    paciente.curp = paciente.curp.toUpperCase();
    return paciente;
}

// Solo lo que de verdad cambió: así el servidor (y la auditoría) saben qué se modificó
function obtenerCambios(original, editado) {
    const cambios = {};
    for (const propiedad of Object.values(CAMPOS)) {
        if ((original[propiedad] ?? '') !== editado[propiedad]) cambios[propiedad] = editado[propiedad];
    }
    return cambios;
}

function bloquear(estado) {
    guardando = estado;
    btnGuardar.disabled = estado;
    btnCancelar.disabled = estado;
    btnGuardar.textContent = estado ? 'Guardando...' : 'Guardar';
}

// ----- Abrir / cerrar -----

/** Abre el modal con los datos de ese paciente (lo llama el lápiz de la tabla). */
export function abrirEdicion(paciente) {
    if (!paciente || !modal) return;
    
    pacienteEditable = paciente;
    focoAnterior = document.activeElement;
    llenarFormulario(paciente);
    campoNacimiento.max = hoyLocal();          // no se aceptan fechas futuras
    
    modal.classList.add('activo');
    formulario.elements.nombre?.focus();
}

function cerrarModal() {
    if (guardando) return;                     // no se cierra a media actualización
    modal?.classList.remove('activo');
    pacienteEditable = null;
    focoAnterior?.focus?.();
}

btnCancelar?.addEventListener('click', cerrarModal);

// Escape = Cancelar. A propósito NO se cierra al hacer clic fuera: se perderían los cambios por accidente.
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modal?.classList.contains('activo')) cerrarModal();
});

// CURP siempre en mayúsculas mientras se escribe
campoCurp?.addEventListener('input', () => {
    const { selectionStart, selectionEnd } = campoCurp;
    campoCurp.value = campoCurp.value.toUpperCase();
    campoCurp.setSelectionRange(selectionStart, selectionEnd);
});

// ----- Guardar -----
formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (guardando || !pacienteEditable) return;
    
    // Quita espacios sobrantes antes de validar, para que "required" detecte campos con solo espacios
    formulario.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], textarea')
        .forEach(campo => { campo.value = campo.value.trim(); });
    
    if (!formulario.reportValidity()) return;
    
    const cambios = obtenerCambios(pacienteEditable, leerFormulario());
    if (Object.keys(cambios).length === 0) {
        mostrarAviso('No hay cambios que guardar.', 'exito');
        cerrarModal();
        return;
    }
    
    bloquear(true);
    
    try {
        const resultado = await actualizarPaciente(pacienteEditable.id, cambios);
        
        if (!resultado.success) {
            mostrarAviso(resultado.message ?? 'No se pudieron guardar los cambios.', 'error');
            if (resultado.codigo === 'CURP_DUPLICADA') {
                bloquear(false);
                campoCurp.focus();
                campoCurp.select();
            }
            return;
        }
        
        document.dispatchEvent(new CustomEvent('paciente-actualizado', { detail: resultado.paciente }));
        
        bloquear(false);
        cerrarModal();
        mostrarAviso('Datos del paciente actualizados.', 'exito');
    } catch (error) {
        console.error('Error al actualizar el paciente:', error);
        mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
    } finally {
        if (guardando) bloquear(false);
    }
});
