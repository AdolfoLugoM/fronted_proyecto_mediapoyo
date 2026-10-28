// Menú lateral colapsable
const sidebar = document.getElementById('sidebar');
const mainContent = document.querySelector('main');

// Alterna entre el menú completo y el de solo íconos
function alternarMenuSidebar() {
    sidebar?.classList.toggle('colapsado');
    mainContent?.classList.toggle('colapsado');
}

// Botón 'X' dentro del sidebar
document.getElementById('boton-cerrar-sidebar')?.addEventListener('click', alternarMenuSidebar);

// Botón flotante de hamburguesa
document.getElementById('boton-abrir-sidebar')?.addEventListener('click', alternarMenuSidebar);