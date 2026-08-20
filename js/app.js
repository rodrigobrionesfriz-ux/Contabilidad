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
        eliminarEmpresa, actualizarEmpresa, activarEmpresa, migrarSiHaceFalta} from './empresas.js';
import {renderEmpresas, abrirFormEmpresa, cerrarFormEmpresa, editarEmpresaCat,
        guardarEmpresaCat, seleccionarEmpresa, borrarEmpresa, onMarcoChange} from './empresas-ui.js';

// Sistema
import {initAuth, puedeVer, puedeEditar, esAdmin, ROLES, SECCIONES, permisosDeRol,
        toggleLoginMode, submitLogin, recuperarPassword, mostrarLogin, logout,
        aplicarPermisosUI, setOnAuthReady} from './auth.js';
import {cargarUsuarios, renderUsuarios, abrirInvitarUsuario, editarUsuario,
        renderPermisosForm, cerrarUsuarioForm, guardarUsuario, aprobarUsuario,
        desactivarUsuario, US} from './usuarios.js';
import {renderAuditLog} from './audit.js';

// Configuración y datos
import {fillEmpresaForm, saveEmpresa, updateHdr} from './empresa.js';
import {savePDC, renderPDC, abrirPdcForm, editarCuenta, cerrarPdcForm,
        guardarCuenta, eliminarCuenta, resetPDC, PF} from './pdc.js';
import {renderIndicadores, guardarIndicadores, restaurarIndicadoresDefault,
        getIndicadores, IND, actualizarDesdeBancoCentral,
        renderIUSCTabla, setIUSC, addIUSCTramo, delIUSCTramo, restaurarIUSCTabla, setIUSCPrueba} from './indicadores.js';
import {renderPrevisional, guardarPrevisional, restaurarPrevisional} from './previsional-ui.js';
import {acBuscar, acTecla, acElegir, acCerrarDif, inputCuenta, buscarCuentas, inputCC, ccAcBuscar, ccAcTecla, ccAcElegir, ccAcCerrarDif} from './buscadorcuentas.js';
import {initAvisoSalida, marcarGuardado, marcarSucio, haySinGuardar} from './salida.js';
import {cargarFichasAux, descargarPlantillaAux, abrirImportFichas,
        initImportFichasListener, fichasAux, fichaAux} from './importadoraux.js';
import {cargarComprobantes} from './comprobantestipo.js';
import {buscarCT, cerrarBuscarCT, navCT, aplicarCT, abrirCTModal, cerrarCTModal,
        renderCTModal, setCTCuenta, setCTCampo, addCTLinea, delCTLinea, nuevoCT,
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

// Negocio
import {renderApertura, abrirApertura, cerrarApertura, apRenderLineas, apLCd, apLRut,
        apLVal, apDelLinea, apAddLinea, apPrellenar, apUpdCuadre, guardarApertura,
        eliminarApertura, initBalanceImportListener, abrirImpBalModal, cerrarImpBalModal,
        toggleAllBal, confirmarImportBalance, renderImpBalModal, APF, IMB} from './apertura.js';
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
        quitarDte, folioPreviewDte, abrirAsientoDesde, cuentasOpts,
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
import {setFCView, renderFlujoCaja} from './flujocaja.js';
import {renderConciliacion, onSaldoBancoChange, toggleConciliado,
        marcarTodosConciliados, cargarCartola, autoConciliarCartola} from './conciliacion.js';
import {abrirBusqueda, cerrarBusqueda, ejecutarBusqueda, navBusqueda,
        irAResultado} from './busqueda.js';
import {prepararImpresion} from './impresion.js';
import {exportarExcelManual, conectarBD, fsBackupToCloud, fsRestoreFromCloud,
        importarExcelBD, initBDImportListener, bdRestaurarHandle, BD} from './backup.js';

// ═══ STORAGE ═══
async function saveAll(){
  const btn=document.querySelector('.btn-save-all');btn.textContent='⏳...';
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
    toast('✅ Todos los datos guardados');
  }catch(e){toast('❌ Error: '+e.message,'e');}
  btn.textContent='💾 Guardar Todo';
}
async function loadYear(y){
  S.ventas=[];S.compras=[];S.honorarios=[];S.asientos=[];S.apertura=null;S.activos=[];S.trabajadores=[];
  for(const[k,d] of [['ventas-'+y,'ventas'],['compras-'+y,'compras'],['honorarios-'+y,'honorarios'],['asientos-'+y,'asientos']]){
    try{
      const r=await window.storage.get(k);
      if(r){
        const parsed=JSON.parse(r.value);
        if(Array.isArray(parsed)&&parsed.length>0&&(d==='ventas'||d==='compras')&&parsed[0]&&'mes' in parsed[0]&&!('tipoDTE' in parsed[0])){
          S[d]=[];
        }else if(Array.isArray(parsed)){
          S[d]=parsed;
        }
      }
    }catch(e){}
  }
  // Cargar asiento de apertura del año
  try{
    const r=await window.storage.get('apertura-'+y);
    if(r)S.apertura=JSON.parse(r.value);
  }catch(e){}
  // Activos fijos: clave GLOBAL (los bienes persisten entre años; la depreciación se calcula por año activo)
  try{
    const r=await window.storage.get('activos');
    if(r){const p=JSON.parse(r.value);if(Array.isArray(p))S.activos=p;}
  }catch(e){}
  // Trabajadores: clave GLOBAL (persisten entre meses/años)
  try{
    const r=await window.storage.get('trabajadores');
    if(r){const p=JSON.parse(r.value);if(Array.isArray(p))S.trabajadores=p;}
  }catch(e){}
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
  window.storage.setPrefijo(EMPRESAS.activa);
  renderSelectorEmpresa();

  const ys=document.getElementById('year-sel');
  const cy=new Date().getFullYear();
  for(let y=cy+1;y>=cy-5;y--){const o=document.createElement('option');o.value=y;o.textContent=y;if(y===cy)o.selected=true;ys.appendChild(o);}

  try{const r=await window.storage.get('empresa');if(r)S.empresa={...S.empresa,...JSON.parse(r.value)};}catch(e){}
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
  else if(s==='asientos')renderAsientos();
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
  try{
    const r=await window.storage.get('pdc');
    if(r){const l=JSON.parse(r.value);if(Array.isArray(l)&&l.length){PDC.length=0;l.forEach(c=>PDC.push(c));recalcDerivadasPDC();}}
  }catch(e){}
  await loadYear(S.empresa.anio);
  await cargarCentros();await cargarCierresCC();await cargarComprobantes();await cargarFichasAux();await cargarLibroRem();
  fillEmpresaForm();updateHdr();renderSelectorEmpresa();
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
  marcarGuardado, marcarSucio, haySinGuardar,
  abrirImportSIIVentas, cambiarPeriodoImportV, toggleAllImportV, aplicarCuentaATodosV, setBulkCuentaImpV, setBulkCuentaImp, setImportCC, aplicarCCATodos,
  toggleCSel, toggleCSelAll, limpiarCSel, eliminarCSel, toggleVSel, toggleVSelAll, limpiarVSel, eliminarVSel, cambiarFPVSel,
  abrirFichaAux, abrirFichaAuxNueva, fichaRutInput, cerrarFichaAux, setFichaCuenta, guardarFichaAuxUI,
  renderComprobantes, setCmpFiltro, limpiarCmpFiltro, toggleCmpDet, editarAsientoDesdeCmp, corregirCmp, cmpNumeroBuscar, renderCmpNumeroList, cmpNumeroElegir,
  abrirCmpModal, cerrarCmpModal, cmpModalEditar, cmpModalCancelar, cmpModalGuardar,
  setCmpEdGlosa, setCmpEdFecha, setCmpEdCuenta, setCmpEdCampo, setCmpEdMonto, setCmpEdMontoBlur, addCmpEdLinea, delCmpEdLinea,
  abrirCmpEdDte, cerrarCmpEdDte, setCmpDteCampo, setCmpDteRut, cmpDteAutoTotal, guardarCmpEdDte,
  renderPagos, setPagTipo, setPagCampo, setPagFiltro, limpiarPagFiltro, togglePagSel, togglePagAll, setPagMontoParcial, ejecutarPago,
  abrirAsociarNota, cerrarAsociarNota, confirmarAsociar, quitarReferencia,
  corregirDesdeDiario, editarAsientoRef,
  descargarPlantillaAux, abrirImportFichas, descargarPlantillaAuxActual, abrirImportFichasActual,
  renderImportModalVentas, confirmarImportacionV, cerrarImportModalVentas,
  buscarCT, cerrarBuscarCT, navCT, aplicarCT, abrirCTModal, cerrarCTModal, renderCTModal,
  setCTCuenta, setCTCampo, addCTLinea, delCTLinea, nuevoCT, editarCT, guardarCT,
  borrarCT, copiarCTaEmpresa,
  // apertura
  renderApertura, abrirApertura, cerrarApertura, apRenderLineas, apLCd, apLRut, apLVal,
  apDelLinea, apAddLinea, apPrellenar, apUpdCuadre, guardarApertura, eliminarApertura,
  abrirImpBalModal, cerrarImpBalModal, toggleAllBal, confirmarImportBalance, renderImpBalModal,
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
  renderCompensacionIVA, generarAsientoIVA, setIvacCuenta, setIvacCampo, resetIvacCuentas, crearCuentaRemanente,
  renderPagoF29, generarAsientoPagoF29, setPagoF29Cuenta, setPagoF29Campo, setPagoF29Monto,
  togglePagoF29, resetPagoF29, usarSugeridoF29,
  setAuxTab, setAuxView, setAuxQ, verTodosAux, ocultarTodosAux, toggleAux, renderAuxiliares, toggleAgingDetalle,
  renderF29, renderPPM, setFCView, renderFlujoCaja,
  renderConciliacion, onSaldoBancoChange, toggleConciliado, marcarTodosConciliados,
  cargarCartola, autoConciliarCartola,
  // búsqueda / backup
  abrirBusqueda, cerrarBusqueda, ejecutarBusqueda, navBusqueda, irAResultado,
  cambiarTema, aplicarTema, onCambiarEmpresa, renderSelectorEmpresa, recargarEmpresaActiva,
  renderEmpresas, abrirFormEmpresa, cerrarFormEmpresa, editarEmpresaCat, guardarEmpresaCat,
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
initAvisoSalida();   // aviso si se cierra con cambios sin guardar   // aplicar tema guardado antes de renderizar
init();
