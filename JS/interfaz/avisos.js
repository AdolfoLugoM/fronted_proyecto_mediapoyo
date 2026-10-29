// Avisos temporales (toast) que aparecen en una esquina y se cierran solos.
// Uso: mostrarAviso('Paciente guardado', 'exito')  o  mostrarAviso('Algo falló', 'error')
// Los estilos (.contenedor-avisos y .aviso) viven en Alertas.css.

let contenedor = null;

function obtenerContenedor() {
    if (contenedor) return contenedor;
    
    contenedor = document.createElement('div');
    contenedor.className = 'contenedor-avisos';
    document.body.appendChild(contenedor);
    return contenedor;
}

export function mostrarAviso(texto, tipo = 'exito', duracionMs = 4000) {
    const aviso = document.createElement('div');
    aviso.className = `aviso aviso--${tipo}`;
    aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');   // los lectores de pantalla lo anuncian
    aviso.textContent = texto;                                           // textContent: nunca interpreta HTML
    
    obtenerContenedor().appendChild(aviso);
    
    setTimeout(() => aviso.classList.add('aviso--saliendo'), duracionMs);
    setTimeout(() => aviso.remove(), duracionMs + 300);                  // 300 ms = duración de la transición en CSS
}