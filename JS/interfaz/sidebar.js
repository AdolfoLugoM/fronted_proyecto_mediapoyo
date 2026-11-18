// Menú lateral colapsable
const sidebar = document.getElementById('sidebar');
const mainContent = document.querySelector('main');

// Alterna entre el menú completo y el de solo íconos
function alternarMenuSidebar() {
    sidebar?.classList.toggle('colapsado');
    mainContent?.classList.toggle('colapsado');
}

// En celulares el menú tapa el contenido: empieza cerrado y se cierra al elegir una opción
const pantallaCelular = window.matchMedia('(max-width: 700px), (max-height: 500px) and (max-width: 950px)');

if (pantallaCelular.matches) {
    alternarMenuSidebar();
}

document.querySelectorAll('#sidebar .menu-botones .boton, #sidebar #perfil-sidebar, #sidebar #titulo-sidebar, #sidebar #btn-logout').forEach((boton) => {
    boton.addEventListener('click', () => {
        if (pantallaCelular.matches && !sidebar.classList.contains('colapsado')) {
            alternarMenuSidebar();
        }
    });
});

// Botón 'X' dentro del sidebar
document.getElementById('boton-cerrar-sidebar')?.addEventListener('click', alternarMenuSidebar);

// Botón flotante de hamburguesa
document.getElementById('boton-abrir-sidebar')?.addEventListener('click', alternarMenuSidebar);