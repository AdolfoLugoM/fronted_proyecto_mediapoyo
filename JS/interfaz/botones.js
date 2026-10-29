document.addEventListener('DOMContentLoaded', () => {
/* ========================================================================== 1. CONTROL DE NAVEGACIÓN Y MENÚ LATERAL (SIDEBAR COLAPSABLE) ========================================================================== */
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('main');
    const btnCerrarSidebar = document.getElementById('boton-cerrar-sidebar');
    const btnAbrirSidebar = document.getElementById('boton-abrir-sidebar');
    
    // Función centralizada para alternar entre el menú completo y el de solo íconos
    function alternarMenuSidebar() {
        if (sidebar) sidebar.classList.toggle('colapsado');
        if (mainContent) mainContent.classList.toggle('colapsado');
    }
    
    // Al presionar el botón 'X' dentro del sidebar
    if (btnCerrarSidebar) {
        btnCerrarSidebar.addEventListener('click', alternarMenuSidebar);
    }
    
    // Al presionar el botón flotante de Hamburguesa
    if (btnAbrirSidebar) {
        btnAbrirSidebar.addEventListener('click', alternarMenuSidebar);
    }
    
/* ========================================================================== 2. MODAL EMERGENTE DE CONFIRMACIÓN (CERRAR SESIÓN) ========================================================================== */
    const btnLogout = document.getElementById('btn-logout');
    const modalLogout = document.getElementById('modal-overlay-logout');
    const btnCancelarLogout = document.getElementById('btn-cancelar-logout');
    const btnConfirmarLogout = document.getElementById('btn-confirmar-logout');
    
    // Abre el modal emergente al hacer clic en el botón de cerrar sesión
    if (btnLogout && modalLogout) {
        btnLogout.addEventListener('click', () => {
            modalLogout.classList.add('activo');
        });
    }
    
    // Cancela y cierra el modal
    if (btnCancelarLogout && modalLogout) {
        btnCancelarLogout.addEventListener('click', () => {
            modalLogout.classList.remove('activo');
        });
    }
    
    // Confirma la acción y redirige a la página de login
    if (btnConfirmarLogout) {
        btnConfirmarLogout.addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }
    
    // Cierra el modal si el usuario hace clic fuera del cuadro emergente (en la zona oscura)
    if (modalLogout) {
        modalLogout.addEventListener('click', (evento) => {
            if (evento.target === modalLogout) {
                modalLogout.classList.remove('activo');
            }
        });
    }
    
    // Cierra el modal con la tecla "Escape" (ESC) para mayor accesibilidad
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && modalLogout && modalLogout.classList.contains('activo')) {
            modalLogout.classList.remove('activo');
        }
    });
    
/* ========================================================================== 3. FUNCIONALIDAD DE LA BARRA DE BÚSQUEDA ========================================================================== */
    const formBusqueda = document.querySelector('.formulario-busqueda');
    const inputBusqueda = document.getElementById('campo-busqueda');
    
    if (formBusqueda && inputBusqueda) {
        formBusqueda.addEventListener('submit', (evento) => {
            evento.preventDefault(); // Evita recargar la página
            
            const terminoBusqueda = inputBusqueda.value.trim();
            
            if (terminoBusqueda !== '') {
                console.log(`Buscando: ${terminoBusqueda}`);
                // Aquí puedes agregar la lógica para filtrar tus registros o hacer un fetch
            }
        });
    }
/* ========================================================================== 4. CAMBIO DE VISTAS (SIN SALIR DE LA PÁGINA) ========================================================================== */
    const vistas = document.querySelectorAll('.vista');
    const botonesMenu = document.querySelectorAll('.menu-botones .boton');
    
    // Marca el botón presionado (null = quita la marca de todos)
    function marcarBoton(botonActivo) {
        botonesMenu.forEach(boton => {
            const esActivo = boton === botonActivo;
            boton.classList.toggle('activo', esActivo);
            boton.setAttribute('aria-current', esActivo ? 'page' : 'false');
        });
    }
    
    // Todos los botones del menú (el título no está en esta lista)
    botonesMenu.forEach(boton => {
        boton.addEventListener('click', () => marcarBoton(boton));
    });
    
    function mostrarVista(idVista) {
        vistas.forEach(v => v.classList.toggle('activa', v.id === idVista));
    }
    
/* =========================================================================== 5. Botón "Nuevo Paciente" (boton1) =====================================================================================*/
    const btnNuevoPaciente = document.getElementById('boton1');
    if (btnNuevoPaciente) {
        btnNuevoPaciente.addEventListener('click', () => {
            mostrarVista('vista-nuevo-paciente');
            document.getElementById('nombre')?.focus();
        });
    }
    
    const formPaciente = document.getElementById('formulario-paciente');
    const btnCancelarPaciente = document.getElementById('btn-cancelar-paciente');
    
    const btnTitulo = document.getElementById('titulo-sidebar');
    
    // Título "MediApoyo"
    btnTitulo.addEventListener('click', () => {
        if (formPaciente) formPaciente.reset();
        mostrarVista('vista-inicio');
        marcarBoton(null);
    });
    
    // Cancelar del formulario
    btnCancelarPaciente.addEventListener('click', () => {
        formPaciente.reset();
        mostrarVista('vista-inicio');
        marcarBoton(null);
    });
    
    // Guardar
    if (formPaciente) {
        formPaciente.addEventListener('submit', (evento) => {
            evento.preventDefault();
            
            // Limpia espacios al inicio y al final de los campos de texto
            formPaciente.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"]')
                .forEach(campo => { campo.value = campo.value.trim(); });
            
            // Con el valor ya limpio, "required" detecta los que quedaron vacíos
            if (!formPaciente.reportValidity()) return;
            
            const datos = Object.fromEntries(new FormData(formPaciente));
            console.log('Paciente nuevo:', datos);
            // Aquí puedes enviar los datos con fetch() a tu backend
            
            formPaciente.reset();
            mostrarVista('vista-inicio');
            marcarBoton(null);
        });
    }
    
});