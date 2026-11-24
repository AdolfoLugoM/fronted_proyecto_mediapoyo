// Servicio de consultas: ver el historial de un paciente, abrir consultas de otros médicos con su llave y crear consultas.
// Cada consulta tiene una llave de 8 caracteres: solo su médico la ve; otro médico necesita esa llave para abrirla.
import { obtenerMedicoActual } from './sesionServicio.js';
import { pedir, falla } from './api.js';

// ----- Reglas y errores comunes -----

const LARGO_LLAVE = 8; // caracteres que tiene una llave

// Rangos válidos para peso (kg) y altura (cm)
const PESO = { min: 0.5, max: 400 };
const ALTURA = { min: 30, max: 250 };

// Errores ya armados con la misma forma que usa el resto de la página
const sinSesion = () => ({ success: false, codigo: 'SIN_SESION', message: 'Inicia sesión como médico para continuar.' });
const datoInvalido = (campo, message) => ({ success: false, codigo: 'DATO_INVALIDO', campo, message });

// Deja la llave en mayúsculas y sin guiones, espacios ni símbolos: "ab-12 cd34" → "AB12CD34"
const normalizarLlave = (texto) => String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Se usa el mismo mensaje si la llave no existe o es de otro paciente, para no dar pistas
const LLAVE_INCORRECTA = () => ({
    success: false, codigo: 'LLAVE_INCORRECTA', message: 'Ninguna consulta de este paciente tiene esa llave.'
});

// Consultas de otros médicos abiertas con llave: paciente (id) → { consulta (id) → consulta }.
// Solo viven en la memoria de la página: si se recarga, hay que volver a escribir la llave
const abiertasConLlave = new Map();

// Convierte una consulta del servidor al formato de la página.
// 'propia' indica si es del médico actual (solo en ese caso se muestra la llave)
function consultaDeApi(c, propia, nombreMedico) {
    return {
        id: c.id,
        fecha: c.fecha_consulta,
        propia,
        llave: propia ? c.llave : null,

        medico: {
            id: c.medico_id,
            // nombre del médico: el que manda el servidor, o el actual si es propia, o "Otro médico"
            nombre: c.medico ? `${c.medico.nombre} ${c.medico.apellidos}` : (propia ? nombreMedico : 'Otro médico')
        },
        detalle: {
            enfermedad: c.enfermedad ? { id: c.enfermedad.id, nombre: c.enfermedad.nombre } : null,
            edad: c.edad,
            peso: c.peso,
            altura: c.altura == null ? null : Math.round(c.altura * 100), // el servidor guarda metros; la página usa cm
            notas: c.notas ?? ''
        }
    };
}

// ----- Funciones que usa la página -----

// Devuelve el historial de un paciente: las consultas del médico actual más las que abrió con llave
export async function obtenerHistorial(pacienteId) {
    const id = Number(pacienteId);
    const yo = await obtenerMedicoActual();
    if (!yo) return sinSesion();

    // 1) trae las consultas del médico actual, página por página (el servidor solo manda las suyas)
    const propias = [];
    for (let offset = 0; ; offset += 100) {
        const resp = await pedir(`/historial/${id}`, { parametros: { limit: 100, offset } });
        if (resp.estado === 404) return { success: false, codigo: 'NO_ENCONTRADO', message: 'No se encontró a este paciente.' };
        if (!resp.ok) return falla(resp, 'No se pudo cargar el historial.');

        propias.push(...resp.datos.consultas.items);
        if (resp.datos.consultas.items.length === 0 || propias.length >= resp.datos.consultas.total) break;
    }

    // 2) las convierte al formato de la página y suma las de otros médicos abiertas con llave
    const nombre = `${yo.nombre} ${yo.apellidos}`;
    const suyas = propias.map(c => consultaDeApi(c, true, nombre));
    const ids = new Set(suyas.map(c => c.id));
    // (se omiten las abiertas que ya aparecen entre las suyas, para no repetirlas)
    const abiertas = [...(abiertasConLlave.get(id)?.values() ?? [])].filter(c => !ids.has(c.id));

    // 3) las ordena de la más reciente a la más antigua
    return {
        success: true,
        consultas: [...suyas, ...abiertas].sort((a, b) => b.fecha.localeCompare(a.fecha))
    };
}

// Abre la consulta de otro médico con su llave y la guarda en memoria para mostrarla en el historial
export async function desbloquearConsulta(pacienteId, llaveEscrita) {
    const id = Number(pacienteId);
    const yo = await obtenerMedicoActual();
    if (!yo) return sinSesion();

    // revisa en la página que la llave tenga el largo correcto antes de molestar al servidor
    const buscada = normalizarLlave(llaveEscrita);
    if (buscada.length !== LARGO_LLAVE) {
        return { success: false, codigo: 'LLAVE_INVALIDA', message: `La llave tiene ${LARGO_LLAVE} caracteres.` };
    }

    // pregunta al servidor qué consulta abre esa llave (404: ninguna)
    const resp = await pedir('/consultas/acceso', { metodo: 'POST', datosUser: { llave: buscada } });
    if (resp.estado === 404) return LLAVE_INCORRECTA();
    if (!resp.ok) return falla(resp, 'No se pudo abrir la consulta.');

    const consulta = resp.datos;

    // la llave es válida, pero la consulta es de otro paciente: mismo error que si no existiera
    if (consulta.paciente.id !== id) return LLAVE_INCORRECTA();

    // si la consulta es del propio médico, ya aparece en su historial: no hay que guardar nada
    if (consulta.medico_id === yo.id) return { success: true, consultaId: consulta.id, yaVisible: true };

    // guarda la consulta en la memoria de ese paciente; yaVisible avisa si ya se había abierto antes
    if (!abiertasConLlave.has(id)) abiertasConLlave.set(id, new Map());
    const abiertas = abiertasConLlave.get(id);
    const yaVisible = abiertas.has(consulta.id);

    abiertas.set(consulta.id, consultaDeApi(consulta, false));

    return { success: true, consultaId: consulta.id, yaVisible };
}

// Registra una consulta nueva; si todo sale bien devuelve su id y la llave que se le asignó
export async function crearConsulta(consulta) {
    // peso y altura son opcionales, pero si se escriben deben estar dentro del rango
    // (la condición con ! también rechaza valores que no son números)
    const vacio = (valor) => valor == null || valor === '';
    const peso = vacio(consulta.peso) ? null : Number(consulta.peso);
    if (peso !== null && !(peso >= PESO.min && peso <= PESO.max)) return datoInvalido('peso', `El peso debe estar entre ${PESO.min} y ${PESO.max} kg.`);

    const altura = vacio(consulta.altura) ? null : Number(consulta.altura);
    if (altura !== null && !(altura >= ALTURA.min && altura <= ALTURA.max)) return datoInvalido('altura', `La altura debe estar entre ${ALTURA.min} y ${ALTURA.max} cm.`);

    // la enfermedad del diagnóstico sí es obligatoria
    if (consulta.enfermedadId == null || consulta.enfermedadId === '') {
        return datoInvalido('enfermedad', 'Elige la enfermedad del diagnóstico: cada consulta debe tener uno.');
    }

    // manda la consulta al servidor con los nombres que él usa
    const resp = await pedir('/consultas', {
        metodo: 'POST',
        datosUser: {
            paciente_id: Number(consulta.pacienteId),
            enfermedad_id: Number(consulta.enfermedadId),
            peso: peso === null ? null : Number(peso.toFixed(2)),
            altura: altura === null ? null : Number((altura / 100).toFixed(2)), // la página usa cm; el servidor, metros
            notas: String(consulta.notas ?? '').trim() || null // notas vacías se mandan como null
        }
    });

    if (resp.ok) return { success: true, id: resp.datos.id, llave: resp.datos.llave };

    // 404 puede ser que no exista la enfermedad o el paciente: se distingue leyendo el texto del error
    if (resp.estado === 404) {
        const esEnfermedad = /enfermedad/i.test(String(resp.datos?.detail ?? ''));
        return {
            success: false,
            codigo: 'NO_ENCONTRADO',
            message: esEnfermedad ? 'Elige una enfermedad del catálogo.' : 'No se encontró a este paciente.',
            ...(esEnfermedad ? { campo: 'enfermedad' } : {}) // agrega 'campo' solo si el problema fue la enfermedad
        };
    }
    return falla(resp, 'No se pudo guardar la consulta.');
}
