// Barra de búsqueda de pacientes: busca mientras se escribe y muestra los resultados en una tabla.
// Cada fila ofrece tres acciones: editar los datos (lápiz), ver el historial y crear una consulta nueva.
import { buscarPacientes } from './pacientesServicio.js';
import { mostrarVista, marcarBoton, irAlInicio } from './vistas.js';
import { abrirHistorial } from './historial.js';
import { abrirConsulta } from './consulta.js';
import { abrirEdicion } from './editarPaciente.js';
import { calcularEdad } from './utilidades.js';

const MIN_CARACTERES = 2;      // no busca con menos letras
const ESPERA_MS = 300;         // espera a que la persona deje de escribir

const formBusqueda = document.querySelector('.formulario-busqueda');
const inputBusqueda = document.getElementById('campo-busqueda');
const btnLimpiar = document.getElementById('btn-limpiar-busqueda');
const vistaResultados = document.getElementById('vista-resultados');
const cuerpoTabla = document.getElementById('resultados-pacientes');
const resumen = document.getElementById('resumen-busqueda');

let temporizador = null;
let numeroBusqueda = 0;        // identifica la búsqueda más reciente para descartar respuestas viejas
const pacientesEnTabla = new Map();   // id -> paciente de cada fila (para actualizarlos tras editar)

function crearBoton(texto, clase, alHacerClic) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `boton-tabla ${clase}`.trim();
    boton.textContent = texto;
    boton.addEventListener('click', alHacerClic);
    return boton;
}

// Botón de solo ícono (lápiz) para editar los datos del paciente
function crearBotonEditar(paciente) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton-tabla boton-tabla--icono';
    boton.title = `Editar datos de ${paciente.nombre} ${paciente.apellidos}`;
    boton.setAttribute('aria-label', boton.title);
    boton.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>`;                              // innerHTML aquí es seguro: el SVG es fijo, no trae datos del paciente
    boton.addEventListener('click', () => abrirEdicion(paciente));
    return boton;
}

function crearFila(paciente) {
    const fila = document.createElement('tr');
    fila.dataset.id = paciente.id;
    pacientesEnTabla.set(paciente.id, paciente);
    
    const valores = [
        `${paciente.nombre} ${paciente.apellidos}`,
        paciente.curp
    ];
    
    valores.forEach(valor => {
        const celda = document.createElement('td');
        celda.textContent = valor;          // textContent y no innerHTML: evita inyección de código si los datos vienen de una BD
        fila.appendChild(celda);
    });
    
    // Acciones sobre este paciente (ya está registrado: no hace falta darlo de alta otra vez)
    const celdaAcciones = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'acciones-tabla';
    
    acciones.append(
        crearBotonEditar(paciente),
        crearBoton('Historial', '', () => abrirHistorial(paciente)),
        crearBoton('Nueva consulta', 'boton-tabla--principal', () => abrirConsulta(paciente, {
            botonActivo: null,
            alGuardar: () => abrirHistorial(paciente),                 // al guardar se ve la consulta en su historial
            alCancelar: () => mostrarVista('vista-resultados')         // al cancelar se regresa a los resultados
        }))
    );
    
    celdaAcciones.appendChild(acciones);
    fila.appendChild(celdaAcciones);
    
    return fila;
}

function mostrarResultados({ total, resultados }) {
    pacientesEnTabla.clear();
    cuerpoTabla.replaceChildren(...resultados.map(crearFila));
    
    if (total === 0) {
        resumen.textContent = 'No se encontraron pacientes.';
    } else if (total > resultados.length) {
        resumen.textContent = `Mostrando ${resultados.length} de ${total} pacientes. Escribe más para afinar la búsqueda.`;
    } else {
        resumen.textContent = `${total} paciente${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.`;
    }
}

async function ejecutarBusqueda(termino) {
    const miBusqueda = ++numeroBusqueda;
    
    marcarBoton(null);                      // ningún botón del menú corresponde a esta vista
    mostrarVista('vista-resultados');
    resumen.textContent = 'Buscando...';
    
    try {
        const respuesta = await buscarPacientes(termino);
        if (miBusqueda !== numeroBusqueda) return;     // ya hay una búsqueda más nueva
        mostrarResultados(respuesta);
    } catch (error) {
        if (miBusqueda !== numeroBusqueda) return;
        console.error('Error al buscar pacientes:', error);
        cuerpoTabla.replaceChildren();
        resumen.textContent = 'No se pudo completar la búsqueda. Intenta de nuevo.';
    }
}

// Búsqueda mientras se escribe (con espera)
inputBusqueda?.addEventListener('input', () => {
    btnLimpiar.hidden = inputBusqueda.value === '';   // la X solo aparece si hay texto
    clearTimeout(temporizador);
    const termino = inputBusqueda.value.trim();
    
    if (termino.length < MIN_CARACTERES) {
        numeroBusqueda++;                   // cancela cualquier búsqueda pendiente
        if (termino === '' && vistaResultados?.classList.contains('activa')) irAlInicio();
        return;
    }
    
    temporizador = setTimeout(() => ejecutarBusqueda(termino), ESPERA_MS);
});

// Enter: busca de inmediato
formBusqueda?.addEventListener('submit', (evento) => {
    evento.preventDefault();               // evita recargar la página
    clearTimeout(temporizador);
    
    const termino = inputBusqueda?.value.trim() ?? '';
    if (termino.length >= MIN_CARACTERES) ejecutarBusqueda(termino);
});

// X: borra lo escrito y regresa al inicio si estaba en los resultados
btnLimpiar?.addEventListener('click', () => {
    inputBusqueda.value = '';
    inputBusqueda.dispatchEvent(new Event('input'));   // reutiliza la lógica de arriba (cancela y oculta la X)
    inputBusqueda.focus();
});

// Si se editó un paciente que está en la tabla, se actualiza su fila y los datos que usan sus botones
document.addEventListener('paciente-actualizado', ({ detail: actualizado }) => {
    const paciente = pacientesEnTabla.get(actualizado.id);
    if (!paciente) return;
    
    Object.assign(paciente, actualizado);  // "Historial" y "Nueva consulta" ya abren con los datos nuevos
    const fila = cuerpoTabla.querySelector(`tr[data-id="${actualizado.id}"]`);
    if (fila) {
        fila.cells[0].textContent = `${actualizado.nombre} ${actualizado.apellidos}`;
        fila.cells[1].textContent = actualizado.curp;
    }
});
