// Formulario de consulta: se abre solo, justo después de guardar un paciente nuevo
// (o desde la tabla de resultados y el historial).
// Se guarda: enfermedad (obligatoria), peso, altura y notas (estos tres opcionales). La edad, la fecha y la llave las pone el servicio.
// Los síntomas NO se guardan en la consulta: sirven para sugerir la enfermedad (tabla EnfermedadesDetalle).
// Se buscan escribiendo, se elige uno de la lista y se presiona "Añadir"; con cada síntoma añadido
// se actualizan las enfermedades sugeridas, y al hacer clic en una queda elegida en el cuadro de Enfermedad.
// Ese cuadro también se escribe: la lista propone las enfermedades que coinciden, igual que con los síntomas.

import { mostrarVista, marcarBoton, irAlInicio } from './vistas.js';
import { crearConsulta } from '../servicios/consultasServicio.js';
import { obtenerSintomas } from '../servicios/sintomasServicio.js';
import { obtenerEnfermedades, sugerirEnfermedades } from '../servicios/enfermedadesServicio.js';
import { mostrarAviso } from './avisos.js';
import { calcularEdad } from '../utilidades.js';

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
const contenedorEnfermedad = document.getElementById('consulta-buscador-enfermedad');
const buscadorEnfermedad = document.getElementById('consulta-enfermedad');
const listaEnfermedades = document.getElementById('consulta-sugerencias-enfermedad');
const estadoEnfermedad = document.getElementById('consulta-estado-enfermedad');
const contenedorSugeridas = document.getElementById('enfermedades-sugeridas');
const btnGuardar = document.getElementById('btn-guardar-consulta');
const btnCancelar = document.getElementById('btn-cancelar-consulta');

let pacienteActual = null;
let destinoGuardar = irAlInicio;      // a dónde se vuelve al guardar la consulta
let destinoCancelar = irAlInicio;     // a dónde se vuelve al cancelar
let catalogo = [];                    // [ { id, nombre } ]
let catalogoCargado = false;
let cargandoCatalogo = false;
let enfermedadesCargadas = false;
let cargandoEnfermedades = false;
let enfermedades = [];                // [ { id, nombre, descripcion } ]
let enfermedadElegida = null;         // la elegida de la lista (null = todavía ninguna)
let enfermedadesCoincidentes = [];    // coincidencias que se muestran ahora
let indiceEnfermedad = -1;            // opción resaltada con las flechas
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

// El catálogo de enfermedades se pide la primera vez que se abre la consulta
async function cargarEnfermedades() {
    if (enfermedadesCargadas || cargandoEnfermedades) return;
    cargandoEnfermedades = true;

    buscadorEnfermedad.disabled = true;
    buscadorEnfermedad.placeholder = 'Cargando enfermedades...';

    try {
        enfermedades = await obtenerEnfermedades();
        enfermedadesCargadas = true;
        buscadorEnfermedad.placeholder = 'Escribe una enfermedad, por ejemplo: dengue';
        buscadorEnfermedad.disabled = false;
    } catch (error) {
        console.error('Error al cargar las enfermedades:', error);
        buscadorEnfermedad.placeholder = 'No se pudo cargar el catálogo de enfermedades';
        mostrarAviso('No se pudo cargar el catálogo de enfermedades. Sin el catálogo no se puede guardar la consulta.', 'error');
    } finally {
        cargandoEnfermedades = false;
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

            opcion.append(nombre);
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

// ----- Enfermedad: se escribe y la lista propone coincidencias (igual que los síntomas) -----

// Enfermedades que contienen el texto escrito (las que empiezan con él, primero)
function buscarEnfermedades(texto) {
    const buscado = normalizar(texto);
    if (buscado === '') return [];

    return enfermedades
        .filter(e => normalizar(e.nombre).includes(buscado))
        .sort((a, b) =>
            Number(!normalizar(a.nombre).startsWith(buscado)) - Number(!normalizar(b.nombre).startsWith(buscado)))
        .slice(0, MAX_SUGERENCIAS);
}

function cerrarListaEnfermedades() {
    listaEnfermedades.hidden = true;
    buscadorEnfermedad.setAttribute('aria-expanded', 'false');
    buscadorEnfermedad.removeAttribute('aria-activedescendant');
    indiceEnfermedad = -1;
}

// Texto de apoyo debajo del cuadro: qué quedó elegido
function actualizarEstadoEnfermedad() {
    if (enfermedadElegida) {
        estadoEnfermedad.textContent = `Enfermedad elegida: ${enfermedadElegida.nombre}`;
    } else if (buscadorEnfermedad.value.trim() !== '') {
        estadoEnfermedad.textContent = 'Elige una enfermedad de la lista';
    } else {
        estadoEnfermedad.textContent = 'Elige una enfermedad de la lista';
    }
}

function dibujarListaEnfermedades() {
    listaEnfermedades.replaceChildren();
    indiceEnfermedad = -1;
    buscadorEnfermedad.removeAttribute('aria-activedescendant');

    if (normalizar(buscadorEnfermedad.value) === '' || enfermedadElegida) {
        cerrarListaEnfermedades();
        return;
    }

    enfermedadesCoincidentes = buscarEnfermedades(buscadorEnfermedad.value);

    if (enfermedadesCoincidentes.length === 0) {
        const vacio = document.createElement('li');
        vacio.className = 'sugerencia-vacia';
        vacio.textContent = 'No se encontraron enfermedades con ese nombre.';
        listaEnfermedades.appendChild(vacio);
    } else {
        enfermedadesCoincidentes.forEach((enfermedad, i) => {
            const opcion = document.createElement('li');
            opcion.id = `sugerencia-enfermedad-${i}`;
            opcion.dataset.indice = i;
            opcion.setAttribute('role', 'option');
            opcion.setAttribute('aria-selected', 'false');
            opcion.textContent = enfermedad.nombre;
            listaEnfermedades.appendChild(opcion);
        });
    }

    listaEnfermedades.hidden = false;
    buscadorEnfermedad.setAttribute('aria-expanded', 'true');
}

// Resalta una opción con las flechas del teclado (da la vuelta al llegar al final)
function resaltarEnfermedad(indice) {
    const opciones = listaEnfermedades.querySelectorAll('[role="option"]');
    if (opciones.length === 0) return;

    indiceEnfermedad = (indice + opciones.length) % opciones.length;
    opciones.forEach((opcion, i) => opcion.setAttribute('aria-selected', String(i === indiceEnfermedad)));

    const activa = opciones[indiceEnfermedad];
    buscadorEnfermedad.setAttribute('aria-activedescendant', activa.id);
    activa.scrollIntoView({ block: 'nearest' });
}

// Elegir una enfermedad (de la lista o de las sugeridas por síntomas); null = sin diagnóstico
function elegirEnfermedad(enfermedad) {
    enfermedadElegida = enfermedad;
    buscadorEnfermedad.value = enfermedad ? enfermedad.nombre : '';
    cerrarListaEnfermedades();
    actualizarEstadoEnfermedad();
    marcarSugeridaElegida();
}

function reiniciarEnfermedad() {
    elegirEnfermedad(null);
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
        boton.setAttribute('aria-pressed', String(enfermedadElegida?.id === e.id));
        boton.textContent = `${e.nombre} · ${e.coincidencias} de ${e.total}`;
        boton.title = `Tiene ${e.coincidencias} de los ${e.total} síntomas registrados de ${e.nombre}`;
        boton.addEventListener('click', () => {
            elegirEnfermedad(enfermedades.find(x => x.id === e.id) ?? { id: e.id, nombre: e.nombre });
        });
        return boton;
    });

    contenedorSugeridas.replaceChildren(titulo, ...botones);
    contenedorSugeridas.hidden = false;
}

// Resalta la sugerencia que coincide con la enfermedad elegida
function marcarSugeridaElegida() {
    contenedorSugeridas.querySelectorAll('.chip-enfermedad').forEach(boton => {
        boton.setAttribute('aria-pressed', String(boton.dataset.id === String(enfermedadElegida?.id)));
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
    reiniciarEnfermedad();
    marcarBoton(botonActivo);
    mostrarVista('vista-consulta');
    cargarCatalogo();
    cargarEnfermedades();
}

// Limpia el formulario y continúa hacia el destino indicado
function finalizarConsulta(destino) {
    formulario.reset();
    reiniciarSintomas();
    reiniciarEnfermedad();
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

// ----- Eventos del cuadro de enfermedad -----

buscadorEnfermedad?.addEventListener('input', () => {
    // Si se edita el texto, lo que estaba elegido deja de valer
    enfermedadElegida = null;

    // Si escribió el nombre completo sin tocar la lista, también cuenta como elegido
    const exacta = enfermedades.find(e => normalizar(e.nombre) === normalizar(buscadorEnfermedad.value));
    if (exacta) enfermedadElegida = exacta;

    actualizarEstadoEnfermedad();
    marcarSugeridaElegida();
    dibujarListaEnfermedades();
});

buscadorEnfermedad?.addEventListener('focus', () => {
    if (!enfermedadElegida && normalizar(buscadorEnfermedad.value) !== '') dibujarListaEnfermedades();
});

buscadorEnfermedad?.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
        if (listaEnfermedades.hidden) dibujarListaEnfermedades();

        const total = enfermedadesCoincidentes.length;
        if (!listaEnfermedades.hidden && total > 0) {
            evento.preventDefault();
            const siguiente = evento.key === 'ArrowDown'
                ? indiceEnfermedad + 1
                : (indiceEnfermedad === -1 ? total - 1 : indiceEnfermedad - 1);
            resaltarEnfermedad(siguiente);
        }
        return;
    }

    if (evento.key === 'Enter') {
        evento.preventDefault();       // Enter nunca envía el formulario desde este campo

        const candidato = indiceEnfermedad >= 0
            ? enfermedadesCoincidentes[indiceEnfermedad]
            : (enfermedadesCoincidentes.length === 1 ? enfermedadesCoincidentes[0] : null);

        if (!listaEnfermedades.hidden && candidato) elegirEnfermedad(candidato);
        return;
    }

    if (evento.key === 'Escape' && !listaEnfermedades.hidden) {
        cerrarListaEnfermedades();
        return;
    }

    if (evento.key === 'Tab') cerrarListaEnfermedades();
});

// Clic en una opción: el cuadro no pierde el foco (por eso pointerdown y preventDefault)
listaEnfermedades?.addEventListener('pointerdown', (evento) => {
    const opcion = evento.target.closest('[role="option"]');
    if (!opcion) return;

    evento.preventDefault();
    elegirEnfermedad(enfermedadesCoincidentes[Number(opcion.dataset.indice)]);
});

// Clic fuera del cuadro: se cierra la lista
document.addEventListener('pointerdown', (evento) => {
    if (contenedorEnfermedad && !contenedorEnfermedad.contains(evento.target)) cerrarListaEnfermedades();
});

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

    // Peso y altura son opcionales; si se escriben, el HTML revisa min/max
    if (!formulario.reportValidity()) return;

    // La enfermedad es obligatoria y debe ser una de la lista: no se adivina cuál quiso decir
    if (!enfermedadElegida) {
        mostrarAviso('Elige una enfermedad de la lista para guardar la consulta.', 'error');
        buscadorEnfermedad.focus();
        return;
    }

    // El buscador de síntomas no tiene "name": FormData solo trae peso, altura y notas
    const datos = Object.fromEntries(new FormData(formulario));

    btnGuardar.disabled = true;        // evita guardar dos veces con doble clic

    try {
        const resultado = await crearConsulta({
            pacienteId: pacienteActual.id,
            enfermedadId: enfermedadElegida.id,
            peso: datos.peso === '' ? null : Number(datos.peso),
            altura: datos.altura === '' ? null : Number(datos.altura),
            notas: datos.notas
        });

        if (resultado.success) {
            finalizarConsulta(destinoGuardar);
            mostrarAviso(`Consulta guardada. Llave para el paciente: ${resultado.llave}`, 'exito');
        } else {
            mostrarAviso(resultado.message ?? 'No se pudo guardar la consulta.', 'error');
            if (resultado.campo) (resultado.campo === 'enfermedad' ? buscadorEnfermedad : formulario.elements[resultado.campo])?.focus();
        }
    } catch (error) {
        console.error('Error al guardar la consulta:', error);
        mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
    } finally {
        btnGuardar.disabled = false;
    }
});
