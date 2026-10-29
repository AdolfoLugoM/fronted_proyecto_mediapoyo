// Ventana que muestra la llave de una consulta recién guardada.
// La llave solo se ve aquí, una vez: por eso la ventana no se cierra con Escape ni con un clic afuera,
// solo con el botón "Ya la entregué".

const modal = document.getElementById('modal-llave');
const textoFolio = document.getElementById('llave-folio');
const textoLlave = document.getElementById('llave-texto');
const btnCopiar = document.getElementById('btn-copiar-llave');
const btnCerrar = document.getElementById('btn-cerrar-llave');

let resolverActual = null;

/** Muestra la llave y devuelve una promesa que se cumple cuando se cierra la ventana. */
export function mostrarLlaveNueva(llave, folio) {
    return new Promise((resolver) => {
        resolverActual = resolver;
        
        textoFolio.textContent = String(folio).padStart(4, '0');
        textoLlave.textContent = llave;
        btnCopiar.textContent = 'Copiar llave';
        
        modal.classList.add('activo');
        btnCerrar.focus();
    });
}

function cerrar() {
    modal.classList.remove('activo');
    textoLlave.textContent = '';               // la llave deja de estar en pantalla
    resolverActual?.();
    resolverActual = null;
}

btnCerrar?.addEventListener('click', cerrar);

btnCopiar?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(textoLlave.textContent);
        btnCopiar.textContent = 'Copiada ✓';
    } catch {
        btnCopiar.textContent = 'No se pudo copiar';
    }
});