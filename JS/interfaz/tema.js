// Tema claro / oscuro: el botón de la barra superior alterna y recuerda la elección.
// El tema inicial lo aplica un script en el <head> de index.html para evitar un parpadeo.

const boton = document.getElementById('btn-tema');
const raiz = document.documentElement;

function esClaro() {
    return raiz.dataset.tema === 'claro';
}

function actualizarBoton() {
    if (!boton) return;
    const texto = esClaro() ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
    boton.dataset.tooltip = texto;
    boton.setAttribute('aria-label', texto);
}

boton?.addEventListener('click', () => {
    if (esClaro()) delete raiz.dataset.tema;
    else raiz.dataset.tema = 'claro';
    
    try {
        localStorage.setItem('tema', esClaro() ? 'claro' : 'oscuro');
    } catch { /* sin almacenamiento: el tema solo dura esta visita */ }
    
    actualizarBoton();
});

actualizarBoton();