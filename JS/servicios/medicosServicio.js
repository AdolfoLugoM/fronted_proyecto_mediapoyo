// Capa de acceso a datos de los médicos.
// HOY lee datos/medicos.json; MAÑANA llama a la API (USAR_API = true).

// En la base de datos: tabla "medico" (id, nombre, apellidos, ciudad, efirma, contraseña con hash).
// El correo y la contraseña nunca deben viajar al navegador.

const USAR_API = false;
const URL_JSON = 'JSON/medicos.json';     // ruta relativa a index.html y a login.html
const URL_API = '/api/medicos';

// Lo único que un médico puede cambiar de su perfil desde la app.
// El correo y la contraseña necesitan su propio proceso (confirmando la contraseña actual),
// y el consultorio no lo decide el médico.

const CAMPOS_EDITABLES = ['nombre', 'apellidos'];

let cacheMedicos = null;

async function cargarJSON() {
    if (cacheMedicos) return cacheMedicos;
    
    const respuesta = await fetch(URL_JSON);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    
    cacheMedicos = (await respuesta.json()).medicos;
    return cacheMedicos;
}

/** Lista de médicos. (Con el JSON también trae el correo, que solo usa la simulación del inicio de sesión.) */
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
* SOLO SIMULACIÓN: cambia la contraseña en la lista en memoria (hasta recargar la página).
* La verificación de la contraseña actual la hace cambiarClave() de sesionServicio.js.
* Con la API, el servidor guarda el hash de la nueva, nunca el texto.
*/
export async function actualizarClaveMedico(id, clave) {
    const medico = (await cargarJSON()).find(m => m.id === Number(id));
    if (!medico) return null;
    
    medico.clave = clave;
    return medico;
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
    
    return medico;
}
