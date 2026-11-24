// Servicio de sesión: iniciar y cerrar sesión, registrar médicos y guardar los datos del médico actual
import { pedir, falla, guardarToken, obtenerToken, borrarToken } from './api.js';

// Datos del médico que inició sesión, guardados aquí para no pedirlos al servidor cada vez
let medicoEnMemoria = null;

// Se queda solo con los datos que la página necesita del médico (descarta el resto)
const publico = ({ id, nombre, apellidos, ciudad }) => ({ id, nombre, apellidos, ciudad });

// Pide al servidor los datos del médico dueño del token; null si el token ya no sirve (401)
async function medicoDelServidor() {
    const resp = await pedir('/auth/me');
    if (resp.estado === 401) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);

    medicoEnMemoria = publico(resp.datos); // lo guarda para la próxima vez
    return medicoEnMemoria;
}

// Inicia sesión: manda usuario y contraseña, y si son correctos guarda el token que devuelve el servidor
export async function iniciarSesion(usuario, clave) {
    const login = await pedir('/auth/login', {
        metodo: 'POST',
        conSesion: false, // todavía no hay token que enviar
        datosUser: { nombre_de_usuario: usuario.trim(), password: clave } // trim quita espacios sobrantes del usuario
    });

    if (!login.ok) {
        // un solo mensaje para usuario o contraseña mal: así no se revela cuál de los dos falló
        if (login.estado === 401) {
            return { success: false, codigo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos.' };
        }
        return falla(login, 'No se pudo iniciar sesión.');
    }

    guardarToken(login.datos.access_token); // desde aquí todas las peticiones llevarán el token
    const medico = await medicoDelServidor(); // con el token ya guardado, pide los datos del médico
    return medico
        ? { success: true, medico }
        : { success: false, message: 'No se pudo cargar tu perfil. Intenta de nuevo.' };
}

// Devuelve el médico actual: null si no hay sesión; si no está en memoria (p. ej. al recargar), lo pide al servidor
export async function obtenerMedicoActual() {
    if (!obtenerToken()) return null;
    return medicoEnMemoria ?? medicoDelServidor();
}

// Guarda cambios del perfil (PATCH: solo se envían los campos que cambiaron) y actualiza la memoria
export async function actualizarPerfil(cambios) {
    const resp = await pedir('/auth/me', { metodo: 'PATCH', datosUser: cambios });
    if (!resp.ok) return falla(resp, 'No se pudo guardar el perfil.');

    medicoEnMemoria = publico(resp.datos);
    return { success: true, medico: medicoEnMemoria };
}

// Cierra sesión: borra el token y los datos en memoria (el token ya no se vuelve a enviar)
export async function cerrarSesion() {
    borrarToken();
    medicoEnMemoria = null;
}

// Crea la cuenta de un médico nuevo (no lleva token porque aún no tiene sesión)
export async function registrarMedico({ nombre, apellidos, ciudad, efirma, usuario, clave }) {
    const resp = await pedir('/auth/registro', {
        metodo: 'POST',
        conSesion: false,
        datosUser: {
            nombre, apellidos, ciudad, efirma,
            nombre_de_usuario: usuario.trim(), // el servidor usa estos nombres: nombre_de_usuario y password
            password: clave
        }
    });

    if (resp.ok) return { success: true };
    if (resp.estado === 409) { // 409: ese nombre de usuario ya existe
        return { success: false, codigo: 'USUARIO_DUPLICADO', message: 'Ese nombre de usuario ya está en uso. Elige otro.' };
    }
    return falla(resp, 'No se pudo crear la cuenta.');
}
