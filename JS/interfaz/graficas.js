// Gráficas de la vista inicial: las 5 enfermedades más comunes.
//   - Pastel:  las 5 enfermedades más diagnosticadas del año (siempre por año).
//   - Barras:  total anual por región de las 5 enfermedades del año.
//   - Líneas:  casos mensuales de esas 5 enfermedades, una línea por región.
// Los datos llegan desde tendenciasServicio.js (JSON o backend): este archivo solo dibuja.
// Chart.js se carga con un <script> clásico en index.html, antes de main.js.

import { obtenerTopEnfermedades } from '../servicios/tendenciasServicio.js';
import { USAR_API } from '../config.js';

const LIMITE = 5;

// Un color por enfermedad, el mismo en las tres gráficas para que se reconozcan entre sí
const COLORES_ENFERMEDAD = ['#a78bfa', '#fb923c', '#2dd4bf', '#e7695b', '#38bdf8'];

// Las líneas de región usan colores propios (distintos a los de las enfermedades) y trazos diferentes,
// para que un mismo color no signifique una enfermedad en una gráfica y una región en otra
const COLORES_REGION = ['#e2e8f0', '#fcd34d', '#6ee7b7', '#f0abfc', '#93c5fd', '#fdba74', '#a5b4fc', '#bef264'];
const TRAZOS_REGION = [[], [6, 4], [2, 3], [10, 4, 2, 4]];

const lienzoLinea = document.getElementById('grafica-linea');
const lienzoBarras = document.getElementById('grafica-barras');
const lienzoPastel = document.getElementById('grafica-pastel');
const mensaje = document.getElementById('mensaje-graficas');
const notaDatos = document.querySelector('.nota-datos');

function mostrarError(texto) {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.hidden = false;
}

const graficas = [];                         // para volver a dibujarlas al cambiar de tema

const colorDe = (i) => COLORES_ENFERMEDAD[i % COLORES_ENFERMEDAD.length];

let datos = null;                            // los últimos datos recibidos (los usan el tema y la recarga)
let ultimaCarga = 0;

// Toma los colores de la paleta CSS para que las gráficas combinen con el tema activo
function aplicarEstiloBase() {
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--color-placeholder').trim();
    Chart.defaults.borderColor = css.getPropertyValue('--color-borde').trim();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}

// Pastel: qué parte de los casos del top 5 del año aporta cada enfermedad
function dibujarPastel(top) {
    const porciones = top.enfermedades.map((e, i) => ({ nombre: e.nombre, casos: e.total, color: colorDe(i) }));

    graficas.push(new Chart(lienzoPastel, {
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
    }));
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
        aplicarEstiloBase();
        if (datos) dibujarTodas(datos);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
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
    datos = top;

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