// Gestión de citas: calendario (FullCalendar) con la agenda del consultorio del médico en sesión.
// FullCalendar se carga con un <script> clásico en index.html (antes de main.js).
//
// La misma ventana sirve para tres cosas:
//   - crear:  clic en un día u hora libre        -> CURP del paciente + hora       (Cancelar / Agendar)
//   - editar: clic en una cita que no ha pasado  -> fecha + hora                  (Eliminar / Cancelar / Guardar)
//   - ver:    clic en una cita que ya pasó       -> solo los datos, sin cambiarlos (Cerrar)
// Eliminar pide confirmación en una segunda ventana.

import { mostrarVista, marcarBoton } from './vistas.js';
import {
    obtenerCitas, crearCita, actualizarCita, eliminarCita,
    DURACION_CITA_MIN, HORA_APERTURA, HORA_CIERRE
} from './citasServicio.js';

const PATRON_CURP = '[A-Z]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]';

const boton = document.getElementById('boton5');
const contenedor = document.getElementById('calendario');
const aviso = document.getElementById('mensaje-citas');

// Ventana de la cita
const modal = document.getElementById('modal-cita');
const formulario = document.getElementById('formulario-cita');
const titulo = document.getElementById('cita-titulo');
const textoFecha = document.getElementById('cita-fecha-texto');
const textoPaciente = document.getElementById('cita-paciente-texto');
const grupoCurp = document.getElementById('cita-grupo-curp');
const campoCurp = document.getElementById('cita-curp');
const grupoFecha = document.getElementById('cita-grupo-fecha');
const campoFecha = document.getElementById('cita-fecha');
const campoHora = document.getElementById('cita-hora');
const mensajeError = document.getElementById('cita-error');
const btnEliminar = document.getElementById('btn-eliminar-cita');
const btnCancelar = document.getElementById('btn-cancelar-cita');
const btnGuardar = document.getElementById('btn-agendar-cita');

// Ventana de confirmación para eliminar
const modalEliminar = document.getElementById('modal-eliminar-cita');
const textoEliminar = document.getElementById('eliminar-cita-texto');
const btnNoEliminar = document.getElementById('btn-no-eliminar-cita');
const btnSiEliminar = document.getElementById('btn-si-eliminar-cita');

let calendario = null;
let modo = 'crear';                    // 'crear' | 'editar' | 'ver'
let fechaElegida = null;               // 'AAAA-MM-DD' del día donde se hizo clic (modo crear)
let citaActual = null;                 // { id, inicio, paciente } de la cita abierta (modo editar / ver)
let guardando = false;
let temporizadorAviso = null;

// ----- Utilidades de fecha (siempre en hora local, sin pasar por UTC) -----
const dosDigitos = (n) => String(n).padStart(2, '0');
const aFechaISO = (d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
const aHora = (d) => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

// Última hora en la que puede EMPEZAR una cita (19:30 si cierra a las 20:00 y dura 30 min)
function ultimaHoraDeInicio() {
    const [h, m] = HORA_CIERRE.split(':').map(Number);
    const minutos = h * 60 + m - DURACION_CITA_MIN;
    return `${dosDigitos(Math.floor(minutos / 60))}:${dosDigitos(minutos % 60)}`;
}

function inicioDeHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return hoy;
}

function fechaLarga(fechaISO) {
    const [anio, mes, dia] = fechaISO.split('-').map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

const nombrePaciente = (paciente) => paciente ? `${paciente.nombre} ${paciente.apellidos}` : 'Paciente sin datos';

// Aviso temporal sobre el calendario
function mostrarAviso(texto) {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 4000);
}

function mostrarError(texto) {
    mensajeError.textContent = texto;
    mensajeError.hidden = false;
}

// ----- Ventana de la cita -----

// Muestra u oculta lo que corresponde a cada modo.
// Los campos ocultos también se DESACTIVAN: así el navegador no los valida ni los manda.
function configurarModo(nuevoModo) {
    modo = nuevoModo;
    const crear = modo === 'crear';
    const editar = modo === 'editar';
    const ver = modo === 'ver';
    
    titulo.textContent = crear ? 'Nueva cita' : editar ? 'Editar cita' : 'Cita';
    
    grupoCurp.hidden = !crear;
    campoCurp.disabled = !crear;
    
    grupoFecha.hidden = !editar;
    campoFecha.disabled = !editar;
    
    campoHora.disabled = ver;
    textoPaciente.hidden = crear;
    
    btnEliminar.hidden = !editar;
    btnGuardar.hidden = ver;
    btnGuardar.textContent = crear ? 'Agendar' : 'Guardar';
    btnCancelar.textContent = ver ? 'Cerrar' : 'Cancelar';
}

function abrirModal(foco) {
    mensajeError.hidden = true;
    modal.classList.add('activo');
    foco?.focus();
}

function cerrarModal() {
    if (guardando) return;
    modal.classList.remove('activo');
    formulario.reset();
    citaActual = null;
}

/** Clic en un día u hora libre: agendar una cita nueva. */
function abrirNueva(fecha, hora = '') {
    formulario.reset();
    configurarModo('crear');
    
    fechaElegida = fecha;
    citaActual = null;
    textoFecha.textContent = fechaLarga(fecha);
    campoHora.value = hora;
    
    abrirModal(campoCurp);
}

/** Clic en una cita: editarla (o solo verla, si ya pasó). */
function abrirCita(evento) {
    const inicio = evento.start;
    const pasada = inicio < new Date();
    
    formulario.reset();
    configurarModo(pasada ? 'ver' : 'editar');
    
    citaActual = { id: evento.id, inicio, paciente: evento.extendedProps.paciente };
    fechaElegida = aFechaISO(inicio);
    
    textoFecha.textContent = fechaLarga(fechaElegida);
    const paciente = citaActual.paciente;
    textoPaciente.textContent = paciente
        ? `Paciente: ${nombrePaciente(paciente)} · CURP ${paciente.curp}`
        : 'Paciente sin datos';
    
    campoFecha.value = fechaElegida;
    campoFecha.min = aFechaISO(new Date());    // no se puede mover a un día que ya pasó
    campoHora.value = aHora(inicio);
    
    abrirModal(pasada ? btnCancelar : campoHora);
}

// ----- Confirmación para eliminar -----

function abrirConfirmacion() {
    if (!citaActual) return;
    textoEliminar.textContent =
        `${nombrePaciente(citaActual.paciente)} · ${fechaLarga(aFechaISO(citaActual.inicio))} a las ${aHora(citaActual.inicio)}. ` +
        'La cita dejará de aparecer en tu agenda.';
    modalEliminar.classList.add('activo');
    btnNoEliminar.focus();                     // el foco en la opción segura
}

function cerrarConfirmacion() {
    if (guardando) return;
    modalEliminar.classList.remove('activo');
    btnEliminar.focus();
}

async function confirmarEliminacion() {
    if (guardando || !citaActual) return;
    
    guardando = true;
    btnSiEliminar.disabled = true;
    btnNoEliminar.disabled = true;
    btnSiEliminar.textContent = 'Eliminando...';
    
    try {
        const resultado = await eliminarCita(citaActual.id);
        guardando = false;
        modalEliminar.classList.remove('activo');
        
        if (resultado.success) {
            cerrarModal();
            calendario?.refetchEvents();
            mostrarAviso('Cita eliminada.');
        } else {
            mostrarError(resultado.message ?? 'No se pudo eliminar la cita.');
        }
    } catch (error) {
        console.error('Error al eliminar la cita:', error);
        guardando = false;
        modalEliminar.classList.remove('activo');
        mostrarError('Ocurrió un problema al conectar con el servidor.');
    } finally {
        guardando = false;
        btnSiEliminar.disabled = false;
        btnNoEliminar.disabled = false;
        btnSiEliminar.textContent = 'Eliminar';
    }
}

// ----- Calendario -----
function iniciarCalendario() {
    if (calendario) return;
    
    if (typeof FullCalendar === 'undefined') {
        mostrarAviso('No se pudo cargar FullCalendar. Revisa tu conexión o la etiqueta <script> del index.');
        return;
    }
    
    calendario = new FullCalendar.Calendar(contenedor, {
        initialView: 'dayGridMonth',
        locale: 'es',
        firstDay: 1,                                   // la semana empieza en lunes
        height: 'auto',
        allDaySlot: false,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Agenda' },
        noEventsText: 'No hay citas para mostrar',
        slotMinTime: `${HORA_APERTURA}:00`,
        slotMaxTime: `${HORA_CIERRE}:00`,
        slotDuration: `00:${dosDigitos(DURACION_CITA_MIN)}:00`,
        slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        
        // Clic en un día (o en una hora, en la vista semanal): cita nueva
        dateClick(info) {
            const limite = info.allDay ? inicioDeHoy() : new Date();
            if (info.date < limite) {
                mostrarAviso('No puedes agendar en una fecha u hora que ya pasó.');
                return;
            }
            abrirNueva(aFechaISO(info.date), info.allDay ? '' : aHora(info.date));
        },
        
        // Clic en una cita: editarla, eliminarla o (si ya pasó) solo verla
        eventClick(info) {
            info.jsEvent.preventDefault();
            abrirCita(info.event);
        },
        
        // El calendario pide solo las citas del rango visible
        async events(info, exito, fallo) {
            try {
                const lista = await obtenerCitas({ desde: info.startStr, hasta: info.endStr });
                exito(lista.map(c => ({
                    id: String(c.id),
                    title: nombrePaciente(c.paciente),
                    start: c.inicio,
                    end: c.fin,
                    classNames: new Date(c.inicio) < new Date() ? ['cita-pasada'] : [],
                    extendedProps: { paciente: c.paciente }
                })));
            } catch (error) {
                console.error('Error al cargar las citas:', error);
                mostrarAviso('No se pudieron cargar las citas.');
                fallo(error);
            }
        },
        
        // Contenido de cada cita, creado con nodos (no con HTML) para que un dato raro no pueda inyectar código
        eventContent(info) {
            const caja = document.createElement('div');
            caja.className = 'cita-evento';
            
            const nombre = document.createElement('strong');
            nombre.textContent = info.event.title;
            
            const hora = document.createElement('span');
            hora.textContent = info.timeText;
            
            caja.append(nombre, hora);
            return { domNodes: [caja] };
        },
        
        // Información al pasar el cursor (tooltip nativo del navegador)
        eventDidMount(info) {
            const pasada = info.event.start < new Date();
            info.el.title = `${info.event.title}\nHora: ${info.timeText}\n${pasada ? 'Cita pasada' : 'Clic para editar o eliminar'}`;
        }
    });
    
    calendario.render();
    
    // El contenedor cambia de ancho al abrir o cerrar el sidebar: el calendario se reajusta solo
    new ResizeObserver(() => calendario.updateSize()).observe(contenedor);
}

// ----- Botón del sidebar -----
boton?.addEventListener('click', () => {
    marcarBoton(boton);
    mostrarVista('vista-gestion-citas');
    iniciarCalendario();               // después de mostrar la vista: un calendario oculto no puede medir su tamaño
});

// ----- Formulario de la ventana -----
if (formulario) {
    campoCurp.pattern = PATRON_CURP;
    campoHora.min = HORA_APERTURA;
    campoHora.max = ultimaHoraDeInicio();
    campoHora.step = 900;              // de 15 en 15 minutos
    
    campoCurp.addEventListener('input', () => {
        const { selectionStart, selectionEnd } = campoCurp;
        campoCurp.value = campoCurp.value.toUpperCase();
        campoCurp.setSelectionRange(selectionStart, selectionEnd);
    });
    
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (guardando || modo === 'ver') return;
        
        if (modo === 'crear') campoCurp.value = campoCurp.value.trim().toUpperCase();
        if (!formulario.reportValidity()) return;
        
        const fecha = modo === 'editar' ? campoFecha.value : fechaElegida;
        const hora = campoHora.value;
        
        if (new Date(`${fecha}T${hora}:00`) < new Date()) {
            mostrarError('No se puede agendar en una fecha u hora que ya pasó.');
            return;
        }
        
        guardando = true;
        btnGuardar.disabled = true;        // evita guardar dos veces con doble clic
        btnEliminar.disabled = true;
        mensajeError.hidden = true;
        
        try {
            const resultado = modo === 'crear'
                ? await crearCita({ fecha, hora, curp: campoCurp.value })
                : await actualizarCita(citaActual.id, { fecha, hora });
            
            guardando = false;
            
            if (resultado.success) {
                const mensaje = modo === 'crear' ? 'Cita agendada con éxito.' : 'Cita actualizada.';
                cerrarModal();
                calendario?.refetchEvents();   // actualiza el calendario sin recargar la página
                mostrarAviso(mensaje);
            } else {
                mostrarError(resultado.message ?? 'No se pudo guardar la cita.');
            }
        } catch (error) {
            console.error('Error al guardar la cita:', error);
            mostrarError('Ocurrió un problema al conectar con el servidor.');
        } finally {
            guardando = false;
            btnGuardar.disabled = false;
            btnEliminar.disabled = false;
        }
    });
    
    btnCancelar?.addEventListener('click', cerrarModal);
    btnEliminar?.addEventListener('click', abrirConfirmacion);
    btnNoEliminar?.addEventListener('click', cerrarConfirmacion);
    btnSiEliminar?.addEventListener('click', confirmarEliminacion);
    
    // Escape cierra primero la confirmación (si está abierta) y luego la ventana de la cita.
    // A propósito NO se cierra al hacer clic fuera: se perderían los cambios por accidente.
    document.addEventListener('keydown', (evento) => {
        if (evento.key !== 'Escape') return;
        if (modalEliminar?.classList.contains('activo')) cerrarConfirmacion();
        else if (modal?.classList.contains('activo')) cerrarModal();
    });
}
