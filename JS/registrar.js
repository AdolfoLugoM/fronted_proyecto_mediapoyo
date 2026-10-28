// Verifica que "Contraseña" y "Confirmar contraseña" sean iguales
const clave = document.getElementById('clave');
const confirmarClave = document.getElementById('confirmar-clave');

function validarCoincidencia() {
    const mensaje = confirmarClave.value !== clave.value
        ? 'Las contraseñas no coinciden'
        : '';
    confirmarClave.setCustomValidity(mensaje);   // vacío = campo válido
}

clave?.addEventListener('input', validarCoincidencia);
confirmarClave?.addEventListener('input', validarCoincidencia);