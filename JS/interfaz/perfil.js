// Perfil del médico en sesión:
//  - su nombre completo aparece dentro del sidebar
//  - el botón del sidebar abre el modal para editar el perfil (solo "Cancelar" y "Guardar")

import { obtenerMedicoActual, actualizarPerfil } from '../servicios/sesionServicio.js';
import { mostrarAviso } from './avisos.js';

const botonSidebar = document.getElementById('perfil-sidebar');
const nombreSidebar = document.getElementById('perfil-nombre');
const especialidadSidebar = document.getElementById('perfil-especialidad');

const modal = document.getElementById('modal-editar-perfil');
const formulario = document.getElementById('formulario-editar-perfil');
const btnCancelar = document.getElementById('btn-cancelar-perfil');
const btnGuardar = document.getElementById('btn-guardar-perfil');

const CAMPOS = ['nombre', 'apellidos', 'ciudad'];   // name del campo = propiedad del médico

let medicoActual = null;
let guardando = false;
let focoAnterior = null;         // el botón con el que se abrió

// ----- Mostrar al médico en el sidebar -----

function mostrarMedico(medico) {
    medicoActual = medico;

    const nombre = medico ? `${medico.nombre} ${medico.apellidos}` : 'Sin sesión';

    if (nombreSidebar) nombreSidebar.textContent = nombre;

    botonSidebar?.setAttribute('aria-label', `Editar perfil de ${nombre}`);
}

// ----- Modal -----

function bloquear(estado) {
    guardando = estado;
    btnGuardar.disabled = estado;
    btnCancelar.disabled = estado;
    btnGuardar.textContent = estado ? 'Guardando...' : 'Guardar';
}

function abrirPerfil() {
    if (!medicoActual) {
        mostrarAviso('No hay una sesión activa. Vuelve a iniciar sesión.', 'error');
        return;
    }
    if (!modal) return;

    focoAnterior = document.activeElement;
    for (const campo of CAMPOS) {
        formulario.elements[campo].value = medicoActual[campo] ?? '';
    }

    modal.classList.add('activo');
    formulario.elements.nombre.focus();
}

function cerrarPerfil() {
    if (guardando) return;                     // no se cierra a media actualización
    modal?.classList.remove('activo');
    focoAnterior?.focus?.();                   // el foco regresa al botón con el que se abrió
}

botonSidebar?.addEventListener('click', () => abrirPerfil());
btnCancelar?.addEventListener('click', () => cerrarPerfil());

// Escape = Cancelar. No se cierra al hacer clic fuera, para no perder lo escrito por accidente.
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modal?.classList.contains('activo')) cerrarPerfil();
});

// ----- Guardar -----

formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (guardando || !medicoActual) return;
    
    // Quita espacios sobrantes para que "required" detecte campos con solo espacios
    for (const campo of CAMPOS) {
        formulario.elements[campo].value = formulario.elements[campo].value.trim();
    }
    if (!formulario.reportValidity()) return;
    
    // Solo lo que de verdad cambió
    const cambios = {};
    for (const campo of CAMPOS) {
        const valor = formulario.elements[campo].value;
        if (valor !== (medicoActual[campo] ?? '')) cambios[campo] = valor;
    }
    
    if (Object.keys(cambios).length === 0) {
        mostrarAviso('No hay cambios que guardar.', 'exito');
        cerrarPerfil();
        return;
    }
    
    bloquear(true);
    
    try {
        const resultado = await actualizarPerfil(cambios);
        
        if (!resultado.success) {
            mostrarAviso(resultado.message ?? 'No se pudo actualizar el perfil.', 'error');
            if (resultado.codigo === 'SIN_SESION') {
                bloquear(false);
                window.location.href = 'login.html';
            }
            return;
        }
        
        mostrarMedico(resultado.medico);       // actualiza sidebar y cuadro flotante al momento
        bloquear(false);
        cerrarPerfil();
        mostrarAviso('Perfil actualizado.', 'exito');
    } catch (error) {
        console.error('Error al actualizar el perfil:', error);
        mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
    } finally {
        if (guardando) bloquear(false);
    }
});

// ----- Carga inicial -----

obtenerMedicoActual()
    .then((medico) => {
        if (!medico) {
            window.location.href = 'login.html';
            return;
        }
        mostrarMedico(medico);
    })
    .catch((error) => {
        console.error('No se pudo cargar el perfil del médico:', error);
        mostrarMedico(null);
    });