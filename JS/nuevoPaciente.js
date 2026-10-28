// Botón "Nuevo Paciente" y su formulario.
// Al guardar: avisa que se registró y abre el formulario de consulta de ese paciente.
// Si la CURP ya existe en otro consultorio, el servicio solo lo vincula con este (sin duplicarlo)
// y la pantalla muestra el mismo aviso, para no revelar dónde más se atiende.
import { mostrarVista, marcarBoton, irAlInicio } from './vistas.js';
import { crearPaciente } from './pacientesServicio.js';
import { abrirConsulta } from './consulta.js';
import { mostrarAviso } from './avisos.js';

const boton = document.getElementById('boton1');
const formPaciente = document.getElementById('formulario-paciente');
const btnCancelarPaciente = document.getElementById('btn-cancelar-paciente');
const btnGuardar = formPaciente?.querySelector('button[type="submit"]');
const campoCurp = document.getElementById('curp');

// Convierte los campos del formulario en el paciente que entiende el servicio.
// Es el único lugar donde se traducen los nombres del formulario a los del modelo de datos.
function leerPaciente() {
    const datos = Object.fromEntries(new FormData(formPaciente));
    return {
        nombre: datos.nombre,
        apellidos: datos.apellidos,
        curp: datos.curp,
        fechaNacimiento: datos.nacimiento,
        sexo: datos.sexo,                      // H, M o X, igual que en la CURP
        telefono: datos.telefono,
        correo: datos.correo,
        tipoSangre: datos['tipo-sangre'],
        notas: datos.notas ?? ''
    };
}

// Botón "Nuevo Paciente" del sidebar
boton?.addEventListener('click', () => {
    marcarBoton(boton);
    mostrarVista('vista-nuevo-paciente');
    document.getElementById('nombre')?.focus();
});

// CURP siempre en mayúsculas mientras se escribe
campoCurp?.addEventListener('input', () => {
    const { selectionStart, selectionEnd } = campoCurp;
    campoCurp.value = campoCurp.value.toUpperCase();
    campoCurp.setSelectionRange(selectionStart, selectionEnd);
});

// Cancelar: limpia el formulario y vuelve al inicio
btnCancelarPaciente?.addEventListener('click', () => {
    formPaciente?.reset();
    irAlInicio();
});

// Guardar
formPaciente?.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    // Limpia espacios al inicio y al final de los campos de texto
    formPaciente.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"], textarea')
        .forEach(campo => { campo.value = campo.value.trim(); });

    // Con el valor ya limpio, "required" detecta los que quedaron vacíos
    if (!formPaciente.reportValidity()) return;

    btnGuardar.disabled = true;                // evita registrar dos veces con doble clic

    try {
        const resultado = await crearPaciente(leerPaciente());

        if (!resultado.success) {
            // Por ejemplo, la CURP ya está dada de alta en este consultorio: se avisa y se deja el cursor en ese campo
            mostrarAviso(resultado.message ?? 'No se pudo guardar el paciente.', 'error');
            if (resultado.codigo === 'CURP_DUPLICADA') {
                campoCurp.focus();
                campoCurp.select();
            }
            return;
        }

        formPaciente.reset();
        mostrarAviso('Paciente guardado correctamente.', 'exito');
        abrirConsulta(resultado.paciente);     // sigue la consulta de este paciente
    } catch (error) {
        console.error('Error al guardar el paciente:', error);
        mostrarAviso('Ocurrió un problema al conectar con el servidor.', 'error');
    } finally {
        btnGuardar.disabled = false;
    }
});
