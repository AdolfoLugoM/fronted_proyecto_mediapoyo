// Página de registro (registrar.html): crea la cuenta del médico y lo lleva al inicio de sesión.
import { crearMedico } from '../servicios/medicosServicio.js';

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
    mensajeError.textContent = texto;
    mensajeError.hidden = false;
}

formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    mensajeError.hidden = true;

    // Quita espacios sobrantes para que "required" detecte campos con solo espacios
    for (const campo of ['nombre', 'apellidos', 'ciudad', 'efirma', 'usuario']) {
        formulario.elements[campo].value = formulario.elements[campo].value.trim();
    }
    if (!formulario.reportValidity()) return;

    boton.disabled = true;                     // evita registrar dos veces con doble clic

    try {
        const resultado = await crearMedico({
            nombre: formulario.elements.nombre.value,
            apellidos: formulario.elements.apellidos.value,
            ciudad: formulario.elements.ciudad.value,
            eFirma: formulario.elements.efirma.value,
            usuario: formulario.elements.usuario.value,
            clave: formulario.elements.clave.value
        });

        if (resultado.success) {
            window.location.href = 'login.html';
            return;
        }

        mostrarError(resultado.message ?? 'No se pudo crear la cuenta.');
        const campo = resultado.campo === 'eFirma' ? 'efirma' : resultado.campo;
        formulario.elements[campo]?.focus();
    } catch (error) {
        console.error('Error al crear la cuenta:', error);
        mostrarError('Ocurrió un problema al conectar con el servidor.');
    }

    boton.disabled = false;
});
