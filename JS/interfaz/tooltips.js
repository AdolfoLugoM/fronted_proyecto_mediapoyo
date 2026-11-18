// Mensajes emergentes: reemplaza el cuadro nativo del navegador (atributo title)
// por uno con el estilo de la aplicación.

const cuadro = document.createElement("div");
cuadro.className = "tooltip-flotante";
cuadro.setAttribute("role", "tooltip");
document.body.appendChild(cuadro);

let elementoActual = null;

function mostrar(elemento) {
    // Se guarda el title en otro atributo para que el navegador no muestre el suyo
    const texto = elemento.getAttribute("title");
    elemento.dataset.titulo = texto;
    elemento.removeAttribute("title");
    elementoActual = elemento;
    
    cuadro.textContent = texto;
    cuadro.classList.add("visible");
    
    // Debajo del elemento, sin salirse de la pantalla
    const caja = elemento.getBoundingClientRect();
    const ancho = cuadro.offsetWidth;
    let izquierda = caja.left + caja.width / 2 - ancho / 2;
    izquierda = Math.max(8, Math.min(izquierda, window.innerWidth - ancho - 8));
    let arriba = caja.bottom + 8;
    if (arriba + cuadro.offsetHeight > window.innerHeight - 8) {
        arriba = caja.top - cuadro.offsetHeight - 8;
    }
    cuadro.style.left = izquierda + "px";
    cuadro.style.top = arriba + "px";
}

function ocultar() {
    if (!elementoActual) return;
    // Se devuelve el title (puede haber cambiado mientras tanto)
    if (!elementoActual.hasAttribute("title")) {
        elementoActual.setAttribute("title", elementoActual.dataset.titulo);
    }
    delete elementoActual.dataset.titulo;
    elementoActual = null;
    cuadro.classList.remove("visible");
}

document.addEventListener("mouseover", (e) => {
    // El title del elemento actual ya se quitó: mover el cursor entre sus hijos
    // (por ejemplo el ícono dentro de un botón) no debe cerrar el mensaje
    if (elementoActual && elementoActual.contains(e.target)) return;
    const elemento = e.target.closest("[title]");
    ocultar();
    if (elemento && elemento.getAttribute("title").trim()) mostrar(elemento);
});

document.addEventListener("mouseout", (e) => {
    if (elementoActual && !elementoActual.contains(e.relatedTarget)) ocultar();
});

// Al hacer clic o desplazarse el mensaje ya no tiene sentido
document.addEventListener("mousedown", ocultar);
document.addEventListener("scroll", ocultar, true);

// Si la pantalla se vuelve a dibujar (lista, calendario) o el elemento se oculta
// mientras el cursor está encima, no llega "mouseout": se cierra el mensaje aquí
new MutationObserver(() => {
    if (elementoActual && (!elementoActual.isConnected || elementoActual.getClientRects().length === 0)) {
        elementoActual = null;
        cuadro.classList.remove("visible");
    }
}).observe(document.body, { childList: true, subtree: true, attributes: true });
