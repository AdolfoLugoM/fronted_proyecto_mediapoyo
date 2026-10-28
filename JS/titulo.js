import { irAlInicio } from './vistas.js';

// Los dos títulos "MediApoyo" (sidebar y body) regresan a la vista inicial
document.querySelectorAll('#titulo-sidebar, #titulo-body').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('formulario-paciente')?.reset(); // descarta lo escrito a medias
        irAlInicio();
    });
});