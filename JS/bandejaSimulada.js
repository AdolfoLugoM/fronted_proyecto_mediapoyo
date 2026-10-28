// SOLO PARA LA SIMULACIÓN: muestra el mensaje que "recibiría" el teléfono del paciente.
// Con servidor real, el código viaja por SMS o correo directamente al paciente y NUNCA llega
// al navegador del médico: este archivo y su import en main.js se eliminan.

import { EVENTO_MENSAJE_SIMULADO } from './consultasServicio.js';

let panel = null;

function cerrar() {
    panel?.remove();
    panel = null;
}

function mostrarMensaje({ destino, texto }) {
    cerrar();                                   // solo un mensaje a la vez: el código nuevo reemplaza al anterior
    
    panel = document.createElement('aside');
    panel.className = 'bandeja-simulada';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-label', 'Mensaje simulado en el teléfono del paciente');
    
    const cabecera = document.createElement('div');
    cabecera.className = 'bandeja-simulada__cabecera';
    
    const titulo = document.createElement('strong');
    titulo.textContent = `Teléfono del paciente (${destino})`;
    
    const etiqueta = document.createElement('span');
    etiqueta.className = 'bandeja-simulada__etiqueta';
    etiqueta.textContent = 'Simulación';
    
    cabecera.append(titulo, etiqueta);
    
    const mensaje = document.createElement('p');
    mensaje.textContent = texto;                // textContent: nunca interpreta HTML
    
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton-enlace';
    boton.textContent = 'Cerrar';
    boton.addEventListener('click', cerrar);
    
    panel.append(cabecera, mensaje, boton);
    document.body.appendChild(panel);
}

// detail con mensaje: se muestra. detail null: el código ya no sirve y se quita.
window.addEventListener(EVENTO_MENSAJE_SIMULADO, (evento) => {
    if (evento.detail) mostrarMensaje(evento.detail);
    else cerrar();
});
