// Cambiar la contraseña del médico en sesión.
// Se llega desde el enlace del modal de perfil:
//   - "Cancelar" (o Escape) regresa al modal de perfil
//   - "Guardar" valida y, si sale bien, cierra todo y avisa
// Las contraseñas NUNCA se recortan (los espacios cuentan) ni se muestran en avisos o en la consola.

import { cambiarClave } from '../servicios/sesionServicio.js';
import { abrirPerfil, cerrarPerfil } from './perfil.js';
import { mostrarAviso } from './avisos.js';

/**
* Comportamiento del modal de cambio de contraseña.
* - validar(formulario): validaciones extra antes de reportValidity (por ejemplo, que coincidan las contraseñas)
* - enviar(datos): llama al servicio y devuelve { success, message, campo? }
*   (campo = name del input que tuvo el problema, para dejar ahí el cursor)
*/
function prepararModal({ idModal, idFormulario, idCancelar, idGuardar, validar, enviar, mensajeExito }) {
    const modal = document.getElementById(idModal);
    const formulario = document.getElementById(idFormulario);
    const btnCancelar = document.getElementById(idCancelar);
    const btnGuardar = document.getElementById(idGuardar);
    
    if (!modal || !formulario) return { abrir() {} };
    
    let guardando = false;
    
    function bloquear(estado) {
        guardando = estado;
        btnGuardar.disabled = estado;
        btnCancelar.disabled = estado;
        btnGuardar.textContent = estado ? 'Guardando...' : 'Guardar';
    }
    
    function limpiar() {
        formulario.reset();                    // las contraseñas no se quedan escritas en la página
        formulario.querySelectorAll('input').forEach(campo => campo.setCustomValidity(''));
    }
    
    function abrir() {
        limpiar();
        modal.classList.add('activo');
        formulario.querySelector('input')?.focus();
    }
    
    function cerrar({ volverAlPerfil }) {
        if (guardando) return;
        modal.classList.remove('activo');
        limpiar();
        if (volverAlPerfil) abrirPerfil({ conservarFoco: true });
    }
    
    btnCancelar?.addEventListener('click', () => cerrar({ volverAlPerfil: true }));
    
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && modal.classList.contains('activo')) cerrar({ volverAlPerfil: true });
    });
    
    // Al escribir de nuevo se quita el mensaje de error personalizado de ese campo
    formulario.addEventListener('input', (evento) => evento.target.setCustomValidity?.(''));
    
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (guardando) return;
        
        validar?.(formulario);
        if (!formulario.reportValidity()) return;
        
        bloquear(true);
        
        try {
            const resultado = await enviar(Object.fromEntries(new FormData(formulario)));
            
            if (!resultado.success) {
                mostrarAviso(resultado.message ?? 'No se pudieron guardar los cambios.', 'error');
                
                if (resultado.codigo === 'SIN_SESION') {
                    window.location.href = 'login.html';
                    return;
                }
                
                const campo = resultado.campo && formulario.elements[resultado.campo];
                if (campo) {
                    bloquear(false);
                    if (campo.type === 'password') campo.value = '';
                    campo.focus();
                }
                return;
            }
            
            bloquear(false);
            cerrar({ volverAlPerfil: false });
            cerrarPerfil();                    // por si acaso; el foco regresa al botón con el que se abrió el perfil
            mostrarAviso(mensajeExito, 'exito');
        } catch (error) {
            console.error('Error al guardar los datos de la cuenta:', error.message);
            mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
        } finally {
            if (guardando) bloquear(false);
        }
    });
    
    return { abrir };
}

// ----- Cambiar contraseña -----

const modalClave = prepararModal({
    idModal: 'modal-cambiar-clave',
    idFormulario: 'formulario-cambiar-clave',
    idCancelar: 'btn-cancelar-clave',
    idGuardar: 'btn-guardar-clave',
    mensajeExito: 'Contraseña actualizada.',
    validar: (formulario) => {
        const nueva = formulario.elements['clave-nueva'];
        const confirmar = formulario.elements['confirmar-clave'];
        
        confirmar.setCustomValidity(confirmar.value && confirmar.value !== nueva.value
            ? 'Las contraseñas no coinciden.' : '');
    },
    enviar: (datos) => cambiarClave(datos['clave-nueva'])
});

// ----- Enlaces dentro del modal de perfil -----

document.getElementById('btn-ir-cambiar-clave')?.addEventListener('click', () => {
    cerrarPerfil({ restaurarFoco: false });
    modalClave.abrir();
});
