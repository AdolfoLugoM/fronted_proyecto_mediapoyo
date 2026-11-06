import { mostrarVista, marcarBoton } from './vistas.js';
import { obtenerEnfermedadesConSintomas, obtenerSintomasDeEnfermedad } from '../servicios/enfermedadesServicio.js';
import { obtenerSintomas } from '../servicios/sintomasServicio.js';
import { USAR_API } from '../config.js';

const boton = document.getElementById('boton4');
const buscador = document.getElementById('buscador-enfermedad');
const contador = document.getElementById('contador-enfermedades');
const lista = document.getElementById('lista-enfermedades');
const detalle = document.getElementById('detalle-enfermedad');

let enfermedades = [];                 // [ { id, nombre, descripcion, sintomaIds } ] (con el backend sintomaIds es null)
const sintomasCargados = new Map();    // con el backend: enfermedadId -> sus síntomas, pedidos al elegirla
const cargando = new Set();            // enfermedades cuyos síntomas se están pidiendo ahora
let sintomasPorId = new Map();         // id -> { id, nombre, categoria }
let seleccionadaId = null;
let cargado = false;

// Minúsculas y sin acentos, para que "respiratoria" encuentre "respiratória" y no importen las mayúsculas
const normalizar = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function sintomasDe(enfermedad) {
    if (!enfermedad.sintomaIds) return sintomasCargados.get(enfermedad.id) ?? [];
    return enfermedad.sintomaIds.map(id => sintomasPorId.get(id)).filter(Boolean);
}

// Con el backend solo se conocen los síntomas de las enfermedades ya elegidas: el filtro mira solo los nombres
function coincide(enfermedad, consulta) {
    if (consulta === '') return true;
    const textos = [enfermedad.nombre, ...(enfermedad.sintomaIds ? sintomasDe(enfermedad).map(s => s.nombre) : [])];
    return textos.some(t => normalizar(t).includes(consulta));
}

function dibujarLista() {
    const consulta = normalizar(buscador.value);
    const visibles = enfermedades.filter(e => coincide(e, consulta));
    
    lista.replaceChildren();
    contador.textContent = visibles.length === 0
        ? 'Ninguna enfermedad coincide con la búsqueda'
        : `${visibles.length} de ${enfermedades.length} enfermedades`;
    
    for (const enfermedad of visibles) {
        const item = document.createElement('li');
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'item-enfermedad';
        boton.setAttribute('aria-pressed', String(enfermedad.id === seleccionadaId));
        
        const nombre = document.createElement('span');
        nombre.textContent = enfermedad.nombre;
        boton.append(nombre);
        if (enfermedad.sintomaIds) {
            const cantidad = document.createElement('small');
            cantidad.textContent = `${enfermedad.sintomaIds.length} síntomas`;
            boton.append(cantidad);
        }
        boton.addEventListener('click', () => seleccionar(enfermedad.id));
        item.append(boton);
        lista.append(item);
    }
}

function dibujarDetalle() {
    const enfermedad = enfermedades.find(e => e.id === seleccionadaId);
    detalle.replaceChildren();
    
    if (!enfermedad) {
        const vacio = document.createElement('p');
        vacio.className = 'detalle-vacio';
        vacio.textContent = 'Elige una enfermedad de la lista para ver su descripción y sus síntomas.';
        detalle.append(vacio);
        return;
    }
    
    const titulo = document.createElement('h2');
    titulo.textContent = enfermedad.nombre;
    
    const descripcion = document.createElement('p');
    descripcion.className = 'detalle-descripcion';
    descripcion.textContent = enfermedad.descripcion || 'Sin descripción registrada.';
    
    const subtitulo = document.createElement('h3');
    subtitulo.textContent = 'Síntomas';
    
    detalle.append(titulo, descripcion, subtitulo);
    
    // Los síntomas que coinciden con el texto buscado se resaltan
    const consulta = normalizar(buscador.value);
    const sintomas = sintomasDe(enfermedad);

    if (cargando.has(enfermedad.id)) {
        const espera = document.createElement('p');
        espera.className = 'detalle-vacio';
        espera.textContent = 'Cargando síntomas…';
        detalle.append(espera);
        return;
    }

    if (sintomas.length === 0) {
        const nada = document.createElement('p');
        nada.className = 'detalle-vacio';
        nada.textContent = 'Esta enfermedad no tiene síntomas registrados.';
        detalle.append(nada);
        return;
    }
    
    const chips = document.createElement('div');
    chips.className = 'sintomas-enfermedad';
    for (const sintoma of sintomas) {
        const chip = document.createElement('span');
        chip.className = 'chip-sintoma-detalle';
        chip.textContent = sintoma.nombre;
        if (consulta !== '' && normalizar(sintoma.nombre).includes(consulta)) chip.classList.add('resaltado');
        chips.append(chip);
    }
    detalle.append(chips);
}

// Con el backend, los síntomas de una enfermedad se piden la primera vez que se elige
async function cargarSintomasDe(enfermedad) {
    if (enfermedad.sintomaIds || sintomasCargados.has(enfermedad.id) || cargando.has(enfermedad.id)) return;

    cargando.add(enfermedad.id);
    try {
        sintomasCargados.set(enfermedad.id, (await obtenerSintomasDeEnfermedad(enfermedad.id)) ?? []);
    } catch (error) {
        console.error('No se pudieron cargar los síntomas de la enfermedad', error);
    } finally {
        cargando.delete(enfermedad.id);
        if (seleccionadaId === enfermedad.id) dibujarDetalle();
    }
}

function seleccionar(id) {
    seleccionadaId = id;
    dibujarLista();       // para que se marque la elegida
    dibujarDetalle();

    const enfermedad = enfermedades.find(e => e.id === id);
    if (enfermedad) {
        cargando.has(id) || cargarSintomasDe(enfermedad);
        if (!enfermedad.sintomaIds && !sintomasCargados.has(id)) dibujarDetalle();     // muestra "Cargando síntomas…"
    }
}

async function cargar() {
    if (cargado) return;
    contador.textContent = 'Cargando enfermedades…';
    try {
        const [listaEnfermedades, catalogoSintomas] = await Promise.all([
            obtenerEnfermedadesConSintomas(),
            USAR_API ? [] : obtenerSintomas()          // con el backend los nombres llegan con cada enfermedad
        ]);
        enfermedades = listaEnfermedades;
        sintomasPorId = new Map(catalogoSintomas.map(s => [s.id, s]));
        cargado = true;
        dibujarLista();
    } catch (error) {
        console.error('No se pudo cargar el catálogo de enfermedades', error);
        contador.textContent = 'No se pudo cargar el catálogo de enfermedades. Intenta de nuevo.';
    }
}

if (USAR_API) {
    // Con el backend se filtra por nombre de enfermedad (sus síntomas se ven al elegirla)
    buscador.placeholder = 'Filtrar enfermedades...';
    const etiqueta = document.getElementById('etiqueta-buscador-enfermedad');
    if (etiqueta) etiqueta.textContent = 'Filtrar enfermedades';
}

boton?.addEventListener('click', () => {
    marcarBoton(boton);
    mostrarVista('vista-buscar-enfermedad');
    cargar();
});

buscador?.addEventListener('input', () => {
    dibujarLista();
    if (seleccionadaId !== null) dibujarDetalle();
});