// Perfil del médico en sesión:
//  - su nombre completo aparece dentro del sidebar
//  - en la barra superior hay un ícono de usuario que muestra el nombre al pasar el cursor
//  - ambos abren el modal para editar el perfil (solo "Cancelar" y "Guardar")
//  - desde ese modal se llega a cambiar la contraseña (ver seguridadCuenta.js)

import { obtenerMedicoActual, actualizarPerfil } from './sesionServicio.js';
import { mostrarAviso } from './avisos.js';

const botonSidebar = document.getElementById('perfil-sidebar');
const nombreSidebar = document.getElementById('perfil-nombre');
const especialidadSidebar = document.getElementById('perfil-especialidad');
const botonBarra = document.getElementById('btn-perfil');

const modal = document.getElementById('modal-editar-perfil');
const formulario = document.getElementById('formulario-editar-perfil');
const btnCancelar = document.getElementById('btn-cancelar-perfil');
const btnGuardar = document.getElementById('btn-guardar-perfil');

const CAMPOS = ['nombre', 'apellidos'];   // name del campo = propiedad del médico

let medicoActual = null;
let guardando = false;
let focoAnterior = null;         // el botón con el que se abrió (sidebar o barra superior)

// ----- Mostrar al médico en el sidebar y en la barra superior -----

function mostrarMedico(medico) {
    medicoActual = medico;
    
    const nombre = medico ? `${medico.nombre} ${medico.apellidos}` : 'Sin sesión';
    
    if (nombreSidebar) nombreSidebar.textContent = nombre;
    
    if (botonBarra) {
        // El texto del cuadro flotante sale de data-tooltip (ver .btn-perfil en Navegador.css)
        botonBarra.dataset.tooltip = nombre;
        botonBarra.setAttribute('aria-label', `Perfil de ${nombre}`);
    }
    
    botonSidebar?.setAttribute('aria-label', `Editar perfil de ${nombre}`);
}

// ----- Modal -----

function bloquear(estado) {
    guardando = estado;
    btnGuardar.disabled = estado;
    btnCancelar.disabled = estado;
    btnGuardar.textContent = estado ? 'Guardando...' : 'Guardar';
}

// Exportadas para que los modales de correo y contraseña puedan cerrar el perfil y regresar a él.
// conservarFoco: al regresar de otro modal, el foco debe volver al botón que abrió el perfil al principio.
export function abrirPerfil({ conservarFoco = false } = {}) {
    if (!medicoActual) {
        mostrarAviso('No hay una sesión activa. Vuelve a iniciar sesión.', 'error');
        return;
    }
    if (!modal) return;
    
    if (!conservarFoco) focoAnterior = document.activeElement;
    for (const campo of CAMPOS) {
        formulario.elements[campo].value = medicoActual[campo] ?? '';
    }
    
    modal.classList.add('activo');
    formulario.elements.nombre.focus();
}

// restaurarFoco: false cuando se pasa a otro modal (el foco se va a ese modal, no al botón del inicio)
export function cerrarPerfil({ restaurarFoco = true } = {}) {
    if (guardando) return;                     // no se cierra a media actualización
    modal?.classList.remove('activo');
    if (restaurarFoco) focoAnterior?.focus?.();
}

botonSidebar?.addEventListener('click', () => abrirPerfil());
botonBarra?.addEventListener('click', () => abrirPerfil());
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
    .then(mostrarMedico)
    .catch((error) => {
        console.error('No se pudo cargar el perfil del médico:', error);
        mostrarMedico(null);
    });
