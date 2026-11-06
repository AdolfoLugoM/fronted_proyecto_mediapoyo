// Página de registro (registrar.html): crea la cuenta de un médico y lo lleva al inicio de sesión.
import { registrarMedico } from '../servicios/sesionServicio.js';

const formulario = document.getElementById('formulario-registro');
const clave = document.getElementById('clave');
const confirmarClave = document.getElementById('confirmar-clave');
const mensajeError = document.getElementById('registro-error');
const boton = formulario?.querySelector('button[type="submit"]');

// Verifica que "Contraseña" y "Confirmar contraseña" sean iguales
function validarCoincidencia() {
    const mensaje = confirmarClave.value !== clave.value
        ? 'Las contraseñas no coinciden'
        : '';
    confirmarClave.setCustomValidity(mensaje);   // vacío = campo válido
}

clave?.addEventListener('input', validarCoincidencia);
confirmarClave?.addEventListener('input', validarCoincidencia);

function mostrarError(texto) {
    if (!mensajeError) return;
    mensajeError.textContent = texto;
    mensajeError.hidden = false;
}

formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (mensajeError) mensajeError.hidden = true;

    // Quita espacios al inicio y al final para que "required" detecte campos con solo espacios
    formulario.querySelectorAll('input[type="text"]').forEach(campo => { campo.value = campo.value.trim(); });
    validarCoincidencia();
    if (!formulario.reportValidity()) return;

    boton.disabled = true;                     // evita crear la cuenta dos veces con doble clic

    try {
        const datos = Object.fromEntries(new FormData(formulario));
        const resultado = await registrarMedico({
            nombre: datos.nombre,
            apellidos: datos.apellidos,
            ciudad: datos.ciudad,
            efirma: datos.efirma,
            usuario: datos.usuario,
            clave: datos.clave
        });

        if (resultado.success) {
            window.location.href = 'login.html';
            return;
        }

        mostrarError(resultado.message ?? 'No se pudo crear la cuenta.');
    } catch (error) {
        console.error('Error al crear la cuenta:', error);
        mostrarError('Ocurrió un problema al conectar con el servidor.');
    }

    boton.disabled = false;
});
