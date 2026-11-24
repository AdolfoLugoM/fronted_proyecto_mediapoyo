// Servicio de pacientes: buscar, crear y actualizar pacientes.
// Traduce entre los nombres que usa la página (fechaNacimiento) y los del servidor (fecha_nacimiento)
import { pedir, falla } from './api.js';

// ----- Ayudantes de traducción -----
// Piezas que convierten textos y datos entre el formato de la página y el del servidor

// Quita acentos y mayúsculas para comparar textos: "José" → "jose"
// (normalize('NFD') separa la letra de su acento y el replace borra los acentos)
function normalizar(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// El sexo se escribe distinto: la página usa M/F y el servidor H/M
const SEXO_A_API = { M: 'H', F: 'M' }; // página → servidor
const SEXO_DE_API = { H: 'M', M: 'F' }; // servidor → página

// Convierte un paciente del servidor al formato que usa la página
function deApi(p) {
    return {
        id: p.id,
        nombre: p.nombre,
        apellidos: p.apellidos,
        curp: p.curp,
        fechaNacimiento: p.fecha_nacimiento,
        sexo: SEXO_DE_API[p.sexo] ?? p.sexo,
        telefono: p.numero_telefonico ?? '', // los campos opcionales que vienen null se dejan como texto vacío
        tipoSangre: p.tipo_de_sangre ?? '',
        notas: p.notas ?? ''
    };
}

// Convierte los datos de la página al formato del servidor; solo incluye los campos que vienen en 'campos'
// (así, al actualizar, únicamente se envía lo que cambió)
function haciaApi(campos) {
    const salida = {};
    // el servidor espera null en lugar de texto vacío en los campos opcionales
    const vacioANulo = (valor) => (String(valor ?? '').trim() === '' ? null : String(valor).trim());

    if ('nombre' in campos) salida.nombre = campos.nombre;
    if ('apellidos' in campos) salida.apellidos = campos.apellidos;
    if ('curp' in campos) salida.curp = String(campos.curp).trim().toUpperCase(); // la CURP siempre en mayúsculas
    if ('fechaNacimiento' in campos) salida.fecha_nacimiento = campos.fechaNacimiento;
    if ('sexo' in campos) salida.sexo = SEXO_A_API[campos.sexo] ?? campos.sexo;
    if ('telefono' in campos) salida.numero_telefonico = vacioANulo(campos.telefono);
    if ('tipoSangre' in campos) salida.tipo_de_sangre = vacioANulo(campos.tipoSangre);
    if ('notas' in campos) salida.notas = vacioANulo(campos.notas);
    return salida;
}

// ----- Búsqueda sin acentos -----
// El servidor distingue acentos ("Jose" ≠ "José"), así que se le pide una búsqueda amplia y la página filtra

const TOPE_CANDIDATOS = 500; // máximo de pacientes que se traen del servidor para filtrar aquí
const MAX_TRAMOS = 5; // máximo de pedazos de texto que se mandan al servidor

// Parte lo escrito en pedazos sin vocales ni n/ñ (que son las letras que llevan acento o cambian),
// para que los acentos no afecten la búsqueda; se quedan los 5 pedazos más largos
function tramosSinAcento(termino) {
    return normalizar(termino).split(/[\saeiounñ]+/).filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .slice(0, MAX_TRAMOS);
}

// Busca pacientes sin importar acentos ni mayúsculas, en nombre, apellidos o CURP
async function buscarSinAcentos(termino) {
    // 1) las palabras que escribió el usuario, ya normalizadas
    const palabras = normalizar(termino).split(/\s+/).filter(Boolean);

    // 2) lo que se manda al servidor: los pedazos sin acentos (o lo escrito, si no quedó ninguno)
    const buscar = tramosSinAcento(termino).join(' ') || termino;

    // 3) trae los candidatos página por página (100 por petición) hasta el tope
    const candidatos = [];
    for (let offset = 0; offset < TOPE_CANDIDATOS; offset += 100) {
        const resp = await pedir('/pacientes', { parametros: { buscar, limit: 100, offset } });
        if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);

        candidatos.push(...resp.datos.items);
        if (resp.datos.items.length === 0 || candidatos.length >= resp.datos.total) break; // ya no hay más
    }

    // 4) se queda con los que contienen TODAS las palabras escritas (every), comparando sin acentos
    return candidatos.map(deApi).filter(p => {
        const texto = normalizar(`${p.nombre} ${p.apellidos} ${p.curp}`);
        return palabras.every(palabra => texto.includes(palabra));
    });
}

// ----- Funciones que usa la página -----

// Busca pacientes y devuelve solo la página de resultados pedida (la paginación se hace aquí)
export async function buscarPacientes(termino, { pagina = 1, porPagina = 10 } = {}) {
    const coincidencias = await buscarSinAcentos(termino);
    const inicio = (pagina - 1) * porPagina;
    return { total: coincidencias.length, pagina, porPagina, resultados: coincidencias.slice(inicio, inicio + porPagina) };
}

// Trae un paciente por su id; null si no existe (404)
async function obtenerPaciente(id) {
    const resp = await pedir(`/pacientes/${encodeURIComponent(id)}`);
    if (resp.estado === 404) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);
    return deApi(resp.datos);
}

// Busca un paciente por su CURP exacta; null si no hay ninguno
export async function buscarPacientePorCurp(curp) {
    const buscada = String(curp ?? '').trim().toUpperCase();
    if (!buscada) return null;

    const resp = await pedir('/pacientes', { parametros: { buscar: buscada, limit: 10 } });
    if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);

    // el servidor busca coincidencias parciales, así que se elige la que sea exactamente igual
    const exacto = resp.datos.items.find(p => p.curp.toUpperCase() === buscada);
    return exacto ? deApi(exacto) : null;
}

// Pacientes ya consultados: id → datos básicos (así no se pide dos veces el mismo paciente)
const resumenEnMemoria = new Map();

// Devuelve nombre, apellidos y CURP de varios pacientes a la vez, en un Map (id → datos)
export async function resumenPacientes(ids) {
    const resumen = new Map();
    // quita ids repetidos (Set) y los que ya están en memoria: solo se piden los que faltan
    const faltan = [...new Set(ids.map(Number))].filter(id => !resumenEnMemoria.has(id));

    // pide los que faltan al mismo tiempo (Promise.all) en lugar de uno por uno
    await Promise.all(faltan.map(async (id) => {
        const paciente = await obtenerPaciente(id);
        if (paciente) {
            resumenEnMemoria.set(id, { id, nombre: paciente.nombre, apellidos: paciente.apellidos, curp: paciente.curp });
        }
    }));

    // arma el resultado con todos los ids pedidos (los que ya estaban y los recién traídos)
    for (const id of ids.map(Number)) if (resumenEnMemoria.has(id)) resumen.set(id, resumenEnMemoria.get(id));
    return resumen;
}

// Registra un paciente nuevo
export async function crearPaciente(paciente) {
    const resp = await pedir('/pacientes', { metodo: 'POST', datosUser: haciaApi(paciente) });

    if (resp.ok) return { success: true, paciente: deApi(resp.datos) };
    if (resp.estado === 409) { // 409: ya existe un paciente con esa CURP
        return {
            success: false,
            codigo: 'CURP_DUPLICADA',
            message: 'Ya existe un paciente con esa CURP. Búscalo en la barra superior.'
        };
    }
    return falla(resp, 'No se pudo guardar el paciente.');
}

// Cambia datos de un paciente existente (PATCH: solo se envían los campos que cambiaron)
export async function actualizarPaciente(id, cambios) {
    const resp = await pedir(`/pacientes/${encodeURIComponent(id)}`, {
        metodo: 'PATCH',
        datosUser: haciaApi(cambios)
    });

    // respuesta: éxito, paciente no encontrado (404), CURP ya usada por otro (409) o error general
    if (resp.ok) return { success: true, paciente: deApi(resp.datos) };
    if (resp.estado === 404) {
        return { success: false, codigo: 'NO_ENCONTRADO', message: 'No se encontró a este paciente.' };
    }
    if (resp.estado === 409) {
        return { success: false, codigo: 'CURP_DUPLICADA', message: 'Esa CURP ya pertenece a otro paciente registrado.' };
    }
    return falla(resp, 'No se pudieron guardar los cambios.');
}
