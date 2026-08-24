// impresion.js
import {S, getCurSec} from './state.js';
import {empresaActiva, marcoInfo} from './empresas.js';

// ═══ IMPRESIÓN FORMATO OFICIAL ═══
// Rellena el encabezado oficial antes de imprimir según la sección activa.
const TITULOS_SEC={
  diario:'Libro Diario',mayor:'Libro Mayor',balance:'Balance General',
  resultados:'Estado de Resultados',ventas:'Libro de Ventas',compras:'Libro de Compras',
  honorarios:'Libro de Honorarios',flujocaja:'Flujo de Caja',conciliacion:'Conciliación Bancaria',
  f29:'Formulario 29',ppm:'Pago Provisional Mensual',auxiliares:'Libro Auxiliar',
  remuneraciones:'Libro de Remuneraciones',activofijo:'Registro de Activo Fijo',
  cierre:'Cierre del Ejercicio',provisiones:'Provisiones',pdc:'Plan de Cuentas',
  apertura:'Balance de Apertura',indicadores:'Indicadores',correccion:'Corrección Monetaria'
};
function prepararImpresion(){
  const e=S.empresa||{};
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||'';};
  set('ph-empresa',e.nombre||'(Empresa sin configurar)');
  set('ph-rut',e.rut?'RUT: '+e.rut:'');
  set('ph-giro',e.giro||'');
  // getCurSec() es una función: antes se leía `curSec` a secas, que no existe.
  // El error reventaba el manejador de beforeprint justo aquí, así que el
  // encabezado oficial salía sin título, sin período y sin fecha de emisión.
  set('ph-titulo',TITULOS_SEC[getCurSec()]||'Reporte');
  const emp=empresaActiva();
  const marcoNm=emp?marcoInfo(emp.marco).nm:'';
  set('ph-periodo','Ejercicio '+(e.anio||new Date().getFullYear())+(marcoNm?' · '+marcoNm:''));
  const hoy=new Date();
  set('ph-fecha','Emitido: '+hoy.toLocaleDateString('es-CL')+' '+hoy.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}));
}
window.addEventListener('beforeprint',prepararImpresion);


export {TITULOS_SEC, prepararImpresion};
