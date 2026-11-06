// Cliente HTTP común para hablar con el backend. Lo usan todos los servicios cuando USAR_API = true.
//
// Sesión: el backend entrega un token JWT al iniciar sesión (POST /auth/login). Aquí se guarda en
// sessionStorage (cada pestaña tiene su sesión y se borra al cerrarla) y se envía en cada petición como
// "Authorization: Bearer <token>". Si el servidor responde 401 (token vencido o inválido), se borra y se
// manda al login.
//
// Los errores HTTP NO lanzan excepciones: se devuelven como { success: false, codigo, message } con la
// misma forma que usa el resto de la aplicación. Solo lanza si no hay conexión con el servidor
// (y las pantallas ya muestran "Ocurrió un problema al conectar con el servidor" en ese caso).

import { API_BASE } from '../config.js';

const CLAVE_TOKEN = 'mediapoyoToken';
const POR_PAGINA = 100;                        // máximo que acepta el backend en cada página

export const guardarToken = (token) => sessionStorage.setItem(CLAVE_TOKEN, token);
export const obtenerToken = () => sessionStorage.getItem(CLAVE_TOKEN);
export const borrarToken = () => sessionStorage.removeItem(CLAVE_TOKEN);

/**
* Hace una petición a la API y devuelve { ok, estado, datos, espera }.
*   cuerpo:     objeto que se envía como JSON
*   parametros: ?clave=valor (se omiten los vacíos)
*   conSesion:  false solo para registro e inicio de sesión
*   espera:     segundos que indica la cabecera Retry-After (límite de intentos), si vino
*/
export async function pedir(ruta, { metodo = 'GET', cuerpo, parametros = {}, conSesion = true } = {}) {
    const url = new URL(`${API_BASE}${ruta}`, window.location.origin);
    for (const [clave, valor] of Object.entries(parametros)) {
        if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(clave, valor);
    }

    const cabeceras = { Accept: 'application/json' };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

    const token = obtenerToken();
    if (conSesion && token) cabeceras.Authorization = `Bearer ${token}`;

    const respuesta = await fetch(url, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });

    let datos = null;
    const texto = await respuesta.text();
    if (texto) {
        try { datos = JSON.parse(texto); } catch { datos = null; }
    }

    if (respuesta.status === 401 && conSesion) {
        borrarToken();
        if (!window.location.pathname.endsWith('login.html')) window.location.href = 'login.html';
    }

    return {
        ok: respuesta.ok,
        estado: respuesta.status,
        datos,
        espera: Number(respuesta.headers.get('Retry-After')) || null
    };
}

// ----- Errores -----

const CODIGOS = {
    401: 'SIN_SESION',
    403: 'SIN_PERMISO',
    404: 'NO_ENCONTRADO',
    409: 'CONFLICTO',
    422: 'DATO_INVALIDO',
    429: 'DEMASIADOS_INTENTOS',
    503: 'NO_DISPONIBLE'
};

// Nombre de cada campo del backend tal como se llama en los formularios
const CAMPOS = {
    peso: 'peso', altura: 'altura', enfermedad_id: 'enfermedad', paciente_id: 'paciente',
    curp: 'curp', fecha_nacimiento: 'nacimiento', numero_telefonico: 'telefono'
};

const ETIQUETAS = {
    peso: 'Peso', altura: 'Altura', enfermedad_id: 'Enfermedad', curp: 'CURP', nombre: 'Nombre',
    apellidos: 'Apellidos', fecha_nacimiento: 'Fecha de nacimiento', numero_telefonico: 'Teléfono',
    sexo: 'Sexo', tipo_de_sangre: 'Tipo de sangre', notas: 'Notas', ciudad: 'Ciudad', efirma: 'e.firma',
    nombre_de_usuario: 'Usuario', password: 'Contraseña', fecha_cita: 'Fecha', hora_cita: 'Hora'
};

const campoDe = (error) => error?.loc?.[error.loc.length - 1];

/** Texto para mostrar al usuario a partir de la respuesta de error del backend. */
export function mensajeDe(resp, porDefecto) {
    const detalle = resp.datos?.detail;

    if (typeof detalle === 'string') return detalle;

    if (Array.isArray(detalle) && detalle.length > 0) {
        const campo = campoDe(detalle[0]);
        const texto = String(detalle[0].msg ?? '').replace(/^Value error, /, '');
        return ETIQUETAS[campo] ? `${ETIQUETAS[campo]}: ${texto}` : texto || porDefecto;
    }

    if (detalle && typeof detalle === 'object' && detalle.mensaje) {
        return detalle.sintomas?.length ? `${detalle.mensaje}: ${detalle.sintomas.join(', ')}` : detalle.mensaje;
    }

    return porDefecto;
}

/**
* Convierte una respuesta de error en { success: false, codigo, message, campo? }.
*   porDefecto: mensaje si el servidor no dio uno legible
*   codigo:     fuerza un código propio (si no, sale del estado HTTP)
*/
export function falla(resp, porDefecto, codigo) {
    const resultado = {
        success: false,
        codigo: codigo ?? CODIGOS[resp.estado] ?? 'ERROR_SERVIDOR',
        message: resp.estado === 401 ? 'Tu sesión terminó. Vuelve a iniciar sesión.' : mensajeDe(resp, porDefecto)
    };

    const campo = Array.isArray(resp.datos?.detail) ? CAMPOS[campoDe(resp.datos.detail[0])] : undefined;
    if (campo) resultado.campo = campo;
    return resultado;
}

// ----- Listas paginadas -----

/** Trae todas las páginas de una lista del backend ({ items, total, limit, offset }) y devuelve los items. */
export async function traerTodas(ruta, parametros = {}) {
    const items = [];

    for (let offset = 0; ; offset += POR_PAGINA) {
        const resp = await pedir(ruta, { parametros: { ...parametros, limit: POR_PAGINA, offset } });
        if (!resp.ok) throw new Error(mensajeDe(resp, `HTTP ${resp.estado}`));

        items.push(...resp.datos.items);
        if (resp.datos.items.length === 0 || items.length >= resp.datos.total) return items;
    }
}
