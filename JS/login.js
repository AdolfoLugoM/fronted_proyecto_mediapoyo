// Página de inicio de sesión (login.html): reconoce al médico y abre el sistema.
import { iniciarSesion } from './sesionServicio.js';

const formulario = document.getElementById('formulario-login');
const campoCorreo = document.getElementById('correo');
const campoClave = document.getElementById('clave');
const mensajeError = document.getElementById('login-error');
const boton = formulario?.querySelector('button[type="submit"]');

function mostrarError(texto) {
    if (!mensajeError) return;
    mensajeError.textContent = texto;
    mensajeError.hidden = false;
}

formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (mensajeError) mensajeError.hidden = true;
    boton.disabled = true;                     // evita enviar dos veces con doble clic

    try {
        const resultado = await iniciarSesion(campoCorreo.value, campoClave.value);

        if (resultado.success) {
            window.location.href = 'index.html';
            return;
        }

        mostrarError(resultado.message ?? 'No se pudo iniciar sesión.');
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        mostrarError('Ocurrió un problema al conectar con el servidor.');
    }

    boton.disabled = false;
    campoClave.value = '';
    campoClave.focus();
});