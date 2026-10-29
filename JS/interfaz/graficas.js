// Gráficas de la vista inicial: top 5 de enfermedades más comunes.
// Los datos llegan desde tendenciasServicio.js (hoy un JSON, mañana la API): este archivo solo dibuja.
// Chart.js se carga con un <script> clásico en index.html, antes de main.js.

import { obtenerTopEnfermedades } from '../servicios/tendenciasServicio.js';

const LIMITE = 5;

// Un color por enfermedad, el mismo en las tres gráficas para que se reconozcan entre sí
const COLORES_ENFERMEDAD = ['#a78bfa', '#fb923c', '#2dd4bf', '#e7695b', '#38bdf8'];

const lienzoLinea = document.getElementById('grafica-linea');
const lienzoBarras = document.getElementById('grafica-barras');
const lienzoPastel = document.getElementById('grafica-pastel');
const mensaje = document.getElementById('mensaje-graficas');

function mostrarError(texto) {
    if (!mensaje) return;
    mensaje.textContent = texto;
    mensaje.hidden = false;
}

const graficas = [];                         // para volver a dibujarlas al cambiar de tema

const colorDe = (i) => COLORES_ENFERMEDAD[i % COLORES_ENFERMEDAD.length];

// Toma los colores de la paleta CSS para que las gráficas combinen con el tema activo
function aplicarEstiloBase() {
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.color = css.getPropertyValue('--color-placeholder').trim();
    Chart.defaults.borderColor = css.getPropertyValue('--color-borde').trim();
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
}

// Pastel: qué parte de los casos del top 5 aporta cada enfermedad
function dibujarPastel(top) {
    graficas.push(new Chart(lienzoPastel, {
        type: 'pie',
        data: {
            labels: top.enfermedades.map(e => e.nombre),
            datasets: [{
                data: top.enfermedades.map(e => e.total),
                backgroundColor: top.enfermedades.map((_, i) => colorDe(i)),
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

// Líneas: una por enfermedad, casos de cada mes sumando todas las regiones
function dibujarLineas(top) {
    graficas.push(new Chart(lienzoLinea, {
        type: 'line',
        data: {
            labels: top.meses,
            datasets: top.enfermedades.map((e, i) => ({
                label: e.nombre,
                data: e.porMes,
                borderColor: colorDe(i),
                backgroundColor: colorDe(i),
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
function redibujarAlCambiarTema(top) {
    new MutationObserver(() => {
        graficas.splice(0).forEach(grafica => grafica.destroy());
        aplicarEstiloBase();
        dibujarTodas(top);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
}

async function iniciar() {
    if (!lienzoLinea || !lienzoBarras || !lienzoPastel) return;
    
    if (typeof Chart === 'undefined') {
        mostrarError('No se pudo cargar Chart.js. Revisa tu conexión o la etiqueta <script> del index.');
        return;
    }
    
    aplicarEstiloBase();
    
    try {
        const top = await obtenerTopEnfermedades({ limite: LIMITE });
        
        if (top.enfermedades.length === 0) {
            mostrarError('No hay enfermedades registradas para mostrar.');
            return;
        }
        
        dibujarTodas(top);
        redibujarAlCambiarTema(top);
    } catch (error) {
        console.error('Error al cargar los datos de las gráficas:', error);
        mostrarError('No se pudieron cargar los datos. Abre la página con Live Server y revisa la ruta del JSON.');
    }
}

iniciar();