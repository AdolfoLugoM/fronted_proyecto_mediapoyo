// Vista del historial de consultas de un paciente (se abre desde los resultados de la búsqueda).
//
// Qué ve el médico:
//   - Los antecedentes (notas y tipo de sangre): siempre, por seguridad.
//   - Las consultas que ÉL hizo: completas, sin pedir nada (con su llave, por si el paciente la perdió).
//   - Las de otros médicos: NO aparecen hasta escribir la llave que el paciente recibió en ESA consulta
//     (aparece solo esa). Ni siquiera se muestra cuántas hay: el campo de la llave está siempre disponible.
// Desde aquí también se puede crear una consulta nueva para ese mismo paciente.

import { mostrarVista, marcarBoton } from './vistas.js';
import { obtenerHistorial, desbloquearConsulta, buscarConsultaPorFolio, enviarLlaveAlPaciente } from '../servicios/consultasServicio.js';
import { abrirConsulta } from './consulta.js';
import { mostrarAviso } from './avisos.js';
import { calcularEdad, formatearFechaHora } from '../utilidades.js';

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
        if (alerta && texto) item.classList.add('antecedente--alerta');

        const valorNodo = crear('dd', texto ? '' : 'antecedente-vacio', texto || 'Sin registrar');
        item.append(crear('dt', '', titulo), valorNodo);
        return item;
    }));
}

// ----- Una consulta -----

function dibujarDetalle(cuerpo, detalle) {
    const enfermedad = crear('p', 'consulta-enfermedad');
    enfermedad.append(crear('strong', '', 'Enfermedad: '),
        detalle.enfermedad ? detalle.enfermedad.nombre : 'Sin diagnóstico');

    // Edad, peso y altura como etiquetas (la edad es la que tenía el día de la consulta)
    const medidas = crear('div', 'medidas-consulta');
    medidas.append(
        crear('span', 'etiqueta-medida', `${detalle.edad} años`),
        crear('span', 'etiqueta-medida', `${detalle.peso} kg`),
        crear('span', 'etiqueta-medida', `${detalle.altura} cm`)
    );

    const partes = [enfermedad, medidas];

    if (detalle.notas) {
        const notas = crear('p', 'consulta-notas');
        notas.append(crear('strong', '', 'Notas: '), detalle.notas);
        partes.push(notas);
    }

    cuerpo.replaceChildren(...partes);
}

function crearTarjeta(consulta) {
    const tarjeta = crear('article', 'consulta-historial');
    tarjeta.dataset.folio = folio(consulta.id);
    if (!consulta.propia) tarjeta.classList.add('consulta-historial--externa');   // de otro médico, desbloqueada

    const cabecera = crear('div', 'consulta-cabecera');
    const datos = crear('div');

    const fecha = crear('time', 'consulta-fecha', formatearFechaHora(consulta.fecha));
    fecha.dateTime = consulta.fecha;

    datos.append(fecha, crear('span', 'consulta-medico', `Atendió: ${consulta.medico.nombre}`));
    cabecera.appendChild(datos);

    // La llave solo aparece en las propias, para volver a dársela al paciente si la perdió
    const textoFolio = consulta.llave
        ? `Folio ${folio(consulta.id)} · Llave ${consulta.llave}`
        : `Folio ${folio(consulta.id)}`;
    cabecera.appendChild(crear('span', 'consulta-folio', textoFolio));

    const cuerpo = crear('div', 'consulta-cuerpo');
    dibujarDetalle(cuerpo, consulta.detalle);

    tarjeta.append(cabecera, cuerpo);
    return tarjeta;
}

// ----- Campo de la llave (arriba de la lista) -----

function ocultarBanner() {
    banner.hidden = true;
    banner.replaceChildren();
}

function crearFormularioLlave(consultaId = null) {
    const formulario = crear('form', 'formulario-codigo formulario-codigo--llave');
    formulario.noValidate = true;

    const campo = crear('input');
    campo.type = 'text';
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    campo.maxLength = 9;                       // 8 caracteres (+ un guion si la escriben así)
    campo.placeholder = 'Ej. Q5KR9MGU';
    campo.setAttribute('aria-label', 'Llave de la consulta');

    const btnDesbloquear = crearBoton('Desbloquear', 'boton-tabla--principal', 'submit');
    formulario.append(campo, btnDesbloquear);

    const mensaje = crearMensaje();

    // Siempre en mayúsculas mientras se escribe
    campo.addEventListener('input', () => { campo.value = campo.value.toUpperCase(); });

    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();

        if (campo.value.trim() === '') {
            mostrarMensaje(mensaje, 'Escribe la llave de la consulta.');
            campo.focus();
            return;
        }

        btnDesbloquear.disabled = true;        // evita enviar dos veces
        campo.disabled = true;
        mensaje.hidden = true;

        try {
            const resultado = await desbloquearConsulta(pacienteActual.id, campo.value, consultaId);

            if (resultado.success) {
                mostrarAviso(resultado.yaVisible ? 'Esa consulta ya aparece en la lista.' : 'Consulta desbloqueada.', 'exito');
                recargar();                    // se redibuja con la consulta nueva y el campo vacío
                return;
            }

            mostrarMensaje(mensaje, resultado.message ?? 'No se pudo desbloquear la consulta.');
        } catch (error) {
            console.error('Error al desbloquear la consulta:', error);
            mostrarMensaje(mensaje, 'Ocurrió un problema al conectar con el servidor.');
        }

        btnDesbloquear.disabled = false;
        campo.disabled = false;
        campo.select();
    });

    return { formulario, campo, mensaje };
}

function crearConsultaBloqueada(consulta) {
    const tarjeta = crear('div', 'consulta-bloqueada');

    const fecha = crear('time', 'consulta-fecha', formatearFechaHora(consulta.fecha));
    fecha.dateTime = consulta.fecha;

    const datos = crear('div', 'consulta-cabecera');
    const izquierda = crear('div');
    izquierda.append(fecha, crear('span', 'consulta-medico', `Atendió: ${consulta.medico.nombre}`));
    datos.append(izquierda, crear('span', 'consulta-folio', `Folio ${folio(consulta.id)} · Bloqueada`));

    const aviso = crear('p', '', 'Pide al paciente la llave que recibió en esta consulta para ver su contenido. ' +
        'Si no la tiene, envíasela a su teléfono y que te la dicte.');

    const filaEnvio = crear('div', 'envio-llave');
    const btnEnviar = crearBoton('Enviar llave al paciente');
    const estadoEnvio = crear('span', 'envio-llave-estado');
    filaEnvio.append(btnEnviar, estadoEnvio);

    const { formulario, campo, mensaje } = crearFormularioLlave(consulta.id);

    let temporizador = null;
    function esperarReenvio(segundos) {
        clearInterval(temporizador);
        let restantes = segundos;
        btnEnviar.disabled = true;
        btnEnviar.textContent = `Reenviar (${restantes} s)`;

        temporizador = setInterval(() => {
            restantes--;
            if (restantes > 0 && tarjeta.isConnected) {
                btnEnviar.textContent = `Reenviar (${restantes} s)`;
                return;
            }
            clearInterval(temporizador);
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Reenviar llave';
        }, 1000);
    }

    btnEnviar.addEventListener('click', async () => {
        btnEnviar.disabled = true;
        estadoEnvio.textContent = 'Enviando...';

        try {
            const resultado = await enviarLlaveAlPaciente(pacienteActual.id, consulta.id);

            if (resultado.success) {
                estadoEnvio.textContent = `Enviada por SMS al ${resultado.telefono}. Pide al paciente que te la dicte.`;
                mostrarAviso('Llave enviada al paciente.', 'exito');
                esperarReenvio(60);
                campo.focus();
                return;
            }

            estadoEnvio.textContent = resultado.message ?? 'No se pudo enviar la llave.';
            if (resultado.espera) { esperarReenvio(resultado.espera); return; }
        } catch (error) {
            console.error('Error al enviar la llave:', error);
            estadoEnvio.textContent = 'Ocurrió un problema al conectar con el servidor.';
        }

        btnEnviar.disabled = false;
    });

    tarjeta.append(datos, aviso, filaEnvio, formulario, mensaje);
    return { tarjeta, campo };
}

function crearBuscadorFolio() {
    const contenedor = crear('form', 'buscador-folio');
    contenedor.noValidate = true;

    const etiqueta = crear('label', '', 'Buscar por folio');
    etiqueta.htmlFor = 'buscar-folio';

    const campo = crear('input');
    campo.type = 'search';
    campo.id = 'buscar-folio';
    campo.inputMode = 'numeric';
    campo.autocomplete = 'off';
    campo.maxLength = 4;
    campo.placeholder = 'Ej. 0014';

    const btnBuscar = crearBoton('Buscar', '', 'submit');

    const resultado = crear('div', 'buscador-folio-resultado');
    let numeroBusqueda = 0;

    const mostrarTexto = (texto) => resultado.replaceChildren(crear('p', 'buscador-folio-vacio', texto));

    function filtrarLista(buscado) {
        let visibles = 0;
        let exacta = false;

        lista.querySelectorAll('.consulta-historial').forEach(tarjeta => {
            const coincide = tarjeta.dataset.folio.includes(buscado);
            tarjeta.hidden = !coincide;
            if (coincide) visibles++;
            if (buscado && Number(tarjeta.dataset.folio) === Number(buscado)) exacta = true;
        });

        return { visibles, exacta };
    }

    async function buscarCompleto() {
        const buscado = campo.value;
        if (!buscado || Number(buscado) === 0) return;

        const { exacta } = filtrarLista(buscado);
        if (exacta) return;

        const miBusqueda = ++numeroBusqueda;
        btnBuscar.disabled = true;
        mostrarTexto('Buscando...');

        try {
            const respuesta = await buscarConsultaPorFolio(pacienteActual.id, buscado);
            if (miBusqueda !== numeroBusqueda) return;

            if (!respuesta.success) {
                mostrarTexto(respuesta.message ?? 'No se pudo buscar el folio.');
            } else if (respuesta.consulta.visible) {
                mostrarTexto('Esa consulta ya está en tu lista.');
            } else {
                const { tarjeta, campo: campoLlave } = crearConsultaBloqueada(respuesta.consulta);
                resultado.replaceChildren(tarjeta);
                campoLlave.focus();
            }
        } catch (error) {
            if (miBusqueda !== numeroBusqueda) return;
            console.error('Error al buscar el folio:', error);
            mostrarTexto('Ocurrió un problema al conectar con el servidor.');
        } finally {
            if (miBusqueda === numeroBusqueda) btnBuscar.disabled = false;
        }
    }

    campo.addEventListener('input', () => {
        campo.value = campo.value.replace(/\D/g, '');
        numeroBusqueda++;
        btnBuscar.disabled = false;
        resultado.replaceChildren();

        const buscado = campo.value;
        const { visibles } = filtrarLista(buscado);

        if (buscado.length === 4) buscarCompleto();
        else if (buscado && visibles === 0) mostrarTexto('Ninguna consulta de tu lista tiene ese folio. Escribe el folio completo o pulsa Buscar.');
    });

    contenedor.addEventListener('submit', (evento) => {
        evento.preventDefault();
        buscarCompleto();
    });

    contenedor.append(etiqueta, campo, btnBuscar, resultado);
    return contenedor;
}

function dibujarOpciones() {
    banner.hidden = false;

    const texto = crear('p', '',
        '¿El paciente se atendió con otro médico? Escribe la llave que recibió en esa consulta para verla aquí.');

    const { formulario, mensaje } = crearFormularioLlave();

    banner.replaceChildren(texto, formulario, mensaje, crearBuscadorFolio());
}

// ----- Historial completo -----

function dibujarHistorial(respuesta) {
    if (!respuesta.success) {
        resumen.textContent = respuesta.message ?? 'No se pudo cargar el historial.';
        ocultarBanner();
        lista.replaceChildren();
        return;
    }

    const { consultas } = respuesta;

    // Solo cuenta las que se pueden ver: las de otros médicos sin llave no existen para esta pantalla
    resumen.textContent = consultas.length === 0
        ? 'Aún no tienes consultas con este paciente.'
        : consultas.length === 1 ? '1 consulta.' : `${consultas.length} consultas.`;

    // El campo de la llave siempre está, haya o no consultas ocultas (así no se revela si existen)
    dibujarOpciones();

    lista.replaceChildren(...consultas.map(crearTarjeta));
}

// Pide el historial y lo dibuja, sin cambiar de vista (lo usa también la llave)
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
