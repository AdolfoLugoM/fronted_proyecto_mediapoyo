// Capa de acceso a datos de los médicos.
// HOY lee datos/medicos.json; MAÑANA llama a la API (USAR_API = true).

// En la base de datos: tabla "Medicos" (MedicoID, Nombre, Apellidos, Ciudad, EFirma, NombreDeUsuario, Password con hash).
// La contraseña y la e-firma nunca deben viajar al navegador.

const USAR_API = false;
const URL_JSON = 'JSON/medicos.json';     // ruta relativa a index.html y a login.html
const URL_API = '/api/medicos';

// Lo único que un médico puede cambiar de su perfil desde la app.

const CAMPOS_EDITABLES = ['nombre', 'apellidos', 'ciudad'];

// SOLO SIMULACIÓN: los médicos que se registran en esta pestaña viven en sessionStorage (un JSON estático
// no se puede escribir desde el navegador). Con la API real, el servidor los guarda en la tabla Medicos.
const CLAVE_REGISTRADOS = 'medicosRegistrados';

let cacheMedicos = null;
let registrados = [];

function leerRegistrados() {
    try {
        return JSON.parse(sessionStorage.getItem(CLAVE_REGISTRADOS)) ?? [];
    } catch {
        return [];
    }
}

function guardarRegistrados() {
    try {
        sessionStorage.setItem(CLAVE_REGISTRADOS, JSON.stringify(registrados));
    } catch {
        // sin almacenamiento: el médico registrado vive solo mientras la página siga abierta
    }
}

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

async function cargarJSON() {
    if (cacheMedicos) return cacheMedicos;

    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

    registrados = leerRegistrados();
    cacheMedicos = [...(await respuesta.json()).medicos, ...registrados];
    return cacheMedicos;
}

// ----- Reglas del documento "Diseño de datos" (paso 6) -----
// Con la API real, el servidor debe repetirlas.

const vacio = (valor) => String(valor ?? '').trim() === '';
const EFIRMA_VALIDA = /^\d{20}$/;                        // número de certificado de la e.firma: 20 dígitos
const USUARIO_VALIDO = /^\S{3,30}$/;                     // sin espacios
const clavePermitida = (clave) => String(clave ?? '').length >= 8 && /[A-Za-z]/.test(clave) && /\d/.test(clave);

const invalido = (campo, message) => ({ success: false, codigo: 'DATO_INVALIDO', campo, message });

/**
* Registra un médico nuevo. Responde { success: true, medico } o { success: false, codigo, campo?, message }.
* Reglas: nombre, apellidos y ciudad no vacíos; usuario único y sin espacios; contraseña válida
* (8 caracteres o más, con letras y números); e-firma válida (20 dígitos).
*/
export async function crearMedico(datos) {
    if (USAR_API) {
        const respuesta = await fetch(URL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        return respuesta.json();
    }

    await esperar(300);

    for (const campo of ['nombre', 'apellidos', 'ciudad']) {
        if (vacio(datos[campo])) return invalido(campo, 'El nombre, los apellidos y la ciudad no pueden quedar vacíos.');
    }

    const usuario = String(datos.usuario ?? '').trim();
    if (!USUARIO_VALIDO.test(usuario)) return invalido('usuario', 'El usuario debe tener de 3 a 30 caracteres, sin espacios.');

    const lista = await cargarJSON();
    if (lista.some(m => m.usuario.toLowerCase() === usuario.toLowerCase())) {
        return { success: false, codigo: 'USUARIO_DUPLICADO', campo: 'usuario', message: 'Ese nombre de usuario ya está en uso.' };
    }

    if (!clavePermitida(datos.clave)) return invalido('clave', 'La contraseña debe tener al menos 8 caracteres, con letras y números.');

    const eFirma = String(datos.eFirma ?? '').trim();
    if (!EFIRMA_VALIDA.test(eFirma)) return invalido('eFirma', 'La e-firma debe ser el número de certificado de 20 dígitos.');

    const nuevo = {
        id: Math.max(0, ...lista.map(m => m.id)) + 1,
        nombre: datos.nombre.trim(),
        apellidos: datos.apellidos.trim(),
        ciudad: datos.ciudad.trim(),
        eFirma,
        usuario,
        clave: datos.clave
    };

    lista.push(nuevo);
    registrados.push(nuevo);
    guardarRegistrados();

    return { success: true, medico: { id: nuevo.id, nombre: nuevo.nombre, apellidos: nuevo.apellidos, ciudad: nuevo.ciudad } };
}

/** Lista de médicos. (Con el JSON también trae el usuario y la contraseña, que solo usa la simulación del inicio de sesión.) */
export async function obtenerMedicos() {
    if (USAR_API) {
        const respuesta = await fetch(URL_API);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }
    
    return cargarJSON();
}

/** Un médico por su id, o null si no existe. */
export async function obtenerMedico(id) {
    if (USAR_API) {
        const respuesta = await fetch(`${URL_API}/${encodeURIComponent(id)}`);
        if (respuesta.status === 404) return null;
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return respuesta.json();
    }
    
    return (await cargarJSON()).find(m => m.id === Number(id)) ?? null;
}

/**
* SOLO SIMULACIÓN: cambia los datos del médico en la lista en memoria (hasta recargar la página).
* La pantalla no la llama directo: pasa por actualizarPerfil() de sesionServicio.js,
* que se asegura de que sea el médico en sesión. Con la API, eso lo hace el servidor.
*/
export async function actualizarMedico(id, cambios) {
    const medico = (await cargarJSON()).find(m => m.id === Number(id));
    if (!medico) return null;
    
    for (const campo of CAMPOS_EDITABLES) {
        if (campo in cambios) medico[campo] = String(cambios[campo] ?? '').trim();
    }

    if (registrados.includes(medico)) guardarRegistrados();

    return medico;
}
