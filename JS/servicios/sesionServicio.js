// Sesión: quién es el médico que está usando el sistema.

// IMPORTANTE: con el JSON de pruebas, el navegador "decide" quién es el médico (lo guarda en sessionStorage)
// y compara la contraseña contra el texto del JSON. Eso solo sirve para probar. Con servidor real, la identidad
// vive en una cookie de sesión que el navegador no puede modificar (HttpOnly), y el servidor compara la
// contraseña contra el hash guardado y decide, en cada petición, qué puede hacer cada médico.

import { obtenerMedicos, obtenerMedico, actualizarMedico, actualizarClaveMedico } from './medicosServicio.js';

const USAR_API = false;
const URL_API = '/api/sesion';
const CLAVE_ALMACEN = 'medicoSesionId';     // sessionStorage: cada pestaña tiene su propia sesión

const esperar = (ms) => new Promise(resolver => setTimeout(resolver, ms));

// Solo lo que la aplicación necesita saber del médico (nunca la contraseña).
// consultorioId decide qué pacientes e historiales ve sin pedir permiso.

const publico = ({ id, nombre, apellidos, consultorioId }) => ({ id, nombre, apellidos, consultorioId });

/** Inicia sesión. Responde { success: true, medico } o { success: false, message }. */
export async function iniciarSesion(usuario, clave) {
    if (USAR_API) {
        const respuesta = await fetch(URL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, clave })
        });
        return respuesta.json();
    }
    
    await esperar(300);
    
    const buscado = usuario.trim().toLowerCase();
    const medico = (await obtenerMedicos()).find(m => m.usuario.toLowerCase() === buscado);
    
    // Mensaje genérico: no revela si lo que falló fue el usuario o la contraseña
    if (!medico || medico.clave !== clave) return { success: false, message: 'Usuario o contraseña incorrectos.' };  
    
    sessionStorage.setItem(CLAVE_ALMACEN, String(medico.id));
    return { success: true, medico: publico(medico) };
}

/** Médico con sesión iniciada, o null si no hay. */
export async function obtenerMedicoActual() {
    if (USAR_API) {
        const respuesta = await fetch(URL_API);
        if (respuesta.status === 401) return null;
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        return (await respuesta.json()).medico ?? null;
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
        const respuesta = await fetch(`${URL_API}/perfil`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cambios)
        });
        if (respuesta.status === 401) {
            return { success: false, codigo: 'SIN_SESION', message: 'Tu sesión terminó. Vuelve a iniciar sesión.' };
        }
        return respuesta.json();
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

const SIN_SESION = { success: false, codigo: 'SIN_SESION', message: 'Tu sesión terminó. Vuelve a iniciar sesión.' };
const MIN_CLAVE = 8;

// Envía el cambio de contraseña al servidor con la misma forma de respuesta
async function enviarCambioCuenta(ruta, cuerpo) {
    const respuesta = await fetch(`${URL_API}/${ruta}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
    });
    if (respuesta.status === 401) return SIN_SESION;
    return respuesta.json();
}

/**
* Cambia la contraseña del médico en sesión. Basta con tener la sesión iniciada.
* Responde { success: true } o { success: false, codigo, message, campo? }.
* Con el servidor real: tomar al médico de la cookie de sesión, guardar la nueva con hash (bcrypt/argon2)
* y cerrar las demás sesiones abiertas de ese médico.
*/
export async function cambiarClave(claveNueva) {
    if (USAR_API) return enviarCambioCuenta('clave', { claveNueva });
    
    await esperar(300);
    
    const id = sessionStorage.getItem(CLAVE_ALMACEN);
    if (!id) return SIN_SESION;
    
    if (!claveNueva || claveNueva.length < MIN_CLAVE) {
        return { success: false, codigo: 'CLAVE_CORTA', message: `La contraseña nueva debe tener al menos ${MIN_CLAVE} caracteres.`, campo: 'clave-nueva' };
    }
    
    const yo = await obtenerMedico(id);
    if (!yo) return SIN_SESION;
    
    if (yo.clave === claveNueva) {
        return { success: false, codigo: 'MISMA_CLAVE', message: 'La contraseña nueva debe ser distinta de la actual.', campo: 'clave-nueva' };
    }
    
    await actualizarClaveMedico(yo.id, claveNueva);
    return { success: true };
}

/** Cierra la sesión. */
export async function cerrarSesion() {
    if (USAR_API) {
        await fetch(URL_API, { method: 'DELETE' });
        return;
    }
    
    sessionStorage.removeItem(CLAVE_ALMACEN);
}
