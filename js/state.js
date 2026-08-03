// state.js — Estado global compartido (sin dependencias)
// Solo contiene lo que MÚLTIPLES módulos necesitan.
// El estado de formularios (VF, CF, AF, REMF, AFB, AUX_*) vive dentro de
// cada módulo dueño, ya que no se comparte.

// Estado de datos principal. Sus propiedades se mutan (S.ventas=[...]);
// el objeto en sí nunca se reasigna, así que funciona como export const.
export const S={
  empresa:{anio:new Date().getFullYear(),nombre:'',rut:'',domicilio:'',giro:'',codigo:'',ciudad:'',comuna:'',rep:'',rutrep:''},
  ventas:[],
  compras:[],
  honorarios:[],
  asientos:[],
  activos:[],
  trabajadores:[],
  centros:[],       // centros de costo (predios y cuarteles)
  comprobantesTipo:[], // plantillas de asientos recurrentes
  cierresCC:[],     // cierres mensuales de costos ya ejecutados
  apertura:null
};

// Estado de autenticación. Objeto contenedor (sus props se mutan: AUTH.user=...).
// Vive en state (capa base) para que logAccion y otros lo lean sin depender de auth.js,
// evitando ciclos auth<->audit.
export const AUTH={
  user:null,          // {email, nombre, foto, rol, permisos, activo}
  ready:false,
  auth:null           // instancia firebase.auth()
};

// Sección de navegación actual. Se accede/reasigna vía funciones para
// permitir que otros módulos lo lean y lo cambien.
let _curSec='empresa';
export const getCurSec=()=>_curSec;
export const setCurSec=s=>{_curSec=s;};
