// Vista del historial de consultas de un paciente (se abre desde los resultados de la búsqueda).
//
// Qué ve el médico:
//   - Los antecedentes (notas y tipo de sangre): siempre, por seguridad.
//   - Las consultas de SU consultorio: completas, sin pedir nada.
//   - Las de otros consultorios: bloqueadas, hasta que el paciente le dicte el código que le llegó
//     al teléfono (8 horas de acceso) o hasta que use el acceso de emergencia (1 hora, con motivo).
// Desde aquí también se puede crear una consulta nueva para ese mismo paciente.

import { mostrarVista, marcarBoton } from './vistas.js';
import { obtenerHistorial, solicitarCodigo, verificarCodigo, accesoEmergencia } from './consultasServicio.js';
import { abrirConsulta } from './consulta.js';
import { mostrarAviso } from './avisos.js';
import { calcularEdad, formatearFechaHora, formatearHora } from './utilidades.js';

const nombrePaciente = document.getElementById('historial-nombre');
const detallePaciente = document.getElementById('historial-detalle');
const antecedentes = document.getElementById('historial-antecedentes');
const resumen = document.getElementById('historial-resumen');
const banner = document.getElementById('historial-acceso');
const lista = document.getElementById('historial-lista');
const btnNuevaConsulta = document.getElementById('btn-nueva-consulta-historial');
const btnVolver = document.getElementById('btn-volver-resultados');

let pacienteActual = null;
let numeroCarga = 0;                   // descarta respuestas viejas si se abre otro paciente mientras carga
let bloqueadas = 0;                    // consultas de otros consultorios que aún no se pueden ver
let temporizadorVencimiento = null;    // vuelve a bloquear cuando el acceso termina

const folio = (id) => String(id).padStart(4, '0');

// ----- Ayudantes para crear nodos (siempre con textContent: nunca se interpreta HTML) -----

function crear(etiqueta, clase = '', texto = '') {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto) nodo.textContent = texto;
    return nodo;
}

function crearBoton(texto, clase = '', tipo = 'button') {
    const boton = crear('button', `boton-tabla ${clase}`.trim(), texto);
    boton.type = tipo;
    return boton;
}

function crearEnlace(texto) {
    const boton = crear('button', 'boton-enlace', texto);
    boton.type = 'button';
    return boton;
}

function crearMensaje() {
    const mensaje = crear('p', 'acceso-mensaje');
    mensaje.setAttribute('role', 'alert');
    mensaje.hidden = true;
    return mensaje;
}

function mostrarMensaje(mensaje, texto) {
    mensaje.textContent = texto;
    mensaje.hidden = false;
}

// ----- Antecedentes: siempre visibles, aun sin permiso, porque protegen al paciente -----

function dibujarAntecedentes(paciente) {
    const datos = [
        { titulo: 'Notas', valor: paciente.notas, alerta: true },
        { titulo: 'Tipo de sangre', valor: paciente.tipoSangre, alerta: false }
    ];
    
    antecedentes.replaceChildren(...datos.map(({ titulo, valor, alerta }) => {
        const texto = (valor ?? '').trim();
        const item = crear('div', 'antecedente');
        
        const valorNodo = crear('dd', texto ? '' : 'antecedente-vacio', texto || 'Sin registrar');
        item.append(crear('dt', '', titulo), valorNodo);
        return item;
    }));
}

// ----- Una consulta -----

function dibujarDetalle(cuerpo, detalle) {
    const sintomas = crear('div', 'sintomas-consulta');
    
    if (detalle.sintomas.length === 0) {
        sintomas.appendChild(crear('span', 'consulta-sin-sintomas', 'Sin síntomas registrados'));
    } else {
        for (const sintoma of detalle.sintomas) {
            sintomas.appendChild(crear('span', 'etiqueta-sintoma', sintoma.nombre));
        }
    }
    
    const partes = [sintomas];
    
    if (detalle.observaciones) {
        const observaciones = crear('p', 'consulta-observaciones');
        observaciones.append(crear('strong', '', 'Observaciones: '), detalle.observaciones);
        partes.push(observaciones);
    }
    
    cuerpo.replaceChildren(...partes);
}

function crearTarjeta(consulta) {
    const tarjeta = crear('article', 'consulta-historial');
    if (!consulta.detalle) tarjeta.classList.add('consulta-historial--bloqueada');
    else if (!consulta.propia) tarjeta.classList.add('consulta-historial--externa');
    
    const cabecera = crear('div', 'consulta-cabecera');
    const datos = crear('div');
    
    const fecha = crear('time', 'consulta-fecha', formatearFechaHora(consulta.fecha));
    fecha.dateTime = consulta.fecha;
    
    // Sin permiso no se revela con quién ni dónde se atendió
    const origen = !consulta.detalle
        ? 'Consulta en otro consultorio'
        : consulta.propia
            ? `Atendió: ${consulta.medico.nombre}`
            : `Atendió: ${consulta.medico.nombre} · ${consulta.consultorio.nombre}`;
    
    datos.append(fecha, crear('span', 'consulta-medico', origen));
    cabecera.appendChild(datos);
    if (consulta.detalle) cabecera.appendChild(crear('span', 'consulta-folio', `Folio ${folio(consulta.id)}`));
    
    const cuerpo = crear('div', 'consulta-cuerpo');
    if (consulta.detalle) {
        dibujarDetalle(cuerpo, consulta.detalle);
    } else {
        cuerpo.appendChild(crear('p', 'consulta-protegida', 'Requiere el permiso del paciente para verla.'));
    }
    
    tarjeta.append(cabecera, cuerpo);
    return tarjeta;
}

// ----- Banner de acceso (arriba de la lista) -----

function limpiarTemporizador() {
    clearTimeout(temporizadorVencimiento);
    temporizadorVencimiento = null;
}

function ocultarBanner() {
    banner.hidden = true;
    banner.className = 'banner-acceso';
    banner.replaceChildren();
}

// Acceso vigente: solo informa hasta cuándo dura, y programa el bloqueo al terminar
function dibujarAccesoVigente(acceso) {
    const hora = formatearHora(acceso.expira);
    const emergencia = acceso.tipo === 'emergencia';
    
    banner.hidden = false;
    banner.className = `banner-acceso ${emergencia ? 'banner-acceso--emergencia' : 'banner-acceso--concedido'}`;
    banner.replaceChildren(crear('p', '', emergencia
        ? `Acceso de emergencia activo hasta las ${hora}. Quedó registrado con tu nombre y el motivo.`
        : `El paciente autorizó el acceso a su historial completo hasta las ${hora}.`));
    
    const restante = new Date(acceso.expira) - Date.now();
    temporizadorVencimiento = setTimeout(recargar, Math.min(restante + 1000, 2 ** 31 - 1));
}

// Sin acceso: ofrece pedir el código o el acceso de emergencia
function dibujarOpciones() {
    banner.hidden = false;
    banner.className = 'banner-acceso';
    
    const texto = crear('p', '', bloqueadas === 1
        ? '1 consulta de otro consultorio requiere el permiso del paciente.'
        : `${bloqueadas} consultas de otros consultorios requieren el permiso del paciente.`);
    
    const acciones = crear('div', 'acciones-tabla');
    const btnCodigo = crearBoton('Solicitar código al paciente', 'boton-tabla--principal');
    const btnEmergencia = crearBoton('Acceso de emergencia', 'boton-tabla--peligro');
    acciones.append(btnCodigo, btnEmergencia);
    
    const mensaje = crearMensaje();
    banner.replaceChildren(texto, acciones, mensaje);
    
    btnCodigo.addEventListener('click', () => pedirCodigo(btnCodigo, mensaje));
    btnEmergencia.addEventListener('click', dibujarEmergencia);
}

async function pedirCodigo(boton, mensaje) {
    boton.disabled = true;                     // evita pedir dos códigos con doble clic
    mensaje.hidden = true;
    
    try {
        const resultado = await solicitarCodigo(pacienteActual.id);
        if (resultado.success) {
            dibujarFormularioCodigo(resultado);
            return;
        }
        mostrarMensaje(mensaje, resultado.message ?? 'No se pudo enviar el código.');
    } catch (error) {
        console.error('Error al solicitar el código:', error);
        mostrarMensaje(mensaje, 'Ocurrió un problema al conectar con el servidor.');
    }
    
    boton.disabled = false;
}

function dibujarFormularioCodigo({ destino, expira }) {
    banner.className = 'banner-acceso';
    
    const texto = crear('p', '', `Se envió un código de 6 dígitos al teléfono ${destino}. ` +
        `Pídele al paciente que te lo dicte. Vence a las ${formatearHora(expira)}.`);
    
    const formulario = crear('form', 'formulario-codigo');
    formulario.noValidate = true;
    
    const campo = crear('input');
    campo.type = 'text';
    campo.inputMode = 'numeric';
    campo.autocomplete = 'one-time-code';
    campo.maxLength = 6;
    campo.placeholder = '000000';
    campo.setAttribute('aria-label', 'Código de 6 dígitos que dictó el paciente');
    
    const btnVerificar = crearBoton('Verificar', 'boton-tabla--principal', 'submit');
    formulario.append(campo, btnVerificar);
    
    const mensaje = crearMensaje();
    
    const otras = crear('div', 'acciones-enlace');
    const btnReenviar = crearEnlace('Reenviar código');
    const btnCancelar = crearEnlace('Cancelar');
    otras.append(btnReenviar, btnCancelar);
    
    banner.replaceChildren(texto, formulario, mensaje, otras);
    campo.focus();
    
    // Solo dígitos, aunque peguen "482 913"
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 6); });
    
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        
        if (!/^\d{6}$/.test(campo.value)) {
            mostrarMensaje(mensaje, 'Escribe los 6 dígitos del código.');
            campo.focus();
            return;
        }
        
        btnVerificar.disabled = true;
        campo.disabled = true;
        mensaje.hidden = true;
        
        try {
            const resultado = await verificarCodigo(pacienteActual.id, campo.value);
            
            if (resultado.success) {
                mostrarAviso('El paciente autorizó el acceso a su historial.', 'exito');
                recargar();
                return;
            }
            
            mostrarMensaje(mensaje, resultado.message ?? 'No se pudo verificar el código.');
            
            // El código ya no sirve: solo queda pedir otro
            if (['SIN_CODIGO', 'CODIGO_VENCIDO', 'BLOQUEADO'].includes(resultado.codigo)) {
                campo.value = '';
                return;
            }
        } catch (error) {
            console.error('Error al verificar el código:', error);
            mostrarMensaje(mensaje, 'Ocurrió un problema al conectar con el servidor.');
        }
        
        btnVerificar.disabled = false;
        campo.disabled = false;
        campo.value = '';
        campo.focus();
    });
    
    btnReenviar.addEventListener('click', () => pedirCodigo(btnReenviar, mensaje));
    btnCancelar.addEventListener('click', dibujarOpciones);
}

function dibujarEmergencia() {
    banner.className = 'banner-acceso banner-acceso--emergencia';
    
    const advertencia = crear('p', '', 'Úsalo solo si el paciente no puede dar su permiso (por ejemplo, ' +
        'está inconsciente). Tendrás acceso por 1 hora y quedarán registrados tu nombre, la hora y el motivo.');
    
    const formulario = crear('form', 'formulario-emergencia');
    formulario.noValidate = true;
    
    const etiqueta = crear('label', '', 'Motivo');
    etiqueta.htmlFor = 'motivo-emergencia';
    
    const motivo = crear('textarea');
    motivo.id = 'motivo-emergencia';
    motivo.rows = 2;
    motivo.maxLength = 300;
    motivo.placeholder = 'Ejemplo: paciente inconsciente, ingresa por urgencias';
    
    const acciones = crear('div', 'acciones-tabla');
    const btnConfirmar = crearBoton('Abrir con acceso de emergencia', 'boton-tabla--peligro', 'submit');
    const btnCancelar = crearBoton('Cancelar');
    acciones.append(btnConfirmar, btnCancelar);
    
    const mensaje = crearMensaje();
    formulario.append(etiqueta, motivo, acciones);
    banner.replaceChildren(advertencia, formulario, mensaje);
    motivo.focus();
    
    btnCancelar.addEventListener('click', dibujarOpciones);
    
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        
        btnConfirmar.disabled = true;          // evita enviar dos veces
        mensaje.hidden = true;
        
        try {
            const resultado = await accesoEmergencia(pacienteActual.id, motivo.value);
            
            if (resultado.success) {
                mostrarAviso('Acceso de emergencia activo por 1 hora.', 'exito');
                recargar();
                return;
            }
            
            mostrarMensaje(mensaje, resultado.message ?? 'No se pudo abrir el acceso de emergencia.');
            motivo.focus();
        } catch (error) {
            console.error('Error en el acceso de emergencia:', error);
            mostrarMensaje(mensaje, 'Ocurrió un problema al conectar con el servidor.');
        }
        
        btnConfirmar.disabled = false;
    });
}

// ----- Historial completo -----

function dibujarHistorial(respuesta) {
    limpiarTemporizador();
    
    if (!respuesta.success) {
        resumen.textContent = respuesta.message ?? 'No se pudo cargar el historial.';
        ocultarBanner();
        lista.replaceChildren();
        return;
    }
    
    const { consultas, acceso } = respuesta;
    bloqueadas = consultas.filter(c => !c.detalle).length;
    
    if (consultas.length === 0) {
        resumen.textContent = 'Este paciente aún no tiene consultas registradas.';
    } else {
        const total = consultas.length === 1 ? '1 consulta registrada' : `${consultas.length} consultas registradas`;
        resumen.textContent = bloqueadas > 0 ? `${total}, ${bloqueadas} sin permiso para verla${bloqueadas === 1 ? '' : 's'}.` : `${total}.`;
    }
    
    if (acceso) dibujarAccesoVigente(acceso);
    else if (bloqueadas > 0) dibujarOpciones();
    else ocultarBanner();
    
    lista.replaceChildren(...consultas.map(crearTarjeta));
}

// Pide el historial y lo dibuja, sin cambiar de vista (lo usan también el código y el vencimiento)
async function cargarConsultas() {
    if (!pacienteActual) return;
    const miCarga = ++numeroCarga;
    
    try {
        const respuesta = await obtenerHistorial(pacienteActual.id);
        if (miCarga !== numeroCarga) return;
        dibujarHistorial(respuesta);
    } catch (error) {
        if (miCarga !== numeroCarga) return;
        console.error('Error al cargar el historial:', error);
        resumen.textContent = 'No se pudo cargar el historial. Intenta de nuevo.';
        ocultarBanner();
    }
}

function recargar() {
    cargarConsultas();
}

// Al salir de la vista se borra todo de la pantalla
function limpiarVista() {
    limpiarTemporizador();
    numeroCarga++;                             // descarta cargas pendientes
    ocultarBanner();
    lista.replaceChildren();
}

/** Muestra los datos del paciente, sus antecedentes y sus consultas. */
export async function abrirHistorial(paciente) {
    pacienteActual = paciente;
    
    const edad = calcularEdad(paciente.fechaNacimiento);
    nombrePaciente.textContent = `${paciente.nombre} ${paciente.apellidos}`;
    detallePaciente.textContent = [
        `CURP: ${paciente.curp}`,
        edad !== null ? `${edad} años` : null,
        paciente.telefono ? `Tel. ${paciente.telefono}` : null
    ].filter(Boolean).join(' · ');
    
    dibujarAntecedentes(paciente);
    limpiarVista();
    resumen.textContent = 'Cargando historial...';
    
    marcarBoton(null);
    mostrarVista('vista-historial');
    
    await cargarConsultas();
}

// Nueva consulta para este paciente: al guardar o cancelar se regresa al historial
btnNuevaConsulta?.addEventListener('click', () => {
    const paciente = pacienteActual;
    if (!paciente) return;
    
    limpiarVista();                            // no dejar detalles en pantalla
    
    abrirConsulta(paciente, {
        botonActivo: null,                                // no es parte del registro de un paciente nuevo
        alGuardar: () => abrirHistorial(paciente),        // se ve la consulta recién guardada
        alCancelar: () => abrirHistorial(paciente)
    });
});

btnVolver?.addEventListener('click', () => {
    limpiarVista();
    mostrarVista('vista-resultados');
});
