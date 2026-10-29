// Modal emergente de confirmación (cerrar sesión)
import { cerrarSesion } from '../servicios/sesionServicio.js';

const btnLogout = document.getElementById('btn-logout');
const modalLogout = document.getElementById('modal-overlay-logout');
const btnCancelarLogout = document.getElementById('btn-cancelar-logout');
const btnConfirmarLogout = document.getElementById('btn-confirmar-logout');

function cerrarModal() {
    modalLogout?.classList.remove('activo');
}

// Abre el modal
btnLogout?.addEventListener('click', () => {
    modalLogout?.classList.add('activo');
});

// Cancela y cierra el modal
btnCancelarLogout?.addEventListener('click', cerrarModal);

// Confirma: cierra la sesión y redirige al login
btnConfirmarLogout?.addEventListener('click', async () => {
    try {
        await cerrarSesion();
    } catch (error) {
        console.error('Error al cerrar la sesión:', error);
    }
    window.location.href = 'login.html';
});

// Cierra al hacer clic fuera del cuadro (en la zona oscura)
modalLogout?.addEventListener('click', (evento) => {
    if (evento.target === modalLogout) cerrarModal();
});

// Cierra con la tecla Escape
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modalLogout?.classList.contains('activo')) {
        cerrarModal();
    }
});