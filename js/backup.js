// backup.js — Export/import Excel + sincronización con Firestore
import {toast, PDC, dteC, dteV, rutDV, rutFmt} from './core.js';
import {CUENTAS_AUX, esAux, todosDocsCompras, todosDocsVentas} from './asientos.js';
import {S} from './state.js';
import {FS, fsStatusSet} from './firebase.js';
import {rerender} from './ui.js';
import './storage.js';
import {EMPRESAS} from './empresas.js';

// ═══ BASE DE DATOS EXCEL — auto-save con File System Access API ═══
let BD={
  dirHandle:null,       // FileSystemDirectoryHandle (API moderna)
  fileHandle:null,      // FileSystemFileHandle si se seleccionó archivo directo
  supported:('showDirectoryPicker' in window)||('showSaveFilePicker' in window),
  status:'offline',     // 'offline' | 'connecting' | 'connected' | 'saving' | 'saved' | 'error'
  lastError:null,
  lastSaveTs:null,
  timer:null
};
const BD_FILENAME='contavivero_bd.xlsx';

function bdStatusSet(status,msg){
  BD.status=status;BD.lastError=null;
  const el=document.getElementById('db-indicator');if(!el)return;
  const configs={
    offline:{icon:'⚪',txt:'BD local',color:'var(--mt)'},
    connecting:{icon:'🔄',txt:'Conectando...',color:'var(--info)'},
    connected:{icon:'🟢',txt:'BD vinculada',color:'var(--ach)'},
    saving:{icon:'💾',txt:'Guardando...',color:'var(--info)'},
    saved:{icon:'✓',txt:'BD guardada '+(BD.lastSaveTs?new Date(BD.lastSaveTs).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):''),color:'var(--ach)'},
    error:{icon:'⚠️',txt:msg||'Error',color:'var(--err)'}
  };
  const c=configs[status]||configs.offline;
  el.innerHTML=`<span>${c.icon}</span><span style="color:${c.color}">${c.txt}</span>`;
  const btn=document.getElementById('btn-conectar-bd');
  if(btn){
    if(status==='connected'||status==='saved'||status==='saving'){
      btn.textContent='🔗 BD vinculada';
      btn.className='btn btn-g';
    }else{
      btn.textContent='🔗 Conectar BD';
      btn.className='btn btn-s';
    }
  }
}

// Genera el workbook Excel con TODOS los datos del año actual
function construirWorkbookBD(){
  if(typeof XLSX==='undefined'){throw new Error('Biblioteca Excel (SheetJS) no cargada');}
  const wb=XLSX.utils.book_new();
  const meta=[
    ['Contabilidad - Base de Datos'],
    ['Empresa',S.empresa.nombre||''],
    ['RUT',S.empresa.rut||''],
    ['Año',S.empresa.anio],
    ['Giro',S.empresa.giro||''],
    ['Dirección',S.empresa.domicilio||''],
    ['Ciudad',S.empresa.ciudad||''],
    ['Comuna',S.empresa.comuna||''],
    ['Representante',S.empresa.rep||''],
    ['RUT Representante',S.empresa.rutrep||''],
    ['Última actualización',new Date().toLocaleString('es-CL')],
    [],
    ['IMPORTANTE: NO editar las primeras 2 filas de las demás hojas — son encabezados de control.'],
    ['Para restaurar: usa el botón "📤 Importar" en Contabilidad.']
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(meta),'Empresa');

  // VENTAS
  // 'periodo' = mes tributario del libro, distinto de la fecha cuando el
  // documento se arrastró por falta de acuse de recibo.
  const ventasHdr=['id','fecha','periodo','fechaVencimiento','tipoDTE','numero','rutCodigo','rutDV','razonSocial','neto','exento','iva','otrosImpuestos','total','formaPago'];
  const ventasRows=S.ventas.map(v=>ventasHdr.map(k=>v[k]!==undefined?v[k]:''));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([ventasHdr,...ventasRows]),'Ventas');

  // COMPRAS (con distribución serializada como JSON)
  const comprasHdr=['id','fecha','periodo','fechaVencimiento','tipoDTE','numero','rutCodigo','rutDV','razonSocial','neto','exento','iva','otrosImpuestos','total','distJSON'];
  const comprasRows=S.compras.map(c=>[
    c.id,c.fecha,c.periodo||'',c.fechaVencimiento||'',c.tipoDTE,c.numero,c.rutCodigo,c.rutDV,c.razonSocial,
    c.neto||0,c.exento||0,c.iva||0,c.otrosImpuestos||0,c.total||0,JSON.stringify(c.dist||[])
  ]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([comprasHdr,...comprasRows]),'Compras');

  // HONORARIOS
  const honHdr=['mes','fecha','profesional','rut','bruto','retencion','liquido','estado'];
  const honRows=S.honorarios.map(h=>honHdr.map(k=>h[k]!==undefined?h[k]:''));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([honHdr,...honRows]),'Honorarios');

  // ASIENTOS (con movimientos como JSON)
  const asHdr=['id','n','fecha','glosa','movsJSON'];
  const asRows=S.asientos.map(a=>[a.id,a.n,a.fecha,a.glosa,JSON.stringify(a.movs||[])]);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([asHdr,...asRows]),'Asientos');

  // APERTURA (Balance inicial del año — Asiento N°0)
  const apHdr=['fecha','glosa','movsJSON'];
  const apRows=S.apertura?[[S.apertura.fecha,S.apertura.glosa,JSON.stringify(S.apertura.movs||[])]]:[];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([apHdr,...apRows]),'Apertura');

  // ACTIVOS FIJOS (bienes para depreciación)
  const afHdr=['id','desc','cat','fecha','valor','residual','vida','metodo','cuentaActivo','cuentaDeprAcum','cuentaGasto'];
  const afRows=(S.activos||[]).map(a=>afHdr.map(k=>a[k]!==undefined?a[k]:''));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([afHdr,...afRows]),'ActivosFijos');

  // TRABAJADORES (remuneraciones)
  const trHdr=['id','nombre','rut','cargo','base','grat','otros','colacion','movilizacion','afp','salud','plan','contrato'];
  const trRows=(S.trabajadores||[]).map(t=>trHdr.map(k=>t[k]!==undefined?t[k]:''));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([trHdr,...trRows]),'Trabajadores');

  // CENTROS DE COSTO (predios y cuarteles)
  const ccHdr=['id','nivel','nombre','codigo','padre','estado','fechaInicio','capitalizadoEn'];
  const ccRows=(S.centros||[]).map(c=>ccHdr.map(k=>c[k]!==undefined&&c[k]!==null?c[k]:''));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([ccHdr,...ccRows]),'CentrosCosto');

  // PLAN DE CUENTAS (solo referencia, no se importa)
  const pdcHdr=['Código','Nombre','Naturaleza','Tipo'];
  const pdcRows=PDC.map(c=>[c.cd,c.nm,c.nat||'',c.tp||'']);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([pdcHdr,...pdcRows]),'PlanDeCuentas');

  // AUXILIARES: resumen por RUT (reporte, no se importa)
  const auxClientes={},auxProv={};
  todosDocsVentas().forEach(d=>{
    if(d.formaPago!=='clientes'&&d.origen==='libro')return;
    const k=d.rutCodigo;if(!k)return;
    if(!auxClientes[k])auxClientes[k]={rut:rutFmt(d.rutCodigo,d.rutDV),rs:d.razonSocial||'',total:0,docs:0};
    const s=(dteV(d.tipoDTE)?.signo)||1;
    auxClientes[k].total+=(d.total||0)*s;auxClientes[k].docs++;
    if(d.razonSocial)auxClientes[k].rs=d.razonSocial;
  });
  todosDocsCompras().forEach(d=>{
    const k=d.rutCodigo;if(!k)return;
    if(!auxProv[k])auxProv[k]={rut:rutFmt(d.rutCodigo,d.rutDV),rs:d.razonSocial||'',total:0,docs:0};
    const s=(dteC(d.tipoDTE)?.signo)||1;
    auxProv[k].total+=(d.total||0)*s;auxProv[k].docs++;
    if(d.razonSocial)auxProv[k].rs=d.razonSocial;
  });
  S.asientos.forEach(a=>{if(a.anulado)return;(a.movs||[]).forEach(m=>{
    if(!m.rutCodigo||!esAux(m.cd)||m.dte)return;
    const tipo=CUENTAS_AUX[m.cd],bucket=tipo==='cliente'?auxClientes:auxProv,k=m.rutCodigo;
    if(!bucket[k])bucket[k]={rut:rutFmt(k,m.rutDV),rs:m.razonSocial||'',total:0,docs:0};
    const mov=tipo==='cliente'?(m.debe||0)-(m.haber||0):(m.haber||0)-(m.debe||0);
    bucket[k].total+=mov;bucket[k].docs++;
  });});
  const auxHdr=['Tipo','RUT','Razón Social','Movimientos','Saldo'];
  const auxRows=[
    ...Object.values(auxClientes).map(c=>['Cliente',c.rut,c.rs,c.docs,c.total]),
    ...Object.values(auxProv).map(p=>['Proveedor',p.rut,p.rs,p.docs,p.total])
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([auxHdr,...auxRows]),'Auxiliares');

  return wb;
}

// Descarga manual (opción A — funciona en todos los navegadores)
function exportarExcelManual(){
  try{
    if(typeof XLSX==='undefined'){toast('⚠️ Biblioteca Excel no cargada (¿sin internet?)','e');return;}
    const wb=construirWorkbookBD();
    const nm=(S.empresa.nombre||'contavivero').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'contavivero';
    const filename=`${nm}_bd_${S.empresa.anio}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb,filename);
    toast('✅ Excel descargado: '+filename);
  }catch(e){toast('❌ Error al exportar: '+e.message,'e');}
}

// Conectar BD: intenta File System Access API; si no, sugiere usar botones manuales
async function conectarBD(){
  if(!BD.supported){
    toast('⚠️ Tu navegador no soporta auto-guardado. Usa los botones 📥 Exportar / 📤 Importar.','e');
    return;
  }
  try{
    bdStatusSet('connecting');
    // Preferir directorio (para poder guardar siempre en el mismo archivo sin re-preguntar)
    if('showDirectoryPicker' in window){
      const dir=await window.showDirectoryPicker({mode:'readwrite',id:'contavivero-bd'});
      BD.dirHandle=dir;BD.fileHandle=null;
      // Guardar handle en IndexedDB para restaurarlo entre sesiones
      await bdSaveHandle('dir',dir);
      bdStatusSet('connected');
      toast('✅ Carpeta vinculada: '+dir.name+' — se auto-guardará como '+BD_FILENAME);
      await guardarBDAhora();
    }else if('showSaveFilePicker' in window){
      const h=await window.showSaveFilePicker({
        suggestedName:BD_FILENAME,
        types:[{description:'Excel Workbook',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx']}}]
      });
      BD.fileHandle=h;BD.dirHandle=null;
      await bdSaveHandle('file',h);
      bdStatusSet('connected');
      toast('✅ Archivo vinculado: '+h.name);
      await guardarBDAhora();
    }
  }catch(e){
    if(e.name==='AbortError'){bdStatusSet('offline');return;}
    bdStatusSet('error',e.message);
    toast('❌ Error al conectar: '+e.message,'e');
  }
}

// IndexedDB para persistir el handle entre sesiones
function bdOpenDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('contavivero-bd',1);
    req.onupgradeneeded=(e)=>{const db=e.target.result;if(!db.objectStoreNames.contains('handles'))db.createObjectStore('handles');};
    req.onsuccess=(e)=>resolve(e.target.result);
    req.onerror=()=>reject(req.error);
  });
}
async function bdSaveHandle(type,handle){
  try{
    const db=await bdOpenDB();
    const tx=db.transaction('handles','readwrite');
    tx.objectStore('handles').put({type,handle},'current');
    return new Promise(r=>tx.oncomplete=r);
  }catch(e){console.warn('No se pudo persistir handle:',e);}
}
async function bdLoadHandle(){
  try{
    const db=await bdOpenDB();
    const tx=db.transaction('handles','readonly');
    const req=tx.objectStore('handles').get('current');
    return new Promise((resolve)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);});
  }catch(e){return null;}
}

// Escribe el archivo Excel al disco
// ═══ SINCRONIZACIÓN MANUAL FIRESTORE ═══
async function fsBackupToCloud(){
  if(!FS.enabled){
    toast('⚠️ Firestore no está conectado. Verifica tu conexión a internet.','e');
    return;
  }
  if(!confirm('¿Subir TODOS los datos locales a Firestore?\n\nEsto sobreescribirá los datos en la nube con los de este dispositivo.\n\nÚsalo si trabajaste offline y quieres sincronizar los cambios.'))return;
  toast('⏫ Subiendo datos a Firestore...');
  try{
    const r=await window.storage.syncAllToRemote();
    toast(`✅ ${r.count} elementos sincronizados a Firestore`);
  }catch(e){toast('❌ Error: '+e.message,'e');}
}

async function fsRestoreFromCloud(){
  if(!FS.enabled){
    toast('⚠️ Firestore no está conectado. Verifica tu conexión a internet.','e');
    return;
  }
  if(!confirm('¿Descargar TODOS los datos desde Firestore?\n\nEsto reemplazará los datos locales de este dispositivo con los que hay en la nube.\n\nÚsalo al abrir la app en un dispositivo nuevo, o si sospechas que los datos locales están desactualizados.'))return;
  toast('⏬ Descargando datos desde Firestore...');
  try{
    // Con las reglas endurecidas una consulta sin filtro se rechaza entera:
    // hay que pedir empresa por empresa (sólo las que este usuario puede ver).
    const ids=EMPRESAS.lista.map(e=>e.id);
    const r=await window.storage.syncAllFromRemote(ids);
    if(r.error){toast('❌ Error: '+r.error,'e');return;}
    toast(`✅ ${r.count} elementos descargados. Recargando app...`);
    setTimeout(()=>location.reload(),1500);
  }catch(e){toast('❌ Error: '+e.message,'e');}
}

async function guardarBDAhora(){
  if(!BD.dirHandle&&!BD.fileHandle)return false;
  try{
    bdStatusSet('saving');
    const wb=construirWorkbookBD();
    const buf=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    let fh=BD.fileHandle;
    if(!fh&&BD.dirHandle){
      // Crear o abrir archivo dentro del directorio vinculado
      fh=await BD.dirHandle.getFileHandle(BD_FILENAME,{create:true});
    }
    // Verificar permiso (se puede perder tras recargar)
    if(fh.queryPermission){
      const p=await fh.queryPermission({mode:'readwrite'});
      if(p!=='granted'){
        const r=await fh.requestPermission({mode:'readwrite'});
        if(r!=='granted')throw new Error('Permiso de escritura denegado');
      }
    }
    const w=await fh.createWritable();
    await w.write(blob);
    await w.close();
    BD.lastSaveTs=Date.now();
    bdStatusSet('saved');
    return true;
  }catch(e){
    bdStatusSet('error',e.message);
    console.error('Error guardando BD:',e);
    return false;
  }
}

// Agenda un guardado (debounced, para no escribir en cada tecleo)
function bdScheduleSave(){
  if(!BD.dirHandle&&!BD.fileHandle)return;
  if(BD.timer)clearTimeout(BD.timer);
  BD.timer=setTimeout(()=>guardarBDAhora(),1200);
}

// Restaurar conexión al cargar (requiere re-permiso explícito del usuario)
async function bdRestaurarHandle(){
  if(!BD.supported)return;
  const stored=await bdLoadHandle();
  if(!stored||!stored.handle)return;
  try{
    const p=await stored.handle.queryPermission({mode:'readwrite'});
    if(p==='granted'){
      if(stored.type==='dir')BD.dirHandle=stored.handle;
      else BD.fileHandle=stored.handle;
      BD.lastSaveTs=null;
      bdStatusSet('connected');
    }else{
      // Mostrar botón que requiere click del usuario para re-pedir permiso
      bdStatusSet('offline');
      const btn=document.getElementById('btn-conectar-bd');
      if(btn){btn.textContent='🔗 Re-vincular BD';btn.classList.add('btn-i');}
    }
  }catch(e){}
}

// ═══ IMPORTAR desde Excel ═══
async function importarExcelBD(file){
  if(typeof XLSX==='undefined'){toast('⚠️ Biblioteca Excel no cargada','e');return;}
  try{
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array'});
    const hojas=wb.SheetNames;

    // Validar que sea un archivo de Contabilidad
    if(!hojas.includes('Ventas')||!hojas.includes('Compras')){
      toast('⚠️ No parece un archivo de Contabilidad (faltan hojas Ventas/Compras)','e');return;
    }

    // Preview
    const vRows=XLSX.utils.sheet_to_json(wb.Sheets['Ventas']);
    const cRows=XLSX.utils.sheet_to_json(wb.Sheets['Compras']);
    const aRows=hojas.includes('Asientos')?XLSX.utils.sheet_to_json(wb.Sheets['Asientos']):[];
    const hRows=hojas.includes('Honorarios')?XLSX.utils.sheet_to_json(wb.Sheets['Honorarios']):[];

    const msg=`Este archivo contiene:\n\n`+
      `  • ${vRows.length} documentos de ventas\n`+
      `  • ${cRows.length} documentos de compras\n`+
      `  • ${aRows.length} asientos manuales\n`+
      `  • ${hRows.length} honorarios\n\n`+
      `⚠️ Se REEMPLAZARÁN todos los datos actuales del año ${S.empresa.anio}.\n\n`+
      `¿Continuar?`;
    if(!confirm(msg))return;

    // Restaurar estructuras
    S.ventas=vRows.map(r=>({
      id:r.id||'v_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      fecha:r.fecha||'',periodo:r.periodo||'',fechaVencimiento:r.fechaVencimiento||'',
      tipoDTE:+r.tipoDTE||0,numero:String(r.numero||'').trim(),
      rutCodigo:String(r.rutCodigo||''),rutDV:String(r.rutDV||''),
      razonSocial:r.razonSocial||'',
      neto:+r.neto||0,exento:+r.exento||0,iva:+r.iva||0,otrosImpuestos:+r.otrosImpuestos||0,total:+r.total||0,
      formaPago:r.formaPago||'banco'
    }));
    S.compras=cRows.map(r=>{
      let dist=[];
      try{dist=JSON.parse(r.distJSON||'[]');}catch(e){}
      if(!Array.isArray(dist)||!dist.length)dist=[{cuenta:'',monto:+r.neto||0}];
      return {
        id:r.id||'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        fecha:r.fecha||'',periodo:r.periodo||'',fechaVencimiento:r.fechaVencimiento||'',
        tipoDTE:+r.tipoDTE||0,numero:String(r.numero||'').trim(),
        rutCodigo:String(r.rutCodigo||''),rutDV:String(r.rutDV||''),
        razonSocial:r.razonSocial||'',
        neto:+r.neto||0,exento:+r.exento||0,iva:+r.iva||0,otrosImpuestos:+r.otrosImpuestos||0,total:+r.total||0,
        dist
      };
    });
    S.asientos=aRows.map(r=>{
      let movs=[];
      try{movs=JSON.parse(r.movsJSON||'[]');}catch(e){}
      return {id:r.id||'as_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),n:+r.n||0,fecha:r.fecha||'',glosa:r.glosa||'',movs};
    });
    S.honorarios=hRows.map(r=>({...r,mes:+r.mes||0,bruto:+r.bruto||0,retencion:+r.retencion||0,liquido:+r.liquido||0}));

    // Restaurar apertura (Asiento N°0)
    S.apertura=null;
    if(hojas.includes('Apertura')){
      const apRows=XLSX.utils.sheet_to_json(wb.Sheets['Apertura']);
      if(apRows.length){
        const ap=apRows[0];
        let movs=[];
        try{movs=JSON.parse(ap.movsJSON||'[]');}catch(e){}
        if(Array.isArray(movs)&&movs.length){
          S.apertura={fecha:ap.fecha||'',glosa:ap.glosa||'Balance de Apertura',movs};
        }
      }
    }

    // Restaurar activos fijos (clave global)
    if(hojas.includes('ActivosFijos')){
      const afRows=XLSX.utils.sheet_to_json(wb.Sheets['ActivosFijos']);
      S.activos=afRows.map(r=>({
        id:r.id||'af_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        desc:r.desc||'',cat:r.cat||'maquinarias',fecha:r.fecha||'',
        valor:+r.valor||0,residual:+r.residual||0,vida:+r.vida||0,metodo:r.metodo||'lineal',
        cuentaActivo:r.cuentaActivo||'',cuentaDeprAcum:r.cuentaDeprAcum||'',cuentaGasto:r.cuentaGasto||''
      }));
    }

    // Restaurar centros de costo
    if(hojas.includes('CentrosCosto')){
      const ccRows=XLSX.utils.sheet_to_json(wb.Sheets['CentrosCosto']);
      S.centros=ccRows.map(r=>({
        id:r.id||'cc_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
        nivel:+r.nivel||1,nombre:r.nombre||'',codigo:String(r.codigo||''),
        padre:r.padre||null,estado:r.estado||null,
        fechaInicio:r.fechaInicio||'',capitalizadoEn:r.capitalizadoEn||null,
      }));
    }

    // Restaurar trabajadores (clave global)
    if(hojas.includes('Trabajadores')){
      const trRows=XLSX.utils.sheet_to_json(wb.Sheets['Trabajadores']);
      S.trabajadores=trRows.map(r=>({
        id:r.id||'tr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        nombre:r.nombre||'',rut:String(r.rut||''),cargo:r.cargo||'',
        base:+r.base||0,grat:+r.grat||0,otros:+r.otros||0,colacion:+r.colacion||0,movilizacion:+r.movilizacion||0,
        afp:r.afp||'modelo',salud:r.salud||'fonasa',plan:+r.plan||0,contrato:r.contrato||'indefinido'
      }));
    }

    // Restaurar empresa si viene
    if(hojas.includes('Empresa')){
      const emp=XLSX.utils.sheet_to_json(wb.Sheets['Empresa'],{header:1});
      const mapa={};emp.forEach(row=>{if(row[0]&&row[1]!=null)mapa[row[0]]=row[1];});
      if(mapa.Empresa&&!S.empresa.nombre)S.empresa.nombre=mapa.Empresa;
      if(mapa.RUT&&!S.empresa.rut)S.empresa.rut=mapa.RUT;
      if(mapa.Giro&&!S.empresa.giro)S.empresa.giro=mapa.Giro;
      if(mapa.Dirección&&!S.empresa.domicilio)S.empresa.domicilio=mapa.Dirección;
    }

    // Persistir y re-render
    const anio=S.empresa.anio;
    await window.storage.set('ventas-'+anio,JSON.stringify(S.ventas));
    await window.storage.set('compras-'+anio,JSON.stringify(S.compras));
    await window.storage.set('asientos-'+anio,JSON.stringify(S.asientos));
    await window.storage.set('honorarios-'+anio,JSON.stringify(S.honorarios));
    if(S.apertura)await window.storage.set('apertura-'+anio,JSON.stringify(S.apertura));
    else try{await window.storage.delete('apertura-'+anio);}catch(e){}
    if(S.activos&&S.activos.length)await window.storage.set('activos',JSON.stringify(S.activos));
    if(S.trabajadores&&S.trabajadores.length)await window.storage.set('trabajadores',JSON.stringify(S.trabajadores));
    if(S.centros&&S.centros.length)await window.storage.set('centros',JSON.stringify(S.centros));
    await window.storage.set('empresa',JSON.stringify(S.empresa));

    const apMsg=S.apertura?' · Apertura':'';
    toast(`✅ Datos restaurados: ${S.ventas.length} ventas · ${S.compras.length} compras · ${S.asientos.length} asientos${apMsg}`);
    rerender();
    if(BD.dirHandle||BD.fileHandle)bdScheduleSave();
  }catch(e){
    toast('❌ Error al importar: '+e.message,'e');
    console.error(e);
  }
}

function initBDImportListener(){
  const input=document.getElementById('imp-bd-file');
  if(input&&!input._listenerAttached){
    input.addEventListener('change',(e)=>{
      const f=e.target.files[0];if(f)importarExcelBD(f);
      e.target.value='';
    });
    input._listenerAttached=true;
  }
}

// Hook: monkey-patch window.storage.set para auto-guardar en Excel
(function patchStorageForBD(){
  if(!window.storage||window.storage._bdPatched)return;
  const origSet=window.storage.set.bind(window.storage);
  window.storage.set=async function(k,v){
    const r=await origSet(k,v);
    // Solo agendar si la clave es relevante a la BD
    if(/^(ventas|compras|asientos|honorarios|empresa|apertura|pdc)/.test(k))bdScheduleSave();
    return r;
  };
  window.storage._bdPatched=true;
})();

// init() se llama desde app.js (orquestador)


export {BD, BD_FILENAME, bdStatusSet, construirWorkbookBD, exportarExcelManual, conectarBD, bdOpenDB, bdSaveHandle, bdLoadHandle, fsBackupToCloud, fsRestoreFromCloud, guardarBDAhora, bdScheduleSave, bdRestaurarHandle, importarExcelBD, initBDImportListener};
