// Sesión: quién es el médico que está usando el sistema.

// IMPORTANTE: con el JSON de pruebas, el navegador "decide" quién es el médico (lo guarda en sessionStorage)
// y compara la contraseña contra el texto del JSON. Eso solo sirve para probar.
// Con el backend (USAR_API = true), el servidor compara la contraseña contra el hash (argon2) y entrega un
// token JWT firmado; en cada petición el servidor lo valida y decide qué puede hacer cada médico.
// Límite de intentos: tras 5 fallos seguidos el servidor responde 429 y hay que esperar (se muestra su mensaje).

import { obtenerMedicos, obtenerMedico, actualizarMedico } from './medicosServicio.js';
import { USAR_API } from '../config.js';
import { pedir, falla, guardarToken, obtenerToken, borrarToken } from './api.js';
const CLAVE_ALMACEN = 'medicoSesionId';     // sessionStorage: cada pestaña tiene su propia sesión

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

// Solo lo que la aplicación necesita saber del médico (nunca la contraseña).

const publico = ({ id, nombre, apellidos, ciudad }) => ({ id, nombre, apellidos, ciudad });

/** Inicia sesión. Responde { success: true, medico } o { success: false, message }. */
export async function iniciarSesion(usuario, clave) {
    if (USAR_API) {
        const login = await pedir('/auth/login', {
            metodo: 'POST',
            conSesion: false,
            cuerpo: { nombre_de_usuario: usuario.trim(), password: clave }
        });
        
        if (!login.ok) {
            // 401 = usuario o contraseña incorrectos (el servidor no dice cuál, y aquí tampoco);
            // 429 = demasiados intentos: se muestra el mensaje del servidor con el tiempo de espera
            if (login.estado === 401) {
                return { success: false, codigo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos.' };
            }
            return falla(login, 'No se pudo iniciar sesión.');
        }
        
        guardarToken(login.datos.access_token);
        const medico = await medicoDelServidor();
        return medico
            ? { success: true, medico }
            : { success: false, message: 'No se pudo cargar tu perfil. Intenta de nuevo.' };
    }
    
    await esperar(300);
    
    const buscado = usuario.trim().toLowerCase();
    const medico = (await obtenerMedicos()).find(m => m.usuario.toLowerCase() === buscado);
    
    // Mensaje genérico: no revela si lo que falló fue el usuario o la contraseña
    if (!medico || medico.clave !== clave) return { success: false, message: 'Usuario o contraseña incorrectos.' };  
    
    sessionStorage.setItem(CLAVE_ALMACEN, String(medico.id));
    return { success: true, medico: publico(medico) };
}

// Perfil del médico dueño del token (GET /auth/me). null si no hay sesión válida.
let medicoEnMemoria = null;

async function medicoDelServidor() {
    const resp = await pedir('/auth/me');
    if (resp.estado === 401) return null;
    if (!resp.ok) throw new Error(`HTTP ${resp.estado}`);
    
    medicoEnMemoria = { id: resp.datos.id, nombre: resp.datos.nombre, apellidos: resp.datos.apellidos, ciudad: resp.datos.ciudad };
    return medicoEnMemoria;
}

/** Médico con sesión iniciada, o null si no hay. */
export async function obtenerMedicoActual() {
    if (USAR_API) {
        if (!obtenerToken()) return null;
        return medicoEnMemoria ?? medicoDelServidor();
    }
    
    const id = sessionStorage.getItem(CLAVE_ALMACEN);
    if (!id) return null;
    
    const medico = await obtenerMedico(id);
    return medico ? publico(medico) : null;
}

/**
* Actualiza el perfil del médico EN SESIÓN (nunca el de otro: no recibe id).
* Recibe solo los campos que cambiaron: { nombre?, apellidos? }.
* Responde { success: true, medico } o { success: false, codigo, message }.
* Con la API real, el servidor toma el id de la cookie de sesión, no de lo que mande el navegador.
*/
export async function actualizarPerfil(cambios) {
    if (USAR_API) {
        // El backend todavía no tiene un endpoint para cambiar el perfil (solo GET /auth/me).
        return {
            success: false,
            codigo: 'NO_DISPONIBLE',
            message: 'Por ahora el servidor no permite cambiar el perfil.'
        };
    }
    
    await esperar(300);
    
    const id = sessionStorage.getItem(CLAVE_ALMACEN);
    if (!id) {
        return { success: false, codigo: 'SIN_SESION', message: 'Tu sesión terminó. Vuelve a iniciar sesión.' };
    }
    
    // Ningún campo puede quedar vacío
    for (const [campo, valor] of Object.entries(cambios)) {
        if (!String(valor ?? '').trim()) {
            return { success: false, codigo: 'CAMPO_VACIO', message: `El campo ${campo} no puede quedar vacío.` };
        }
    }
    
    const medico = await actualizarMedico(id, cambios);
    if (!medico) {
        return { success: false, codigo: 'NO_ENCONTRADO', message: 'No se encontró tu perfil.' };
    }
    
    return { success: true, medico: publico(medico) };
}

/** Cierra la sesión. */
export async function cerrarSesion() {
    if (USAR_API) {
        // El token es sin estado (el servidor no guarda sesiones): cerrar sesión = olvidarlo en este navegador
        borrarToken();
        medicoEnMemoria = null;
        return;
    }
    
    sessionStorage.removeItem(CLAVE_ALMACEN);
}


/**
* Crea la cuenta de un médico. Recibe { nombre, apellidos, ciudad, efirma, usuario, clave }.
* Responde { success: true } o { success: false, codigo, message }. Después hay que iniciar sesión.
* (Con el JSON de pruebas no guarda nada: la lista de médicos es un archivo fijo.)
*/
export async function registrarMedico({ nombre, apellidos, ciudad, efirma, usuario, clave }) {
    if (USAR_API) {
        const resp = await pedir('/auth/registro', {
            metodo: 'POST',
            conSesion: false,
            cuerpo: {
                nombre, apellidos, ciudad, efirma,
                nombre_de_usuario: usuario.trim(),
                password: clave
            }
        });
        
        if (resp.ok) return { success: true };
        if (resp.estado === 409) {
            return { success: false, codigo: 'USUARIO_DUPLICADO', message: 'Ese nombre de usuario ya está en uso. Elige otro.' };
        }
        return falla(resp, 'No se pudo crear la cuenta.');
    }
    
    await esperar(300);
    return { success: true };
}
