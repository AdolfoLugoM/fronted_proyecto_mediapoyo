import { mostrarVista, marcarBoton } from './vistas.js';

const boton = document.getElementById('boton4');

boton?.addEventListener('click', () => {
    marcarBoton(boton);
    mostrarVista('vista-buscar-enfermedad');
});