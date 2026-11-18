// Marca los campos incorrectos de cualquier formulario (el estilo vive en Base.css).
// Cuando un campo no cumple al guardar, el navegador dispara el evento "invalid":
// aquí se le pone la clase "con-errores" al formulario para que el CSS pinte
// en rojo el cuadro y su etiqueta (con asterisco). Al corregir el campo, se quita solo.

let yaSeEnfoco = false;   // solo el primer campo incorrecto recibe el cursor

// "invalid" no sube por el árbol, por eso se escucha en la fase de captura (true)
document.addEventListener('invalid', (evento) => {
    evento.preventDefault();                       // quita el globo "Completa este campo" del navegador
    evento.target.form?.classList.add('con-errores');
    
    if (!yaSeEnfoco) {
        yaSeEnfoco = true;
        evento.target.focus();
        setTimeout(() => { yaSeEnfoco = false; });   // listo para el siguiente intento
    }
}, true);

// Al limpiar el formulario también se limpian las marcas
document.addEventListener('reset', (evento) => {
    evento.target.classList?.remove('con-errores');
});
