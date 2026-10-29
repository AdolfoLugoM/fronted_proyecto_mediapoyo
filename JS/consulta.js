// Formulario de consulta: se abre solo, justo después de guardar un paciente nuevo
// (o desde la tabla de resultados y el historial).
// Se guarda: enfermedad (opcional), peso, altura y notas. La edad, la fecha y la llave las pone el servicio.
// Los síntomas NO se guardan en la consulta: sirven para sugerir la enfermedad (tabla EnfermedadesDetalle).
// Se buscan escribiendo, se elige uno de la lista y se presiona "Añadir"; con cada síntoma añadido
// se actualizan las enfermedades sugeridas, y al hacer clic en una queda elegida en el selector.

import { mostrarVista, marcarBoton, irAlInicio } from './vistas.js';
import { crearConsulta } from './consultasServicio.js';
import { obtenerSintomas } from './sintomasServicio.js';
import { obtenerEnfermedades, sugerirEnfermedades } from './enfermedadesServicio.js';
import { mostrarAviso } from './avisos.js';
import { calcularEdad } from './utilidades.js';

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
const selectEnfermedad = document.getElementById('consulta-enfermedad');
const contenedorSugeridas = document.getElementById('enfermedades-sugeridas');
const btnGuardar = document.getElementById('btn-guardar-consulta');
const btnCancelar = document.getElementById('btn-cancelar-consulta');

let pacienteActual = null;
let destinoGuardar = irAlInicio;      // a dónde se vuelve al guardar la consulta
let destinoCancelar = irAlInicio;     // a dónde se vuelve al cancelar
let catalogo = [];                    // [ { id, nombre, categoria } ]
let catalogoCargado = false;
let cargandoCatalogo = false;
let enfermedadesCargadas = false;
let numeroSugerencia = 0;             // descarta sugerencias viejas si se añaden síntomas muy rápido

const elegidos = new Map();           // id -> síntoma, en el orden en que se añadieron
let sintomaPendiente = null;          // síntoma elegido de la lista que todavía no se ha añadido
let sugerencias = [];                 // coincidencias que se muestran ahora
let indiceActivo = -1;                // opción resaltada con las flechas

// Quita acentos y mayúsculas: "oido" encuentra "Dolor de oído"
const normalizar = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ----- Catálogos -----

// El catálogo de síntomas se pide la primera vez que se abre la consulta
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
        mostrarAviso('No se pudo cargar el catálogo de síntomas. Aún puedes elegir la enfermedad de la lista.', 'error');
    } finally {
        cargandoCatalogo = false;
    }
}

// Las enfermedades se ponen como opciones del selector (una sola vez)
async function cargarEnfermedades() {
    if (enfermedadesCargadas) return;

    try {
        const enfermedades = await obtenerEnfermedades();
        selectEnfermedad.append(...enfermedades.map(e => new Option(e.nombre, e.id)));
        enfermedadesCargadas = true;
    } catch (error) {
        console.error('Error al cargar las enfermedades:', error);
        mostrarAviso('No se pudo cargar el catálogo de enfermedades.', 'error');
    }
}

// ----- Lista de sugerencias de síntomas -----

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

    dibujarEnfermedadesSugeridas();     // cada cambio en los síntomas cambia las sugerencias
}

function reiniciarSintomas() {
    elegidos.clear();
    sintomaPendiente = null;
    buscador.value = '';
    btnAnadir.hidden = true;
    cerrarSugerencias();
    dibujarElegidos();
}

// ----- Enfermedades sugeridas a partir de los síntomas -----

async function dibujarEnfermedadesSugeridas() {
    const miSugerencia = ++numeroSugerencia;

    if (elegidos.size === 0) {
        contenedorSugeridas.hidden = true;
        contenedorSugeridas.replaceChildren();
        return;
    }

    let sugeridas = [];
    try {
        sugeridas = await sugerirEnfermedades([...elegidos.keys()]);
    } catch (error) {
        console.error('Error al sugerir enfermedades:', error);
    }
    if (miSugerencia !== numeroSugerencia) return;     // ya hay una petición más nueva

    const titulo = document.createElement('p');
    titulo.className = 'sugeridas-titulo';
    titulo.textContent = sugeridas.length === 0
        ? 'Ninguna enfermedad del catálogo tiene estos síntomas. Elígela en la lista si la conoces.'
        : 'Enfermedades con estos síntomas (haz clic para elegirla):';

    const botones = sugeridas.map(e => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'chip-enfermedad';
        boton.dataset.id = e.id;
        boton.setAttribute('aria-pressed', String(selectEnfermedad.value === String(e.id)));
        boton.textContent = `${e.nombre} · ${e.coincidencias} de ${e.total}`;
        boton.title = `Tiene ${e.coincidencias} de los ${e.total} síntomas registrados de ${e.nombre}`;
        boton.addEventListener('click', () => {
            selectEnfermedad.value = String(e.id);
            marcarSugeridaElegida();
        });
        return boton;
    });

    contenedorSugeridas.replaceChildren(titulo, ...botones);
    contenedorSugeridas.hidden = false;
}

// Resalta la sugerencia que coincide con lo elegido en el selector
function marcarSugeridaElegida() {
    contenedorSugeridas.querySelectorAll('.chip-enfermedad').forEach(boton => {
        boton.setAttribute('aria-pressed', String(boton.dataset.id === selectEnfermedad.value));
    });
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

    const edad = calcularEdad(paciente.fechaNacimiento);
    nombrePaciente.textContent = `${paciente.nombre} ${paciente.apellidos}`;
    detallePaciente.textContent = [`CURP: ${paciente.curp}`, edad !== null ? `${edad} años` : null]
        .filter(Boolean).join(' · ');
    mostrarNotas(paciente);

    formulario.reset();
    reiniciarSintomas();
    marcarBoton(botonActivo);
    mostrarVista('vista-consulta');
    cargarCatalogo();
    cargarEnfermedades();
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

// Si se cambia la enfermedad a mano en el selector, se actualiza cuál sugerencia queda resaltada
selectEnfermedad?.addEventListener('change', marcarSugeridaElegida);

// ----- Botones del formulario -----

btnCancelar?.addEventListener('click', () => finalizarConsulta(destinoCancelar));

formulario?.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (!pacienteActual) {
        mostrarAviso('No hay un paciente seleccionado para esta consulta.', 'error');
        return;
    }

    // Limpia espacios al inicio y al final (el buscador de síntomas no se guarda, pero tampoco estorba)
    formulario.querySelectorAll('textarea').forEach(campo => { campo.value = campo.value.trim(); });

    // Peso y altura son obligatorios y tienen min/max en el HTML
    if (!formulario.reportValidity()) return;

    // El buscador de síntomas no tiene "name": FormData solo trae peso, altura, enfermedad y notas
    const datos = Object.fromEntries(new FormData(formulario));

    btnGuardar.disabled = true;        // evita guardar dos veces con doble clic

    try {
        const resultado = await crearConsulta({
            pacienteId: pacienteActual.id,
            enfermedadId: datos.enfermedad === '' ? null : Number(datos.enfermedad),
            peso: Number(datos.peso),
            altura: Number(datos.altura),
            notas: datos.notas
        });

        if (resultado.success) {
            finalizarConsulta(destinoGuardar);
            mostrarAviso(`Consulta guardada. Llave para el paciente: ${resultado.llave}`, 'exito');
        } else {
            mostrarAviso(resultado.message ?? 'No se pudo guardar la consulta.', 'error');
            if (resultado.campo) formulario.elements[resultado.campo]?.focus();
        }
    } catch (error) {
        console.error('Error al guardar la consulta:', error);
        mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
    } finally {
        btnGuardar.disabled = false;
    }
});
