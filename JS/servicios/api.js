/* Funciones para interactuar con la API del backend */
import { API_BASE } from '../conexionBackend.js'; // Importa la constante API_BASE desde el archivo conexionBackend.js

const CLAVE_TOKEN = 'mediapoyoToken'; // Nombre de la casilla de sessionStorage donde se guarda el token
const POR_PAGINA = 100; // Numero de elementos por página para la paginacion de resultados (máximo que acepta el backend)

export const guardarToken = (token) => sessionStorage.setItem(CLAVE_TOKEN, token); // Funcion para guardar el token en sessionStorage
export const obtenerToken = () => sessionStorage.getItem(CLAVE_TOKEN); // Funcion para obtener el token desde sessionStorage
export const borrarToken = () => sessionStorage.removeItem(CLAVE_TOKEN); // Funcion para borrar el token desde sessionStorage

// Funcion para realizar peticiones a la API del backend
export async function pedir(ruta, { metodo = 'GET', datosUser, parametros = {}, conSesion = true } = {}) { 
    
    const url = new URL(`${API_BASE}${ruta}`, window.location.origin); // Armar la direccion de la peticion
    
    for (const [clave, valor] of Object.entries(parametros)) { // Separa 'parametros' en dos variables: 'clave' y 'valor' 
        if (valor !== undefined && valor !== null && valor !== '') url.searchParams.set(clave, valor); // Si el 'valor' no esta vacio se añade a la url
    } // Si 'valor' esta vacio, no se agrega
    
    // Avisos para que el servidor sepa como leer la peticion y que esperar de ella
    const avisos = { Accept: 'application/json' }; // 'Accept:' es lo que acepto de vuelta, un JSON
    if (datosUser !== undefined) avisos['Content-Type'] = 'application/json'; // Content-Type significa “el tipo de contenido que te mando”
    
    // Decide que lleva cada peticion, no todo requiere el token
    const token = obtenerToken(); // Lee el token
    if (conSesion && token) avisos.Authorization = `Bearer ${token}`; // Si la petición requiere sesión y hay token guardado, lo agrega a los avisos
    
    // Es la función del navegador que envía una petición por internet y recibe la respuesta
    const respuesta = await fetch(url, { // recibe dos cosas: a donde va (url) y qué lleva la peticion
        method: metodo,
        headers: avisos,
        body: datosUser === undefined ? undefined : JSON.stringify(datosUser) // pregunta si hay datos, si los hay los convierte a json sino no manda nada al body
    });
    
    // Crea la variable donde se guardara la respuesta convertida
    let datos = null;
    
    // Lee la respuesta del servidor como texto
    const texto = await respuesta.text();
    
    // Convierte el texto de la respuesta en un objeto de JavaScript para poder usarlo.
    // Si el texto no es JSON válido, el catch evita que se caiga la función y deja datos en null.
    if (texto) {
        try {
            datos = JSON.parse(texto);
        } catch {
            datos = null;
        }
    }
    
    // Esta condicion maneja el caso de que el servidor rechace la sesion
    if (respuesta.status === 401 && conSesion) {
        borrarToken(); // Borra el token
        
        //  Si no está ya en el login, lo redirige (así no se queda en un bucle)
        if (!window.location.pathname.endsWith('login.html')) window.location.href = 'login.html'; 
    }
    
    // Es el resultado empaquetado en un solo objeto
    return {
        ok: respuesta.ok, // si el servidor respondio con exito 
        estado: respuesta.status, // el codigo de estado
        datos, // la respuesta ya cinvertida a objeto
        espera: Number(respuesta.headers.get('Retry-After')) || null // segundos que pide esperar el servidor tras demasiados intentos fallidos (429); null si no pidió nada
    };
}

// codigos que facilian la toma de decision
const CODIGOS = {
    401: 'SIN_SESION',
    403: 'SIN_PERMISO',
    404: 'NO_ENCONTRADO',
    409: 'CONFLICTO',
    422: 'DATO_INVALIDO',
    429: 'DEMASIADOS_INTENTOS',
    503: 'NO_DISPONIBLE'
};

// traduce el nombre del campo del backend al del formulario, para saber cuál marcar
const CAMPOS = {
    peso: 'peso', 
    altura: 'altura', 
    enfermedad_id: 'enfermedad', 
    paciente_id: 'paciente',
    curp: 'curp', 
    fecha_nacimiento: 'nacimiento', 
    numero_telefonico: 'telefono'
};

// traduce el nombre del campo del backend a un texto legible para el mensaje de error
const ETIQUETAS = {
    peso: 'Peso', 
    altura: 'Altura', 
    enfermedad_id: 'Enfermedad', 
    curp: 'CURP', 
    nombre: 'Nombre',
    apellidos: 'Apellidos', 
    fecha_nacimiento: 'Fecha de nacimiento', 
    numero_telefonico: 'Teléfono',
    sexo: 'Sexo', 
    tipo_de_sangre: 'Tipo de sangre', 
    notas: 'Notas', 
    ciudad: 'Ciudad', 
    efirma: 'e.firma',
    nombre_de_usuario: 'Usuario', 
    password: 'Contraseña', 
    fecha_cita: 'Fecha', 
    hora_cita: 'Hora'
};

// función que saca el nombre del campo que falló de un error del servidor
const campoDe = (error) => error?.loc?.[error.loc.length - 1];

// saca un texto legible para el usuario a partir de la respuesta de error del servidor
export function mensajeDe(resp, porDefecto) {
    const detalle = resp.datos?.detail;
    
    // condicion que cubre el error 500 que puede contener informacion interna y en cambio muestra un error generico 
    if (resp.estado >= 500) {
        console.error(`Error del servidor (HTTP ${resp.estado}):`, detalle ?? resp.datos);
        return porDefecto;
    }
    
    //  si es un texto, lo devuelve tal cual; si no, pasa a la siguiente revisión
    if (typeof detalle === 'string') return detalle;
    
    // si es una lista de errores de validación, arma "Campo: explicación" con el primero
    if (Array.isArray(detalle) && detalle.length > 0) {
        const campo = campoDe(detalle[0]);
        const texto = String(detalle[0].msg ?? '').replace(/^Value error, /, '');
        return ETIQUETAS[campo] ? `${ETIQUETAS[campo]}: ${texto}` : texto || porDefecto;
    }
    
    // si es un objeto con 'mensaje', lo devuelve (y agrega los síntomas si los hay)
    if (detalle && typeof detalle === 'object' && detalle.mensaje) {
        return detalle.sintomas?.length ? `${detalle.mensaje}: ${detalle.sintomas.join(', ')}` : detalle.mensaje;
    }
    
    // el mensaje de respaldo
    return porDefecto;
}

// convierte una respuesta de error del servidor en el objeto de error que usa toda la pagina
export function falla(resp, porDefecto, codigo) {
    const resultado = {
        success: false,
        codigo: codigo ?? CODIGOS[resp.estado] ?? 'ERROR_SERVIDOR',
        message: resp.estado === 401 ? 'Tu sesión terminó. Vuelve a iniciar sesión.' : mensajeDe(resp, porDefecto)
    };
    // Si detail es una lista (errores de validación), saca el nombre del campo del primer error con campoDe y lo traduce con CAMPOS ('numero_telefonico' → 'telefono')
    const campo = Array.isArray(resp.datos?.detail) ? CAMPOS[campoDe(resp.datos.detail[0])] : undefined;
    if (campo) resultado.campo = campo;
    return resultado;
}

// pide una lista completa al servidor, página por página, y devuelve todos los elementos juntos
export async function traerTodas(ruta, parametros = {}) {
    const items = []; // lista vacía donde se irán juntando los elementos de todas las páginas
    
    for (let offset = 0; ; offset += POR_PAGINA) { // pide una página: agrega 'limit' y 'offset' a los parámetros que ya traía
        const resp = await pedir(ruta, { parametros: { ...parametros, limit: POR_PAGINA, offset } });
        if (!resp.ok) throw new Error(mensajeDe(resp, `HTTP ${resp.estado}`)); // si falla una página lanza error, porque una lista incompleta no sirve
        
        items.push(...resp.datos.items);// agrega los elementos de esta página a la lista
        // termina si la página vino vacía o si ya se juntaron todos los que dice el servidor (total)
        if (resp.datos.items.length === 0 || items.length >= resp.datos.total) return items;
    }
}
