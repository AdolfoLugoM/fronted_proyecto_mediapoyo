// Formulario de consulta: se abre solo, justo después de guardar un paciente nuevo.
// Los síntomas se buscan escribiendo (catálogo en JSON/sintomas.json), se elige uno de la lista
// y se presiona "Añadir". Se repite las veces necesarias; cada síntoma añadido aparece como etiqueta.

import { mostrarVista, marcarBoton, irAlInicio } from './vistas.js';
import { crearConsulta } from './consultasServicio.js';
import { obtenerSintomas } from './sintomasServicio.js';
import { mostrarAviso } from './avisos.js';

const MAX_SUGERENCIAS = 8;

const formulario = document.getElementById('formulario-consulta');
const nombrePaciente = document.getElementById('consulta-paciente-nombre');
const detallePaciente = document.getElementById('consulta-paciente-detalle');
const notasPaciente = document.getElementById('consulta-paciente-notas');
const contenedorBuscador = document.getElementById('buscador-sintomas');
const buscador = document.getElementById('buscador-sintoma');
const listaSugerencias = document.getElementById('sugerencias-sintomas');
const btnAnadir = document.getElementById('btn-anadir-sintoma');
const contadorSintomas = document.getElementById('contador-sintomas');
const contenedorElegidos = document.getElementById('sintomas-elegidos');
const btnGuardar = document.getElementById('btn-guardar-consulta');
const btnCancelar = document.getElementById('btn-cancelar-consulta');

let pacienteActual = null;
let destinoGuardar = irAlInicio;      // a dónde se vuelve al guardar la consulta
let destinoCancelar = irAlInicio;     // a dónde se vuelve al cancelar
let catalogo = [];                    // [ { id, nombre, categoria } ]
let catalogoCargado = false;
let cargandoCatalogo = false;

const elegidos = new Map();           // id -> síntoma, en el orden en que se añadieron
let sintomaPendiente = null;          // síntoma elegido de la lista que todavía no se ha añadido
let sugerencias = [];                 // coincidencias que se muestran ahora
let indiceActivo = -1;                // opción resaltada con las flechas

// Quita acentos y mayúsculas: "oido" encuentra "Dolor de oído"
const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ----- Catálogo -----

// El catálogo se pide la primera vez que se abre la consulta
async function cargarCatalogo() {
    if (catalogoCargado || cargandoCatalogo) return;
    cargandoCatalogo = true;
    
    buscador.disabled = true;
    buscador.placeholder = 'Cargando síntomas...';
    
    try {
        catalogo = await obtenerSintomas();
        catalogoCargado = true;
        buscador.placeholder = 'Escribe un síntoma, por ejemplo: fiebre';
        buscador.disabled = false;
    } catch (error) {
        console.error('Error al cargar los síntomas:', error);
        buscador.placeholder = 'No se pudo cargar el catálogo de síntomas';
        mostrarAviso('No se pudo cargar el catálogo de síntomas. Aún puedes registrar observaciones.', 'error');
    } finally {
        cargandoCatalogo = false;
    }
}

// ----- Lista de sugerencias -----

// Síntomas que contienen el texto escrito (los que empiezan con él, primero) y que aún no se han añadido
function buscarCoincidencias(texto) {
    const buscado = normalizar(texto);
    if (buscado === '') return [];
    
    return catalogo
        .filter(s => !elegidos.has(s.id) && normalizar(s.nombre).includes(buscado))
        .sort((a, b) =>
            Number(!normalizar(a.nombre).startsWith(buscado)) - Number(!normalizar(b.nombre).startsWith(buscado)))
        .slice(0, MAX_SUGERENCIAS);
}

function abrirSugerencias() {
    listaSugerencias.hidden = false;
    buscador.setAttribute('aria-expanded', 'true');
}

function cerrarSugerencias() {
    listaSugerencias.hidden = true;
    buscador.setAttribute('aria-expanded', 'false');
    buscador.removeAttribute('aria-activedescendant');
    indiceActivo = -1;
}

function dibujarSugerencias() {
    listaSugerencias.replaceChildren();
    indiceActivo = -1;
    buscador.removeAttribute('aria-activedescendant');
    
    if (normalizar(buscador.value) === '' || sintomaPendiente) {
        cerrarSugerencias();
        return;
    }
    
    sugerencias = buscarCoincidencias(buscador.value);
    
    if (sugerencias.length === 0) {
        const vacio = document.createElement('li');
        vacio.className = 'sugerencia-vacia';
        vacio.textContent = 'No se encontraron síntomas con ese nombre.';
        listaSugerencias.appendChild(vacio);
    } else {
        sugerencias.forEach((sintoma, i) => {
            const opcion = document.createElement('li');
            opcion.id = `sugerencia-${i}`;
            opcion.dataset.indice = i;
            opcion.setAttribute('role', 'option');
            opcion.setAttribute('aria-selected', 'false');
            
            const nombre = document.createElement('span');
            nombre.textContent = sintoma.nombre;
            
            const categoria = document.createElement('small');
            categoria.textContent = sintoma.categoria;
            
            opcion.append(nombre, categoria);
            listaSugerencias.appendChild(opcion);
        });
    }
    
    abrirSugerencias();
}

// Resalta una opción con las flechas del teclado (da la vuelta al llegar al final)
function resaltar(indice) {
    const opciones = listaSugerencias.querySelectorAll('[role="option"]');
    if (opciones.length === 0) return;
    
    indiceActivo = (indice + opciones.length) % opciones.length;
    opciones.forEach((opcion, i) => opcion.setAttribute('aria-selected', String(i === indiceActivo)));
    
    const activa = opciones[indiceActivo];
    buscador.setAttribute('aria-activedescendant', activa.id);
    activa.scrollIntoView({ block: 'nearest' });
}

// ----- Elegir, añadir y quitar síntomas -----

// Elegir de la lista: el nombre queda en el cuadro y aparece el botón "Añadir"
function seleccionar(sintoma) {
    sintomaPendiente = sintoma;
    buscador.value = sintoma.nombre;
    btnAnadir.hidden = false;
    cerrarSugerencias();
}

function anadirSintoma() {
    if (!sintomaPendiente) return;
    
    elegidos.set(sintomaPendiente.id, sintomaPendiente);
    sintomaPendiente = null;
    buscador.value = '';
    btnAnadir.hidden = true;
    cerrarSugerencias();
    dibujarElegidos();
    buscador.focus();                  // listo para buscar el siguiente
}

function dibujarElegidos() {
    const fragmento = document.createDocumentFragment();
    
    for (const sintoma of elegidos.values()) {
        const etiqueta = document.createElement('span');
        etiqueta.className = 'chip-sintoma';
        
        const texto = document.createElement('span');
        texto.textContent = sintoma.nombre;
        
        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.textContent = '×';
        quitar.setAttribute('aria-label', `Quitar ${sintoma.nombre}`);
        quitar.addEventListener('click', () => {
            elegidos.delete(sintoma.id);
            dibujarElegidos();
            buscador.focus();
        });
        
        etiqueta.append(texto, quitar);
        fragmento.appendChild(etiqueta);
    }
    
    contenedorElegidos.replaceChildren(fragmento);
    
    const total = elegidos.size;
    contadorSintomas.textContent = total === 0
        ? 'Aún no has añadido síntomas'
        : total === 1 ? '1 síntoma añadido' : `${total} síntomas añadidos`;
}

function reiniciarSintomas() {
    elegidos.clear();
    sintomaPendiente = null;
    buscador.value = '';
    btnAnadir.hidden = true;
    cerrarSugerencias();
    dibujarElegidos();
}

// Notas del paciente (alergias, enfermedades crónicas), visibles mientras se registra la consulta
function mostrarNotas(paciente) {
    if (!notasPaciente) return;
    
    const notas = (paciente.notas ?? '').trim();
    notasPaciente.textContent = `Notas: ${notas || 'sin registrar'}`;
    notasPaciente.classList.toggle('alerta-notas--activa', notas !== '');
}

// ----- Abrir y cerrar la consulta -----

/**
* Abre el formulario de consulta para el paciente indicado.
* Opciones:
*   alGuardar:    función que se ejecuta al guardar (por defecto, ir al inicio)
*   alCancelar:   función que se ejecuta al cancelar (por defecto, la misma de alGuardar)
*   botonActivo:  botón del sidebar que queda marcado (por defecto "Nuevo Paciente"; null = ninguno)
*/
export function abrirConsulta(paciente, { alGuardar = irAlInicio, alCancelar = alGuardar, botonActivo = document.getElementById('boton1') } = {}) {
    pacienteActual = paciente;
    destinoGuardar = alGuardar;
    destinoCancelar = alCancelar;
    
    nombrePaciente.textContent = `${paciente.nombre} ${paciente.apellidos}`;
    detallePaciente.textContent = `CURP: ${paciente.curp}`;
    mostrarNotas(paciente);
    
    formulario.reset();
    reiniciarSintomas();
    marcarBoton(botonActivo);
    mostrarVista('vista-consulta');
    cargarCatalogo();
}

// Limpia el formulario y continúa hacia el destino indicado
function finalizarConsulta(destino) {
    formulario.reset();
    reiniciarSintomas();
    pacienteActual = null;
    destinoGuardar = irAlInicio;
    destinoCancelar = irAlInicio;
    destino();
}

// ----- Eventos del buscador -----

buscador?.addEventListener('input', () => {
    // Si se edita el texto, lo que estaba elegido deja de valer
    sintomaPendiente = null;
    btnAnadir.hidden = true;
    
    // Si escribió el nombre completo sin tocar la lista, también cuenta como elegido
    const exacto = catalogo.find(s => !elegidos.has(s.id) && normalizar(s.nombre) === normalizar(buscador.value));
    if (exacto) {
        sintomaPendiente = exacto;
        btnAnadir.hidden = false;
    }
    
    dibujarSugerencias();
});

buscador?.addEventListener('focus', () => {
    if (!sintomaPendiente && normalizar(buscador.value) !== '') dibujarSugerencias();
});

buscador?.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        if (listaSugerencias.hidden) dibujarSugerencias();
        
        const total = sugerencias.length;
        if (!listaSugerencias.hidden && total > 0) {
            evento.preventDefault();
            const siguiente = evento.key === 'ArrowDown'
                ? indiceActivo + 1
                : (indiceActivo === -1 ? total - 1 : indiceActivo - 1);
            resaltar(siguiente);
        }
        return;
    }
    
    if (evento.key === 'Enter') {
        evento.preventDefault();       // Enter nunca envía el formulario desde este campo
        
        const hayLista = !listaSugerencias.hidden;
        const candidato = indiceActivo >= 0
            ? sugerencias[indiceActivo]
            : (sugerencias.length === 1 ? sugerencias[0] : null);
        
        if (hayLista && candidato) seleccionar(candidato);
        else if (sintomaPendiente) anadirSintoma();
        return;
    }
    
    if (evento.key === 'Escape' && !listaSugerencias.hidden) {
        cerrarSugerencias();
        return;
    }
    
    if (evento.key === 'Tab') cerrarSugerencias();
});

// Clic en una opción: el cuadro no pierde el foco (por eso pointerdown y preventDefault)
listaSugerencias?.addEventListener('pointerdown', (evento) => {
    const opcion = evento.target.closest('[role="option"]');
    if (!opcion) return;
    
    evento.preventDefault();
    seleccionar(sugerencias[Number(opcion.dataset.indice)]);
});

// Clic fuera del buscador: se cierra la lista
document.addEventListener('pointerdown', (evento) => {
    if (contenedorBuscador && !contenedorBuscador.contains(evento.target)) cerrarSugerencias();
});

btnAnadir?.addEventListener('click', anadirSintoma);

// ----- Botones del formulario -----

btnCancelar?.addEventListener('click', () => finalizarConsulta(destinoCancelar));

formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    
    if (!pacienteActual) {
        mostrarAviso('No hay un paciente seleccionado para esta consulta.', 'error');
        return;
    }
    
    // Un síntoma elegido pero sin añadir se perdería en silencio: se avisa
    if (sintomaPendiente) {
        mostrarAviso(`Presiona "Añadir" para agregar «${sintomaPendiente.nombre}» o borra el texto.`, 'error');
        buscador.focus();
        return;
    }
    
    // Limpia espacios al inicio y al final
    formulario.querySelectorAll('input[type="text"], textarea')
        .forEach(campo => { campo.value = campo.value.trim(); });
    
    if (!formulario.reportValidity()) return;
    
    // El cuadro del buscador no tiene "name", así que FormData solo trae observaciones y los demás campos
    const datos = Object.fromEntries(new FormData(formulario));
    const sintomas = [...elegidos.keys()];
    
    if (sintomas.length === 0 && !datos.observaciones) {
        mostrarAviso('Añade al menos un síntoma o escribe una observación.', 'error');
        return;
    }
    
    btnGuardar.disabled = true;        // evita guardar dos veces con doble clic
    
    try {
        const resultado = await crearConsulta({ pacienteId: pacienteActual.id, sintomas, ...datos });
        
        if (resultado.success) {
            finalizarConsulta(destinoGuardar);
            mostrarAviso('Consulta guardada correctamente.', 'exito');
        } else {
            mostrarAviso(resultado.message ?? 'No se pudo guardar la consulta.', 'error');
        }
    } catch (error) {
        console.error('Error al guardar la consulta:', error);
        mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
    } finally {
        btnGuardar.disabled = false;
    }
});
