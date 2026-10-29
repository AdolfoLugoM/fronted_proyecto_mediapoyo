// Funciones compartidas por todos los botones del sidebar
const vistas = document.querySelectorAll('.vista');
const botonesMenu = document.querySelectorAll('.menu-botones .boton');

// Muestra solo la sección con ese id
export function mostrarVista(idVista) {
    vistas.forEach(v => v.classList.toggle('activa', v.id === idVista));
}

// Marca el botón presionado (null = quita la marca de todos)
export function marcarBoton(botonActivo) {
    botonesMenu.forEach(boton => {
        const esActivo = boton === botonActivo;
        boton.classList.toggle('activo', esActivo);
        boton.setAttribute('aria-current', esActivo ? 'page' : 'false');
    });
}

// Vuelve a la vista inicial sin ningún botón marcado
export function irAlInicio() {
    mostrarVista('vista-inicio');
    marcarBoton(null);
}