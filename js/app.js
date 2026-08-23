// app.js — Orquestador: routing, arranque y puente con el HTML.
// Importa todos los módulos, registra los callbacks de ui.js/auth.js
// y expone al scope global las funciones usadas por los onclick del HTML.

import {toast, fmtC, MESES, PDC, recalcDerivadasPDC, pn} from './core.js';
import {S, AUTH, getCurSec, setCurSec} from './state.js';
import {FS, initFirestore, logAccion} from './firebase.js';
import './storage.js';
import {registrarUI} from './ui.js';
import {initTema, cambiarTema, aplicarTema} from './tema.js';
import {EMPRESAS, MARCOS, marcoInfo, cargarEmpresas, empresaActiva, crearEmpresa,
        eliminarEmpresa, actualizarEmpresa, activarEmpresa, migrarSiHaceFalta,
        aplicarVisibilidad, puedeVerEmpresa} from './empresas.js';
import {renderEmpresas, abrirFormEmpresa, cerrarFormEmpresa, editarEmpresaCat,
        guardarEmpresaCat, seleccionarEmpresa, borrarEmpresa, onMarcoChange, onRegimenChange,
        abrirCompartir, cerrarCompartir, guardarCompartir, reclamarEmpresa,
        restaurarEmpresa} from './empresas-ui.js';

// Sistema
import {initAuth, puedeVer, puedeEditar, esAdmin, ROLES, SECCIONES, permisosDeRol,
        toggleLoginMode, submitLogin, recuperarPassword, mostrarLogin, logout,
        aplicarPermisosUI, setOnAuthReady} from './auth.js';
import {cargarUsuarios, renderUsuarios, abrirInvitarUsuario, editarUsuario,
        renderPermisosForm, cerrarUsuarioForm, guardarUsuario, aprobarUsuario,
        desactivarUsuario, US} from './usuarios.js';
import {renderAuditLog} from './audit.js';

// Configuración y datos
import {fillEmpresaForm, saveEmpresa, updateHdr, aplicarRegimenEmpresa,
        onRegimenEmpresaChange, pintarRegimen} from './empresa.js';
import {savePDC, renderPDC, abrirPdcForm, editarCuenta, cerrarPdcForm,
        guardarCuenta, eliminarCuenta, resetPDC, PF} from './pdc.js';
import {renderIndicadores, guardarIndicadores, restaurarIndicadoresDefault,
        getIndicadores, IND, actualizarDesdeBancoCentral,
        renderIUSCTabla, setIUSC, addIUSCTramo, delIUSCTramo, restaurarIUSCTabla, setIUSCPrueba} from './indicadores.js';
import {renderPrevisional, guardarPrevisional, restaurarPrevisional} from './previsional-ui.js';
import {acBuscar, acTecla, acElegir, acCerrarDif, inputCuenta, buscarCuentas, inputCC, ccAcBuscar, ccAcTecla, ccAcElegir, ccAcCerrarDif,
        axAcBuscar, axAcTecla, axAcElegir, axAcCerrar} from './buscadorcuentas.js';
import {initAvisoSalida, marcarGuardado, marcarSucio, haySinGuardar} from './salida.js';
import {initAutoguardado, actualizarBotonGuardar, guardarTodoAhora, setAutoguardado,
        setIntervaloAutoguardado, confirmarSalida, AG} from './autoguardado.js';
import {cargarFichasAux, descargarPlantillaAux, abrirImportFichas,
        initImportFichasListener, fichasAux, fichaAux} from './importadoraux.js';
import {cargarComprobantes} from './comprobantestipo.js';
import {buscarCT, cerrarBuscarCT, navCT, aplicarCT, abrirCTModal, cerrarCTModal,
        renderCTModal, setCTCuenta, setCTCampo, setCTHeader, addCTLinea, delCTLinea, nuevoCT,
        editarCT, guardarCT, borrarCT, copiarCTaEmpresa} from './comprobantestipo-ui.js';
import {cargarCentros, cargarCierresCC, ccOpts, ccNombre, costoAcumulado} from './centroscosto.js';
import {renderCentrosCosto, abrirFormCC, editarCC, cerrarFormCC, guardarCC, borrarCC,
        verDetalleCC, abrirCapitalizar, confirmarCapitalizar, onCurvaChange,
        setPct, addPctAnio, delPctAnio, onTipoCentroChange, ejecutarCierreMensual,
        revertirCierreMensual} from './centroscosto-ui.js';
import {mesOpts, mesRango, foliosMensuales, dteVentasOpts} from './helpers.js';
import {renderCargaDatos, descargarPlantillaDatos, abrirCargaDatos,
        initCargaDatosListener, CD} from './cargadatos.js';
import {renderSistema} from './sistema.js';
import {DISPOSITIVO, renombrarDispositivo} from './dispositivo.js';
import {diagnosticarSeguridad, prepararAislamiento, repararAccesos, repararDocumentos} from './seguridad.js';

// Negocio
import {renderApertura, abrirApertura, cerrarApertura, apRenderLineas, apLCd, apLRut,
        apLVal, apDelLinea, apAddLinea, apPrellenar, apUpdCuadre, guardarApertura,
        eliminarApertura, initBalanceImportListener, abrirImpBalModal, cerrarImpBalModal,
        toggleAllBal, confirmarImportBalance, renderImpBalModal,
        descargarPlantillaBalance, APF, IMB} from './apertura.js';
import {abrirAperturaAux, cerrarAperturaAux, renderAperturaAux, apxAddDoc, apxDelDoc,
        apxCampo, apxRut, apxAuxElegido, apxActualizarCuadre, guardarAperturaAux,
        descargarPlantillaAperturaAux, initAperturaAuxListener, APX} from './aperturaaux.js';
import {onMesChangeV, limpiarFiltrosV, renderVentas, abrirVF, editarVenta, cerrarVF,
        vfRutInput, vfCheckDup, vfCalcTotals, vfAutoCalc, guardarVenta, setVfCuenta,
        eliminarVenta, VF, abrirImportSIIVentas, handleFileImportVentas,
        cambiarPeriodoImportV, toggleAllImportV, aplicarCuentaATodosV,
        renderImportModalVentas, confirmarImportacionV, cerrarImportModalVentas,
        initImportListenerV, setBulkCuentaImpV,
        toggleVSel, toggleVSelAll, limpiarVSel, eliminarVSel, cambiarFPVSel, IMV} from './ventas.js';
import {onMesChangeC, limpiarFiltrosC, renderCompras, abrirCF, editarCompra, cerrarCF,
        cfRutInput, cfCheckDup, cfCalcTotals, renderDist, addDist, delDist, updCfCheck,
        guardarCompra, eliminarCompra, abrirImportSII, abrirImportModal,
        cambiarPeriodoImport, cerrarImportModal, toggleImportDoc, toggleAllImport,
        setImportCuenta, aplicarCuentaATodos, confirmarImportacion,
        initImportListener, renderImportModal, setBulkCuentaImp, setImportCC, aplicarCCATodos,
        cambiarModoImport, verDuplicadoC, renderCDupAlert,
        toggleCSel, toggleCSelAll, limpiarCSel, eliminarCSel, CF, IM} from './compras.js';
import {renderHon, uhon, addHon, delHon, saveHon} from './honorarios.js';
import {renderAsientos, abrirForm, cerrarForm, editarAsiento, duplicarAsiento,
        anularAsiento, eliminarAsiento, guardarAsiento, addLinea, delLinea, renderLineas,
        lCd, lVal, lValFmt, lValFmtBlur, lRut, toggleAs, updCuadre, limpiarFormAsiento, sigAsiento,
        abrirDteModal, cerrarDteModal, dtmGuardar, dtmRefresh, dtmCalcTotals, dtmRutInput,
        dtmCheckDup, dtmAddDist, dtmDelDist, dtmRenderDist, dtmUpdDistCheck, dtmRemover,
        quitarDte, folioPreviewDte, abrirAsientoDesde, cuentasOpts, lAuxElegido,
        proxFolioAsiento, proxFolioComprobante, migrarFoliosComprobante, AF} from './asientos.js';
import {renderActivoFijo, abrirFormAF, onCatAF, cerrarFormAF, previewAF, guardarAF,
        editarAF, eliminarAF, generarAsientoDepreciacion, AFB} from './activofijo.js';
import {renderRemuneraciones, abrirFormTrabajador, cerrarFormTrabajador, onSaludChange, onGratModoChange,
        previewLiq, guardarTrabajador, editarTrabajador, eliminarTrabajador,
        onParamRem, verLiquidacion, generarAsientoRemuneraciones, REMF} from './remuneraciones.js';
import {cargarLibroRem, libroDelMes, renderLibroRem, setRemView, getRemView, tabsRemuneraciones,
        cerrarMesRem, reabrirMesRem, exportarLibroRemExcel} from './libroremuneraciones.js';
import {renderCierre, generarAsientoCierre, renderProvisiones, previewProvInc,
        previewProvFer, generarProvisionIncobrables, generarProvisionFeriado,
        renderCorreccion, previewCM} from './cierre.js';

// Reportes
import {genDiario, renderDiario, setDiarioQ, buildMayor, renderMayor, renderBalance,
        poblarCmpSelect, onCmpYear, renderResultados, corregirDesdeDiario, editarAsientoRef,
        onDiarioMes, setDiarioFecha, limpiarFiltrosDiario, exportarDiarioExcel,
        onMayorMes, setMayorFecha, setMayorQ, limpiarFiltrosMayor, renderMayorTabla,
        exportarMayorExcel} from './reportes.js';
import {renderComprobantes, setCmpFiltro, limpiarCmpFiltro, toggleCmpDet, editarAsientoDesdeCmp, corregirCmp, cmpNumeroBuscar, renderCmpNumeroList, cmpNumeroElegir,
        abrirCmpModal, cerrarCmpModal, cmpModalEditar, cmpModalCancelar, cmpModalGuardar,
        eliminarComprobante, anularComprobante,
        setCmpEdGlosa, setCmpEdFecha, setCmpEdCuenta, setCmpEdCampo, setCmpEdMonto, setCmpEdMontoBlur, addCmpEdLinea, delCmpEdLinea,
        abrirCmpEdDte, cerrarCmpEdDte, setCmpDteCampo, setCmpDteRut, cmpDteAutoTotal, guardarCmpEdDte} from './comprobantes.js';
import {renderPagos, setPagTipo, setPagCampo, setPagFiltro, limpiarPagFiltro, togglePagSel, togglePagAll, setPagMontoParcial, ejecutarPago, abrirAsociarNota, cerrarAsociarNota, confirmarAsociar, quitarReferencia} from './pagos.js';
import {setAuxTab, setAuxView, setAuxQ, verTodosAux, ocultarTodosAux, toggleAux, renderAuxiliares, calcularAging,
        toggleAgingDetalle, AUX_TAB,
        abrirFichaAux, abrirFichaAuxNueva, fichaRutInput, cerrarFichaAux, setFichaCuenta, guardarFichaAuxUI} from './auxiliares.js';
// AUX_TAB también viene de auxiliares.js — se recupera desde window.
import {renderF29, renderPPM, IVAC, renderCompensacionIVA, generarAsientoIVA,
        setIvacCuenta, setIvacCampo, resetIvacCuentas, crearCuentaRemanente,
        PAGOF29, renderPagoF29, generarAsientoPagoF29, setPagoF29Cuenta, setPagoF29Campo,
        setPagoF29Monto, togglePagoF29, resetPagoF29, usarSugeridoF29} from './tributario.js';
import {renderRenta, setRentaTab, setRentaParam, restaurarTasaLegal, toggleRechazada,
        addRentaLinea, setRentaLinea, delRentaLinea, setRentaCredito, exportRentaXLSX,
        resetRenta} from './renta.js';
import {setFCView, renderFlujoCaja} from './flujocaja.js';
import {renderConciliacion, onSaldoBancoChange, toggleConciliado,
        marcarTodosConciliados, cargarCartola, autoConciliarCartola} from './conciliacion.js';
import {abrirBusqueda, cerrarBusqueda, ejecutarBusqueda, navBusqueda,
        irAResultado} from './busqueda.js';
import {prepararImpresion} from './impresion.js';
import {exportarExcelManual, conectarBD, fsBackupToCloud, fsRestoreFromCloud,
        importarExcelBD, initBDImportListener, bdRestaurarHandle, BD} from './backup.js';

// ═══ STORAGE ═══
// Guarda todo el estado en curso. `silencioso` lo usa el autoguardado para no
// llenar la pantalla de toasts. Devuelve true/false según haya podido guardar.
//
// Ojo: antes esta función empezaba con `document.querySelector('.btn-save-all').textContent=…`
// sin comprobar que el botón existiera. Al sacar el botón de la barra superior
// quedó en null y saveAll() reventaba en la primera línea sin guardar nada.
async function saveAll({silencioso=false}={}){
  const btn=document.getElementById('btn-guardar-todo');
  const rotulo=btn?btn.innerHTML:'';
  if(btn){btn.innerHTML='⏳';btn.disabled=true;}
  let ok=false;
  try{
    const y=S.empresa.anio;
    await window.storage.set('empresa',JSON.stringify(S.empresa));
    await window.storage.set('ventas-'+y,JSON.stringify(S.ventas));
    await window.storage.set('compras-'+y,JSON.stringify(S.compras));
    await window.storage.set('honorarios-'+y,JSON.stringify(S.honorarios));
    await window.storage.set('asientos-'+y,JSON.stringify(S.asientos));
    if(S.activos&&S.activos.length)await window.storage.set('activos',JSON.stringify(S.activos));
    if(S.trabajadores&&S.trabajadores.length)await window.storage.set('trabajadores',JSON.stringify(S.trabajadores));
    if(S.centros&&S.centros.length)await window.storage.set('centros',JSON.stringify(S.centros));
    if(S.cierresCC&&S.cierresCC.length)await window.storage.set('cierresCC',JSON.stringify(S.cierresCC));
    if(S.comprobantesTipo&&S.comprobantesTipo.length)await window.storage.set('comprobantesTipo',JSON.stringify(S.comprobantesTipo));
    if(S.fichasAux)await window.storage.set('fichasAux',JSON.stringify(S.fichasAux));
    ok=true;
    marcarGuardado();
    if(!silencioso)toast('✅ Todos los datos guardados');
  }catch(e){
    console.error('saveAll',e);
    toast('❌ No se pudo guardar: '+e.message,'e');   // el error se avisa siempre
  }
  if(btn){btn.disabled=false;btn.innerHTML=rotulo||'💾 Guardar';}
  actualizarBotonGuardar();
  return ok;
}
// Carga los datos del ejercicio.
//
// Cada lectura que falla se ve EXACTAMENTE igual que "no hay datos": la sección
// aparece vacía. Antes eso se tragaba en silencio (`catch(e){}`) y, al primer
// guardado, la app escribía ese vacío encima del dato bueno de la nube.
//
// Ahora se distingue el error y se registra: storage bloquea la escritura de
// esas claves y `S.cargaFallida` deja constancia para avisar en pantalla.
// Pantalla de espera del cruce: es corta, pero conviene decir qué está pasando
function pantallaCruce(txt,detalle){
  let el=document.getElementById('cruce-overlay');
  if(!el){
    el=document.createElement('div');
    el.id='cruce-overlay';
    el.style.cssText='position:fixed;inset:0;background:var(--bg,#0d1117);z-index:9000;display:flex;'+
      'flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px';
    document.body.appendChild(el);
  }
  el.innerHTML=`<div style="font-size:34px">☁️</div>
    <div style="font-size:15px;font-weight:700">${txt}</div>
    <div style="font-size:12px;color:var(--mt);font-family:var(--mono);min-height:18px">${detalle||''}</div>`;
  return el;
}
const cerrarPantallaCruce=()=>{const el=document.getElementById('cruce-overlay');if(el)el.remove();};

async function cruzarAlIniciar(){
  if(!FS.enabled){return null;}
  const claves=window.storage.clavesDeLaEmpresa(S.empresa.anio||new Date().getFullYear());
  pantallaCruce('Sincronizando con la nube…',`0 de ${claves.length}`);
  let r;
  try{
    r=await window.storage.cruzarConLaNube(claves,(hechas,total,clave)=>{
      pantallaCruce('Sincronizando con la nube…',`${hechas} de ${total} · ${clave}`);
    });
  }catch(e){
    cerrarPantallaCruce();
    console.error('Cruce con la nube:',e);
    return null;
  }
  cerrarPantallaCruce();
  if(r.fallidas.length){
    toast(`🚫 ${r.fallidas.length} registro(s) no se pudieron leer — el guardado quedó bloqueado para protegerlos`,'e');
    console.error('Cruce incompleto:',r.fallidas);
  }else if(r.actualizadas.length){
    toast(`☁️ ${r.actualizadas.length} registro(s) actualizados desde la nube`);
    console.log('Actualizados en el cruce:',r.actualizadas);
  }
  return r;
}

function renombrarEsteDispositivo(){
  const n=prompt('Nombre de este equipo\n\nSirve para reconocerlo en los avisos de cambios simultáneos.',DISPOSITIVO.nombre);
  if(n===null)return;
  if(renombrarDispositivo(n)){toast('🖥 Ahora este equipo se llama "'+DISPOSITIVO.nombre+'"');renderSistema();}
}

async function loadYear(y){
  S.ventas=[];S.compras=[];S.honorarios=[];S.asientos=[];S.apertura=null;S.activos=[];S.trabajadores=[];
  S.cargaFallida=[];
  resetRenta(); // los ajustes del F22 son por empresa+año: se recargan al entrar a la sección

  const leer=async(clave,aplicar)=>{
    const r=await window.storage.leerConEstado(clave);
    if(r.fuente==='error'){
      S.cargaFallida.push({clave,motivo:r.error});
      console.error('No se pudo cargar',clave,'—',r.error);
      return;
    }
    if(r.value==null)return;
    try{aplicar(JSON.parse(r.value));}
    catch(e){
      S.cargaFallida.push({clave,motivo:'contenido ilegible'});
      console.error('Contenido ilegible en',clave,e);
    }
  };

  for(const[k,d] of [['ventas-'+y,'ventas'],['compras-'+y,'compras'],['honorarios-'+y,'honorarios'],['asientos-'+y,'asientos']]){
    await leer(k,parsed=>{
      if(Array.isArray(parsed)&&parsed.length>0&&(d==='ventas'||d==='compras')&&parsed[0]&&'mes' in parsed[0]&&!('tipoDTE' in parsed[0])){
        S[d]=[];   // formato antiguo por mes: se ignora
      }else if(Array.isArray(parsed)){
        S[d]=parsed;
      }
    });
  }
  await leer('apertura-'+y,p=>{S.apertura=p;});
  // Activos fijos y trabajadores: claves GLOBALES de la empresa (persisten entre años)
  await leer('activos',p=>{if(Array.isArray(p))S.activos=p;});
  await leer('trabajadores',p=>{if(Array.isArray(p))S.trabajadores=p;});

  if(S.cargaFallida.length){
    toast(`🚫 No se pudieron cargar ${S.cargaFallida.length} registro(s) — el guardado quedó bloqueado para protegerlos`,'e');
  }
  try{actualizarBotonGuardar();}catch(e){}
  return S.cargaFallida;
}
async function changeYear(y){S.empresa.anio=y;await loadYear(y);rerender();}
async function init(){
  // Inicializar Firestore primero (necesario para verificar usuario)
  await initFirestore();
  // Inicializar Auth — mostrará el login si no hay sesión
  await initAuth();
  // El resto de la inicialización de la app se hace en initApp(), que se llama
  // desde verificarUsuarioAutorizado() una vez que hay usuario válido.
}

async function initApp(){
  // ── Multiempresa: migrar datos antiguos, cargar catálogo y fijar el prefijo
  // ANTES de leer cualquier dato (si no, se leería con el prefijo equivocado).
  await migrarSiHaceFalta();
  await cargarEmpresas();
  // Si el catálogo no se pudo leer, avisar fuerte y NO seguir cargando datos
  // con un prefijo equivocado (se leería vacío y parecería que no hay nada).
  if(EMPRESAS.errorCarga){
    toast('🚫 No se pudo leer el catálogo desde la nube — revisa Empresas','e');
    nav('empresas');
    return;
  }
  window.storage.setPrefijo(EMPRESAS.activa);
  renderSelectorEmpresa();

  // ── Cruce con la nube ANTES de dejar trabajar ──
  // Arrancar con una foto vieja es la causa de fondo de los conflictos y de que
  // una fusión reviva registros borrados. Este paso demora un poco la apertura
  // a cambio de que el equipo empiece sincronizado.
  await cruzarAlIniciar();

  const ys=document.getElementById('year-sel');
  const cy=new Date().getFullYear();
  for(let y=cy+1;y>=cy-5;y--){const o=document.createElement('option');o.value=y;o.textContent=y;if(y===cy)o.selected=true;ys.appendChild(o);}

  try{const r=await window.storage.get('empresa');if(r)S.empresa={...S.empresa,...JSON.parse(r.value)};}catch(e){}
  aplicarRegimenEmpresa();
  const PDC_VERSION=2;
  try{
    const vr=await window.storage.get('pdc_v');
    const savedV=vr?+vr.value:0;
    if(savedV===PDC_VERSION){
      const r=await window.storage.get('pdc');
      if(r){
        const loaded=JSON.parse(r.value);
        if(Array.isArray(loaded)&&loaded.length>0){
          PDC.length=0;loaded.forEach(c=>PDC.push(c));recalcDerivadasPDC();
        }
      }
    }else if(savedV>0){
      console.log('Plan de cuentas actualizado a v'+PDC_VERSION+' (anterior: v'+savedV+')');
      await window.storage.set('pdc',JSON.stringify(PDC));
    }
    await window.storage.set('pdc_v',String(PDC_VERSION));
  }catch(e){console.warn('Error cargando PDC:',e);}
  ys.value=S.empresa.anio;
  await loadYear(S.empresa.anio);
  await cargarCentros();await cargarCierresCC();await cargarComprobantes();await cargarFichasAux();await cargarLibroRem();
  // Migración de folios de comprobante para datos preexistentes:
  // asigna folioComp a asientos manuales, compras, ventas y apertura que no
  // lo tengan, respetando el orden cronológico.
  const migrados=migrarFoliosComprobante();
  if(migrados){
    console.log(`Migración: ${migrados} elementos recibieron folio de comprobante`);
    // Persistir los cambios de migración
    try{
      if(S.asientos?.length)await window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos));
      if(S.compras?.length)await window.storage.set('compras-'+S.empresa.anio,JSON.stringify(S.compras));
      if(S.ventas?.length)await window.storage.set('ventas-'+S.empresa.anio,JSON.stringify(S.ventas));
    }catch(e){console.warn('Error persistiendo migración de folios:',e);}
  }
  fillEmpresaForm();updateHdr();
  initImportListener();
  initImportListenerV();
  initImportFichasListener();
  initCargaDatosListener();
  initBDImportListener();
  initBalanceImportListener();
  bdStatusSet('offline');
  if(BD.supported)await bdRestaurarHandle();
  // Aplicar permisos por si el usuario no puede ver la sección actual
  aplicarPermisosUI();
}


// ═══ NAV ═══
function toggleNav(){
  const nav=document.querySelector('nav');
  const ov=document.getElementById('nav-overlay');
  const abierto=nav.classList.toggle('open');
  if(ov)ov.classList.toggle('open',abierto);
}
function cerrarNavMovil(){
  const nav=document.querySelector('nav');
  const ov=document.getElementById('nav-overlay');
  if(nav)nav.classList.remove('open');
  if(ov)ov.classList.remove('open');
}
function nav(s){
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.getElementById('s-'+s).classList.add('active');
  document.querySelector('[data-s="'+s+'"]').classList.add('active');
  setCurSec(s);renderSec(s);
  cerrarNavMovil(); // en móvil, cerrar el drawer tras elegir sección
}
function renderSec(s){
  // Verificar permiso de acceso a la sección.
  // 'empresa' y 'usuarios' se excluyen del bloqueo genérico: empresa es la landing,
  // y usuarios tiene su propio control de admin dentro de renderUsuarios().
  if(AUTH.user&&s!=='empresa'&&s!=='usuarios'&&s!=='auditlog'&&!puedeVer(s)){
    const sec=document.getElementById('s-'+s);
    if(sec)sec.innerHTML='<div class="empty"><div class="ei">🚫</div>No tienes permiso para acceder a esta sección.<br><br>Contacta a un administrador para solicitar acceso.</div>';
    return;
  }
  if(s==='empresa')fillEmpresaForm();
  else if(s==='empresas')renderEmpresas();
  else if(s==='centroscosto')renderCentrosCosto();
  else if(s==='pdc')renderPDC();
  else if(s==='cargadatos')renderCargaDatos();
  else if(s==='sistema')renderSistema();
  else if(s==='indicadores')renderIndicadores();
  else if(s==='apertura')renderApertura();
  else if(s==='usuarios')renderUsuarios();
  else if(s==='auditlog')renderAuditLog();
  else if(s==='ventas')renderVentas();
  else if(s==='compras')renderCompras();
  else if(s==='honorarios')renderHon();
  else if(s==='remuneraciones')renderRemuneraciones();
  // 'asientos' dejó de ser un módulo: los manuales viven dentro de Comprobantes.
  // Se mantiene el caso por si algún enlace viejo todavía navega ahí.
  else if(s==='asientos')renderComprobantes();
  else if(s==='auxiliares')renderAuxiliares();
  else if(s==='diario')renderDiario();
  else if(s==='mayor')renderMayor();
  else if(s==='balance')renderBalance();
  else if(s==='resultados')renderResultados();
  else if(s==='flujocaja')renderFlujoCaja();
  else if(s==='conciliacion')renderConciliacion();
  else if(s==='comprobantes')renderComprobantes();
  else if(s==='pagos')renderPagos();
  else if(s==='f29')renderF29();
  else if(s==='ppm')renderPPM();
  else if(s==='renta')renderRenta();
  else if(s==='activofijo')renderActivoFijo();
  else if(s==='provisiones')renderProvisiones();
  else if(s==='correccion')renderCorreccion();
  else if(s==='cierre')renderCierre();
}
function rerender(){updateHdr();renderSec(getCurSec());}



// ═══ MULTIEMPRESA ═══
// Selector en el header + cambio de empresa (recarga todos los datos).
function renderSelectorEmpresa(){
  const sel=document.getElementById('empresa-sel');
  if(!sel)return;
  // Si el catálogo aún no está cargado, al menos mostrar la empresa en curso
  const lista=EMPRESAS.lista.length?EMPRESAS.lista:[{id:EMPRESAS.activa||'',nombre:S.empresa.nombre||'(sin empresa)'}];
  sel.innerHTML=lista.map(e=>
    `<option value="${e.id}" ${e.id===EMPRESAS.activa?'selected':''}>${e.nombre}</option>`
  ).join('')+'<option value="__gestionar">⚙️ Gestionar empresas…</option>';
  // Nombre visible del contexto: el de la empresa activa del catálogo, y si
  // aún no hay catálogo, el de la ficha cargada.
  const ctx=document.getElementById('ctx-empresa-nombre');
  if(ctx){
    const act=EMPRESAS.lista.find(e=>e.id===EMPRESAS.activa);
    ctx.textContent=(act&&act.nombre)||S.empresa.nombre||'Configura los datos de empresa';
  }
}

async function onCambiarEmpresa(){
  const sel=document.getElementById('empresa-sel');
  const v=sel.value;
  if(v==='__gestionar'){ renderSelectorEmpresa(); nav('empresas'); return; }
  if(v===EMPRESAS.activa)return;
  await activarEmpresa(v);
  await recargarEmpresaActiva();
  const e=empresaActiva();
  toast('🏢 Empresa activa: '+(e?e.nombre:''));
}

// Recarga TODO el estado desde la empresa activa (tras cambiarla)
async function recargarEmpresaActiva(){
  // Resetear estado en memoria
  S.ventas=[];S.compras=[];S.honorarios=[];S.asientos=[];
  S.activos=[];S.trabajadores=[];S.apertura=null;
  S.empresa={...S.empresa,nombre:'',rut:'',domicilio:'',giro:'',codigo:'',ciudad:'',comuna:'',rep:'',rutrep:''};
  // Cargar datos de la nueva empresa
  try{const r=await window.storage.get('empresa');if(r)S.empresa={...S.empresa,...JSON.parse(r.value)};}catch(e){}
  aplicarRegimenEmpresa();
  try{
    const r=await window.storage.get('pdc');
    if(r){const l=JSON.parse(r.value);if(Array.isArray(l)&&l.length){PDC.length=0;l.forEach(c=>PDC.push(c));recalcDerivadasPDC();}}
  }catch(e){}
  await loadYear(S.empresa.anio);
  await cargarCentros();await cargarCierresCC();await cargarComprobantes();await cargarFichasAux();await cargarLibroRem();
  fillEmpresaForm();updateHdr();renderSelectorEmpresa();
  try{aplicarPermisosUI();}catch(e){}
  rerender();
}

// ═══ REGISTRO DE CALLBACKS (inversión de dependencias) ═══
// ui.js expone wrappers; aquí inyectamos las implementaciones reales.
registrarUI({rerender, nav, renderSec});
// auth.js llama esto tras un login exitoso, sin importar app.js.
setOnAuthReady(initApp);

// ═══ EXPOSICIÓN GLOBAL PARA onclick DEL HTML ═══
// El HTML usa onclick="renderVentas()" etc. Los módulos ES tienen scope propio,
// así que hay que publicar esas funciones en window.
// Objetos de estado usados directamente en onclick del HTML
Object.assign(window,{AF, VF, CF, REMF, AFB, PF, APF, IMB, IM, IMV, US, BD, S, getCurSec, CD, IVAC, PAGOF29});

Object.assign(window,{
  // utilidades
  toast,
  // navegación y arranque
  nav, rerender, renderSec, toggleNav, cerrarNavMovil, changeYear, saveAll, init, initApp,
  // auth / usuarios
  toggleLoginMode, submitLogin, recuperarPassword, mostrarLogin, logout,
  renderUsuarios, abrirInvitarUsuario, editarUsuario, renderPermisosForm,
  cerrarUsuarioForm, guardarUsuario, aprobarUsuario, desactivarUsuario, renderAuditLog,
  // empresa / pdc / indicadores
  fillEmpresaForm, saveEmpresa, updateHdr,
  renderPDC, abrirPdcForm, editarCuenta, cerrarPdcForm, guardarCuenta, eliminarCuenta, resetPDC,
  renderIndicadores, guardarIndicadores, restaurarIndicadoresDefault, actualizarDesdeBancoCentral,
  renderIUSCTabla, setIUSC, addIUSCTramo, delIUSCTramo, restaurarIUSCTabla, setIUSCPrueba,
  renderPrevisional, guardarPrevisional, restaurarPrevisional,
  renderCentrosCosto, abrirFormCC, editarCC, cerrarFormCC, guardarCC, borrarCC,
  verDetalleCC, abrirCapitalizar, confirmarCapitalizar, ccOpts, ccNombre,
  onCurvaChange, setPct, addPctAnio, delPctAnio, onTipoCentroChange, ejecutarCierreMensual, revertirCierreMensual,
  acBuscar, acTecla, acElegir, acCerrarDif, inputCuenta, buscarCuentas, inputCC, ccAcBuscar, ccAcTecla, ccAcElegir, ccAcCerrarDif,
  axAcBuscar, axAcTecla, axAcElegir, axAcCerrar, lAuxElegido,
  marcarGuardado, marcarSucio, haySinGuardar,
  actualizarBotonGuardar, guardarTodoAhora, setAutoguardado, setIntervaloAutoguardado, confirmarSalida, AG,
  abrirImportSIIVentas, cambiarPeriodoImportV, toggleAllImportV, aplicarCuentaATodosV, setBulkCuentaImpV, setBulkCuentaImp, setImportCC, aplicarCCATodos,
  toggleCSel, toggleCSelAll, limpiarCSel, eliminarCSel, toggleVSel, toggleVSelAll, limpiarVSel, eliminarVSel, cambiarFPVSel,
  abrirFichaAux, abrirFichaAuxNueva, fichaRutInput, cerrarFichaAux, setFichaCuenta, guardarFichaAuxUI,
  renderComprobantes, setCmpFiltro, limpiarCmpFiltro, toggleCmpDet, editarAsientoDesdeCmp, corregirCmp, cmpNumeroBuscar, renderCmpNumeroList, cmpNumeroElegir,
  abrirCmpModal, cerrarCmpModal, cmpModalEditar, cmpModalCancelar, cmpModalGuardar,
  eliminarComprobante, anularComprobante,
  setCmpEdGlosa, setCmpEdFecha, setCmpEdCuenta, setCmpEdCampo, setCmpEdMonto, setCmpEdMontoBlur, addCmpEdLinea, delCmpEdLinea,
  abrirCmpEdDte, cerrarCmpEdDte, setCmpDteCampo, setCmpDteRut, cmpDteAutoTotal, guardarCmpEdDte,
  renderPagos, setPagTipo, setPagCampo, setPagFiltro, limpiarPagFiltro, togglePagSel, togglePagAll, setPagMontoParcial, ejecutarPago,
  abrirAsociarNota, cerrarAsociarNota, confirmarAsociar, quitarReferencia,
  corregirDesdeDiario, editarAsientoRef,
  descargarPlantillaAux, abrirImportFichas, descargarPlantillaAuxActual, abrirImportFichasActual,
  renderImportModalVentas, confirmarImportacionV, cerrarImportModalVentas,
  buscarCT, cerrarBuscarCT, navCT, aplicarCT, abrirCTModal, cerrarCTModal, renderCTModal,
  setCTCuenta, setCTCampo, setCTHeader, addCTLinea, delCTLinea, nuevoCT, editarCT, guardarCT,
  borrarCT, copiarCTaEmpresa,
  // apertura
  renderApertura, abrirApertura, cerrarApertura, apRenderLineas, apLCd, apLRut, apLVal,
  apDelLinea, apAddLinea, apPrellenar, apUpdCuadre, guardarApertura, eliminarApertura,
  abrirImpBalModal, cerrarImpBalModal, toggleAllBal, confirmarImportBalance, renderImpBalModal,
  descargarPlantillaBalance,
  abrirAperturaAux, cerrarAperturaAux, renderAperturaAux, apxAddDoc, apxDelDoc,
  apxCampo, apxRut, apxAuxElegido, apxActualizarCuadre, guardarAperturaAux,
  descargarPlantillaAperturaAux, APX,
  // ventas
  onMesChangeV, limpiarFiltrosV, renderVentas, abrirVF, editarVenta, cerrarVF,
  vfRutInput, vfCheckDup, vfCalcTotals, vfAutoCalc, guardarVenta, setVfCuenta, eliminarVenta,
  // compras
  onMesChangeC, limpiarFiltrosC, renderCompras, abrirCF, editarCompra, cerrarCF,
  cfRutInput, cfCheckDup, cfCalcTotals, renderDist, addDist, delDist, updCfCheck,
  guardarCompra, eliminarCompra, abrirImportSII, abrirImportModal, cambiarPeriodoImport,
  cerrarImportModal, toggleImportDoc, toggleAllImport, setImportCuenta,
  aplicarCuentaATodos, confirmarImportacion, renderImportModal, pn,
  cambiarModoImport, verDuplicadoC, renderCDupAlert,
  // honorarios
  renderHon, uhon, addHon, delHon, saveHon,
  // asientos
  renderAsientos, abrirForm, cerrarForm, editarAsiento, duplicarAsiento, anularAsiento,
  eliminarAsiento, guardarAsiento, addLinea, delLinea, renderLineas, lCd, lVal, lValFmt, lValFmtBlur, lRut,
  toggleAs, updCuadre, limpiarFormAsiento, sigAsiento, abrirDteModal, cerrarDteModal,
  dtmGuardar, dtmRefresh, dtmCalcTotals, dtmRutInput, dtmCheckDup, dtmAddDist, dtmDelDist,
  dtmRenderDist, dtmUpdDistCheck, dtmRemover, quitarDte, folioPreviewDte, abrirAsientoDesde,
  // activo fijo
  renderActivoFijo, abrirFormAF, onCatAF, cerrarFormAF, previewAF, guardarAF, editarAF,
  eliminarAF, generarAsientoDepreciacion,
  // remuneraciones
  renderRemuneraciones, abrirFormTrabajador, cerrarFormTrabajador, onSaludChange, onGratModoChange,
  renderLibroRem, setRemView, getRemView, tabsRemuneraciones, cerrarMesRem, reabrirMesRem,
  exportarLibroRemExcel, libroDelMes,
  previewLiq, guardarTrabajador, editarTrabajador, eliminarTrabajador, onParamRem,
  verLiquidacion, generarAsientoRemuneraciones,
  // cierre
  renderCierre, generarAsientoCierre, renderProvisiones, previewProvInc, previewProvFer,
  generarProvisionIncobrables, generarProvisionFeriado, renderCorreccion, previewCM,
  // reportes
  renderDiario, setDiarioQ, renderMayor, renderBalance, onCmpYear, renderResultados,
  onDiarioMes, setDiarioFecha, limpiarFiltrosDiario, exportarDiarioExcel,
  onMayorMes, setMayorFecha, setMayorQ, limpiarFiltrosMayor, renderMayorTabla, exportarMayorExcel,
  renderCargaDatos, descargarPlantillaDatos, abrirCargaDatos, renderSistema,
  diagnosticarSeguridad, prepararAislamiento, repararAccesos, repararDocumentos,
  renombrarEsteDispositivo,
  renderCompensacionIVA, generarAsientoIVA, setIvacCuenta, setIvacCampo, resetIvacCuentas, crearCuentaRemanente,
  renderPagoF29, generarAsientoPagoF29, setPagoF29Cuenta, setPagoF29Campo, setPagoF29Monto,
  togglePagoF29, resetPagoF29, usarSugeridoF29,
  setAuxTab, setAuxView, setAuxQ, verTodosAux, ocultarTodosAux, toggleAux, renderAuxiliares, toggleAgingDetalle,
  renderF29, renderPPM, setFCView, renderFlujoCaja,
  // declaración de renta (F22)
  renderRenta, setRentaTab, setRentaParam, restaurarTasaLegal, toggleRechazada,
  onRegimenEmpresaChange, pintarRegimen, onRegimenChange, aplicarPermisosUI,
  addRentaLinea, setRentaLinea, delRentaLinea, setRentaCredito, exportRentaXLSX,
  renderConciliacion, onSaldoBancoChange, toggleConciliado, marcarTodosConciliados,
  cargarCartola, autoConciliarCartola,
  // búsqueda / backup
  abrirBusqueda, cerrarBusqueda, ejecutarBusqueda, navBusqueda, irAResultado,
  cambiarTema, aplicarTema, onCambiarEmpresa, renderSelectorEmpresa, recargarEmpresaActiva,
  renderEmpresas, abrirFormEmpresa, cerrarFormEmpresa, editarEmpresaCat, guardarEmpresaCat,
  abrirCompartir, cerrarCompartir, guardarCompartir, reclamarEmpresa, restaurarEmpresa, aplicarVisibilidad,
  seleccionarEmpresa, borrarEmpresa, onMarcoChange,
  exportarExcelManual, conectarBD, fsBackupToCloud, fsRestoreFromCloud, importarExcelBD,
});

// Encabezado de impresión
window.addEventListener('beforeprint', prepararImpresion);


// Puentes que traducen el tab activo a 'cliente'/'proveedor'
function tipoAuxActual(){
  return (typeof AUX_TAB!=='undefined'?AUX_TAB:'c')==='c'?'cliente':'proveedor';
}
function descargarPlantillaAuxActual(){descargarPlantillaAux(tipoAuxActual());}
function abrirImportFichasActual(){abrirImportFichas(tipoAuxActual());}

// ═══ ARRANQUE ═══
initTema();
initAvisoSalida();   // aviso si se cierra con cambios sin guardar
initAutoguardado();  // temporizador + guardado al dejar la pestaña o cerrar
// storage llama esto cuando frena una escritura sobre una clave no leída
let _avisoBloqueo=0;
// Otro equipo escribió el mismo libro: se fusionó, hay que avisarlo
window.__avisarFusion=(clave,r)=>{
  const de=r.otro?` de ${r.otro}`:'';
  let msg=`🔀 "${clave}" se fusionó con los cambios${de}`;
  if(r.agregados)msg+=` · ${r.agregados} registro(s) tuyos agregados`;
  if(r.revividos>0)msg+=` · ${r.revividos} venían del otro equipo`;
  toast(msg+' — recarga para verlo completo');
  console.warn('Fusión en',clave,r);
};
// No se pudo fusionar solo (no es una lista de registros): decide el usuario
window.__avisarConflicto=(clave,otro)=>{
  toast(`⚠️ "${clave}" fue modificado desde ${otro||'otro equipo'} — no se guardó para no pisarlo. Recarga y vuelve a aplicar tu cambio.`,'e');
  console.error('Conflicto sin fusión posible en',clave,'—',otro);
};
window.__avisarBloqueo=(clave,motivo)=>{
  try{actualizarBotonGuardar();}catch(e){}
  const ahora=Date.now();
  if(ahora-_avisoBloqueo<8000)return;      // no repetir en cada tecla
  _avisoBloqueo=ahora;
  toast(`🚫 No se guardó "${clave}": no se pudo leer desde la nube (${motivo}). Recarga la página.`,'e');
};   // aplicar tema guardado antes de renderizar
init();
