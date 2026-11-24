// Protege index.html: si no hay sesión iniciada, manda al login antes de mostrar nada.
// Solo revisa que exista el token; quien lo valida de verdad (vencido, alterado) es el servidor.
import { obtenerToken } from '../servicios/api.js';

if (!obtenerToken()) {
    // replace en vez de href: así el botón "atrás" no regresa a una página que no se puede usar
    window.location.replace('login.html');
}
