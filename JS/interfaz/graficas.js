// Gráficas de la vista inicial: las 5 enfermedades más comunes.
//   - Pastel:  las 5 enfermedades más diagnosticadas del año, o las 5 de un mes (selector "Periodo").
//   - Barras:  total anual por región de las 5 enfermedades del año.
//   - Líneas:  casos mensuales de esas 5 enfermedades, una línea por región.
// Los datos llegan desde tendenciasServicio.js (JSON o backend): este archivo solo dibuja.
// Chart.js se carga con un <script> clásico en index.html, antes de main.js.

import { obtenerTopEnfermedades } from '../servicios/tendenciasServicio.js';
import { USAR_API } from '../config.js';

const LIMITE = 5;

// Un color por enfermedad, el mismo en las tres gráficas para que se reconozcan entre sí
const COLORES_ENFERMEDAD = ['#a78bfa', '#fb923c', '#2dd4bf', '#e7695b', '#38bdf8'];

// Las enfermedades que son top de un mes pero no del año, y las regiones (una línea cada una)
const COLORES_EXTRA = ['#facc15', '#f472b6', '#4ade80', '#94a3b8', '#c084fc', '#fb7185', '#22d3ee', '#a3e635'];

// Las líneas de región usan colores propios (distintos a los de las enfermedades) y trazos diferentes,
// para que un mismo color no signifique una enfermedad en una gráfica y una región en otra
const COLORES_REGION = ['#e2e8f0', '#fcd34d', '#6ee7b7', '#f0abfc', '#93c5fd', '#fdba74', '#a5b4fc', '#bef264'];
const TRAZOS_REGION = [[], [6, 4], [2, 3], [10, 4, 2, 4]];

const lienzoLinea = document.getElementById('grafica-linea');
const lienzoBarras = document.getElementById('grafica-barras');
const lienzoPastel = document.getElementById('grafica-pastel');
const mensaje = document.getElementById('mensaje-graficas');
const selectorPeriodo = document.getElementById('selector-periodo');
const tituloPastel = document.getElementById('titulo-pastel');
const notaDatos = document.querySelector('.nota-datos');

function mostrarError(texto) {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.hidden = false;
}

const graficas = [];                         // para volver a dibujarlas al cambiar de tema

const colorDe = (i) => COLORES_ENFERMEDAD[i % COLORES_ENFERMEDAD.length];
const colorExtra = (i) => COLORES_EXTRA[i % COLORES_EXTRA.length];

let datos = null;                            // los últimos datos recibidos (los usan el tema, el periodo y la recarga)
let selectorListo = false;
let ultimaCarga = 0;
let pastel = null;                           // el pastel se redibuja solo al cambiar el periodo
let periodo = null;                          // null = todo el año; 0 a 11 = ese mes

// Toma los colores de la paleta CSS para que las gráficas combinen con el tema activo
function aplicarEstiloBase() {
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--color-placeholder').trim();
    Chart.defaults.borderColor = css.getPropertyValue('--color-borde').trim();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}

// Casos y color de cada porción del pastel: las 5 del año o las 5 del mes elegido.
// Una enfermedad que está entre las 5 del año conserva su color en las tres gráficas.
function porcionesDelPastel(top) {
    const delAnio = new Map(top.enfermedades.map((e, i) => [e.nombre, colorDe(i)]));

    if (periodo === null) {
        return top.enfermedades.map(e => ({ nombre: e.nombre, casos: e.total, color: delAnio.get(e.nombre) }));
    }

    let siguienteExtra = 0;
    return top.topPorMes[periodo].enfermedades.map(e => ({
        nombre: e.nombre,
        casos: e.casos,
        color: delAnio.get(e.nombre) ?? colorExtra(siguienteExtra++)
    }));
}

// Pastel: qué parte de los casos del top 5 aporta cada enfermedad
function dibujarPastel(top) {
    if (pastel) {
        graficas.splice(graficas.indexOf(pastel), 1);
        pastel.destroy();
        pastel = null;
    }

    const porciones = porcionesDelPastel(top);

    if (tituloPastel) {
        tituloPastel.textContent = periodo === null
            ? 'Distribución por enfermedad (año)'
            : `Top 5 de ${top.meses[periodo]}${porciones.length === 0 ? ': sin consultas' : ''}`;
    }
    if (porciones.length === 0) return;        // mes sin consultas: no hay nada que dibujar

    pastel = new Chart(lienzoPastel, {
        type: 'pie',
        data: {
            labels: porciones.map(p => p.nombre),
            datasets: [{
                data: porciones.map(p => p.casos),
                backgroundColor: porciones.map(p => p.color),
                borderWidth: 0,                      // sin borde entre porciones (ni al pasar el cursor)
                hoverBorderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        // Muestra casos y porcentaje de cada porción
                        label: (contexto) => {
                            const total = contexto.dataset.data.reduce((a, b) => a + b, 0);
                            const porcentaje = (contexto.parsed / total * 100).toFixed(1);
                            return ` ${contexto.label}: ${contexto.parsed.toLocaleString('es-MX')} casos (${porcentaje}%)`;
                        }
                    }
                }
            }
        }
    });
    graficas.push(pastel);
}

// Barras apiladas: casos de cada región, divididos por enfermedad
function dibujarBarras(top) {
    graficas.push(new Chart(lienzoBarras, {
        type: 'bar',
        data: {
            labels: top.regiones,
            datasets: top.enfermedades.map((e, i) => ({
                label: e.nombre,
                data: e.porRegion,
                backgroundColor: colorDe(i)
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Casos' } }
            }
        }
    }));
}

// Líneas: una por región, casos de cada mes de las enfermedades del top
function dibujarLineas(top) {
    graficas.push(new Chart(lienzoLinea, {
        type: 'line',
        data: {
            labels: top.meses,
            datasets: top.mensualPorRegion.map((r, i) => ({
                label: r.region,
                data: r.porMes,
                borderColor: COLORES_REGION[i % COLORES_REGION.length],
                backgroundColor: COLORES_REGION[i % COLORES_REGION.length],
                borderDash: TRAZOS_REGION[i % TRAZOS_REGION.length],
                tension: 0.3,
                pointRadius: 3
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,              // usa la altura del contenedor
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Casos' } } }
        }
    }));
}

function dibujarTodas(top) {
    dibujarPastel(top);
    dibujarBarras(top);
    dibujarLineas(top);
}

// Chart.js guarda los colores al crear la gráfica: al cambiar de tema hay que dibujarlas de nuevo
function redibujarAlCambiarTema() {
    new MutationObserver(() => {
        graficas.splice(0).forEach(grafica => grafica.destroy());
        pastel = null;                       // ya se destruyó junto con las demás
        aplicarEstiloBase();
        if (datos) dibujarTodas(datos);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
}

// Llena el selector "Periodo" (todo el año o un mes) y redibuja el pastel al cambiarlo
function prepararSelectorPeriodo(top) {
    if (!selectorPeriodo || selectorListo) return;
    selectorListo = true;

    selectorPeriodo.replaceChildren(new Option('Todo el año', ''));
    top.meses.forEach((mes, i) => selectorPeriodo.append(new Option(mes, String(i))));
    selectorPeriodo.hidden = false;
    selectorPeriodo.previousElementSibling?.removeAttribute('hidden');

    selectorPeriodo.addEventListener('change', () => {
        periodo = selectorPeriodo.value === '' ? null : Number(selectorPeriodo.value);
        if (datos) dibujarPastel(datos);
    });
}

// Pide los datos y dibuja (o redibuja) las tres gráficas. Devuelve false si todavía no hay nada que mostrar.
async function cargarYDibujar() {
    const top = await obtenerTopEnfermedades({ limite: LIMITE });
    ultimaCarga = Date.now();

    if (top.enfermedades.length === 0) {
        mostrarError(USAR_API
            ? 'Todavía no hay consultas registradas este año. Las gráficas aparecerán cuando las haya.'
            : 'No hay enfermedades registradas para mostrar.');
        return false;
    }

    if (mensaje) mensaje.hidden = true;
    graficas.splice(0).forEach(grafica => grafica.destroy());
    pastel = null;
    datos = top;

    prepararSelectorPeriodo(top);
    dibujarTodas(top);
    return true;
}

// Con el backend, las consultas cambian mientras se usa la aplicación: al volver a la vista inicial
// (por ejemplo, después de guardar una consulta) se actualizan las gráficas
function actualizarAlVolverAlInicio() {
    const vista = document.getElementById('vista-inicio');
    if (!vista) return;

    new MutationObserver(() => {
        const visible = vista.classList.contains('activa');
        if (!visible || Date.now() - ultimaCarga < 3000) return;

        cargarYDibujar().catch(error => console.error('No se pudieron actualizar las gráficas:', error));
    }).observe(vista, { attributes: true, attributeFilter: ['class'] });
}

async function iniciar() {
    if (!lienzoLinea || !lienzoBarras || !lienzoPastel) return;

    if (notaDatos) notaDatos.hidden = USAR_API;     // "Datos simulados" solo cuando se usan los JSON

    if (typeof Chart === 'undefined') {
        mostrarError('No se pudo cargar Chart.js. Revisa tu conexión o la etiqueta <script> del index.');
        return;
    }
    
    aplicarEstiloBase();
    
    redibujarAlCambiarTema();
    if (USAR_API) actualizarAlVolverAlInicio();

    try {
        await cargarYDibujar();
    } catch (error) {
        console.error('Error al cargar los datos de las gráficas:', error);
        mostrarError(USAR_API
            ? 'No se pudieron cargar las tendencias. Revisa que el servidor (backend) esté encendido.'
            : 'No se pudieron cargar los datos. Abre la página con Live Server y revisa la ruta del JSON.');
    }
}

iniciar();