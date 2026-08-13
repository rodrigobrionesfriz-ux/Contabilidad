// cargadatos.js — Carga masiva de datos maestros desde Excel.
//
// Un solo lugar en Configuración para poblar las cuatro tablas maestras del
// sistema: plan de cuentas, centros de costo, clientes y proveedores.
// Cada una tiene su plantilla descargable y su importador; las fichas de
// clientes/proveedores reutilizan el importador que ya existía en
// importadoraux.js, así no hay dos caminos distintos para lo mismo.
//
// Criterio general: los importadores NUNCA borran. Actualizan lo que ya existe
// (por código o RUT) y agregan lo nuevo. Las filas con problemas se informan
// con su número de fila para poder corregir el Excel y volver a subirlo.

import {toast, PDC, fmtC} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {savePDC} from './pdc.js';
import {centros, crearCentro, guardarCentros, ccInfo, CC_ESTADOS, CURVAS_DEFAULT} from './centroscosto.js';
import {fichasAux, descargarPlantillaAux, importarFichasExcel} from './importadoraux.js';
import './storage.js';

// Resultado de la última importación de cada tipo (para mostrarlo en pantalla)
const CD={res:{}};

// ── Utilidades comunes ───────────────────────────────────────────────

// Lee la primera hoja de un Excel/CSV como matriz de celdas
async function leerMatriz(file){
  if(typeof XLSX==='undefined')throw new Error('Librería Excel (XLSX) no está cargada. Revisa tu conexión.');
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array'});
  const hoja=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(hoja,{header:1,defval:'',raw:false});
  if(!rows.length)throw new Error('El archivo está vacío');
  return rows;
}

// Localiza la fila de encabezados buscando alguna de las palabras clave
function ubicarEncabezado(rows,claves){
  for(let i=0;i<Math.min(8,rows.length);i++){
    const j=rows[i].map(c=>String(c||'').toLowerCase()).join(' ');
    if(claves.every(k=>j.includes(k)))return i;
  }
  return -1;
}
// Busca el índice de una columna por variantes del encabezado
function buscarCol(headers,...variantes){
  for(const v of variantes){const i=headers.findIndex(h=>h.includes(v));if(i>=0)return i;}
  return -1;
}
const celda=(r,i)=>i>=0?String(r[i]??'').trim():'';

// Descarga un libro de una sola hoja con encabezado + ejemplos
function bajarPlantilla(nombreHoja,archivo,encabezado,ejemplos,anchos,notas){
  if(typeof XLSX==='undefined'){toast('⚠️ Librería Excel no cargada (¿sin internet?)','e');return;}
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([encabezado,...ejemplos]);
  ws['!cols']=anchos.map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,nombreHoja);
  if(notas&&notas.length){
    const wsn=XLSX.utils.aoa_to_sheet(notas.map(n=>[n]));
    wsn['!cols']=[{wch:110}];
    XLSX.utils.book_append_sheet(wb,wsn,'Instrucciones');
  }
  XLSX.writeFile(wb,archivo);
  toast('📄 Plantilla descargada — completa las filas y súbela con «Importar»');
}

// ── PLAN DE CUENTAS ──────────────────────────────────────────────────

const TIPOS_PDC={A:'Activo',P:'Pasivo',C:'Costo/Gasto',I:'Ingreso',S:'Subtítulo',T:'Título'};

function descargarPlantillaPDC(){
  bajarPlantilla('PlanDeCuentas','plantilla_plan_de_cuentas.xlsx',
    ['Código','Nombre','Tipo','Naturaleza'],
    [['1101201','BANCO ESTADO','A','D'],
     ['2102001','PROVEEDORES NACIONALES','P','C'],
     ['3202019','HONORARIOS PROFESIONALES','C','D'],
     ['4101002','INGRESOS POR VENTA','I','C'],
     ['11','ACTIVOS CORRIENTES','S','']],
    [14,42,10,12],
    ['PLAN DE CUENTAS — cómo completar la plantilla',
     '',
     'Código: número de hasta 7 dígitos (ej: 1101201) o formato XX.XX.XX (ej: 01.01.05).',
     'Nombre: descripción de la cuenta.',
     'Tipo: A = Activo · P = Pasivo · C = Costo/Gasto · I = Ingreso · S = Subtítulo · T = Título.',
     '   También se aceptan las palabras completas (Activo, Pasivo, Ingreso, etc.).',
     'Naturaleza: D = aumenta con el Debe · C = aumenta con el Haber.',
     '   Si la dejas vacía se deduce del tipo (A y C → D · P e I → C). Subtítulos y títulos no llevan.',
     '',
     'La importación actualiza las cuentas cuyo código ya existe y agrega las nuevas.',
     'Nunca elimina cuentas: para eso usa el Plan de Cuentas.']);
}

async function importarPDC(file){
  const rows=await leerMatriz(file);
  let hi=ubicarEncabezado(rows,['digo']);           // "Código" o "Codigo"
  if(hi<0)hi=ubicarEncabezado(rows,['cuenta']);
  if(hi<0)throw new Error('No se encontró la columna «Código». Usa la plantilla como base.');
  const headers=rows[hi].map(h=>String(h||'').toLowerCase().trim());
  const cCd=buscarCol(headers,'digo','codigo','cuenta');
  const cNm=buscarCol(headers,'nombre','descrip','glosa');
  const cTp=buscarCol(headers,'tipo','clase');
  const cNat=buscarCol(headers,'natural');
  if(cCd<0||cNm<0)throw new Error('Faltan las columnas «Código» y/o «Nombre».');

  const normTipo=t=>{
    const v=String(t||'').trim().toUpperCase();
    if(['A','P','C','I','S','T'].includes(v))return v;
    if(v.startsWith('ACTI'))return 'A';
    if(v.startsWith('PASI'))return 'P';
    if(v.startsWith('COST')||v.startsWith('GAST'))return 'C';
    if(v.startsWith('INGR'))return 'I';
    if(v.startsWith('SUBT'))return 'S';
    if(v.startsWith('TIT')||v.startsWith('TÍT'))return 'T';
    return '';
  };

  let nuevas=0,actualizadas=0;const errores=[];
  for(let i=hi+1;i<rows.length;i++){
    const r=rows[i];if(!r)continue;
    const cd=celda(r,cCd);
    if(!cd)continue;
    const nm=celda(r,cNm);
    if(!nm){errores.push({fila:i+1,ref:cd,motivo:'Falta el nombre de la cuenta'});continue;}
    if(!/^(\d{1,7}|\d{2}\.\d{2}\.\d{2})$/.test(cd)){
      errores.push({fila:i+1,ref:cd,motivo:'Código inválido (usa hasta 7 dígitos o XX.XX.XX)'});continue;
    }
    let tp=normTipo(celda(r,cTp));
    if(!tp){
      // Sin tipo explícito lo deducimos del primer dígito del código
      tp=cd.length<=2?'S':({'1':'A','2':'P','3':'C','4':'I'}[cd[0]]||'');
      if(!tp){errores.push({fila:i+1,ref:cd,motivo:'Tipo vacío y no deducible del código'});continue;}
    }
    let nat=String(celda(r,cNat)||'').trim().toUpperCase().slice(0,1);
    if(!['D','C'].includes(nat))nat='';
    if(!nat&&(tp==='A'||tp==='C'))nat='D';
    else if(!nat&&(tp==='P'||tp==='I'))nat='C';
    if(tp==='T'||tp==='S')nat='';

    const idx=PDC.findIndex(x=>x.cd===cd);
    if(idx>=0){PDC[idx]={cd,nm,tp,nat};actualizadas++;}
    else{PDC.push({cd,nm,tp,nat});nuevas++;}
  }
  // Orden por código para que el plan se vea consistente
  PDC.sort((a,b)=>String(a.cd).localeCompare(String(b.cd),'es',{numeric:true}));
  await savePDC();
  return {nuevas,actualizadas,errores,total:PDC.length};
}

// ── CENTROS DE COSTO ─────────────────────────────────────────────────

function descargarPlantillaCentros(){
  bajarPlantilla('CentrosCosto','plantilla_centros_costo.xlsx',
    ['Código','Nombre','Nivel','Código padre','Estado','Fecha inicio','Curva','Cuenta de costo'],
    [['P01','Predio Los Cerezos',1,'','','','',''],
     ['P01-C1','Cuartel 1 — Cerezos',2,'P01','formacion','2024-08-01','cerezo','3101003'],
     ['P01-C2','Cuartel 2 — Operativo',2,'P01','operativo','','','']],
    [14,38,8,14,16,14,14,16],
    ['CENTROS DE COSTO — cómo completar la plantilla',
     '',
     'Código: identificador corto tuyo (ej: P01). Sirve para enlazar los subcentros con su padre.',
     'Nombre: obligatorio.',
     'Nivel: 1 = centro principal (predio, área) · 2 = subcentro (cuartel, proyecto).',
     'Código padre: solo para nivel 2. Debe coincidir con el «Código» de un centro de nivel 1',
     '   (puede venir en la misma planilla, más arriba o más abajo).',
     'Estado (solo nivel 2): '+CC_ESTADOS.map(e=>e.id).join(' · ')+'.',
     '   operativo = sus costos van directo a resultado · formacion = acumula costos capitalizables.',
     'Fecha inicio: AAAA-MM-DD. Se usa para ubicar el año de la curva de capitalización.',
     'Curva (solo nivel 2, estado formacion): '+CURVAS_DEFAULT.map(c=>c.id).join(' · ')+'.',
     'Cuenta de costo (solo nivel 2): código del plan de cuentas. Por defecto 3101003.',
     '',
     'La importación actualiza los centros cuyo código ya existe y agrega los nuevos.',
     'Nunca elimina centros.']);
}

async function importarCentros(file){
  const rows=await leerMatriz(file);
  const hi=ubicarEncabezado(rows,['nombre']);
  if(hi<0)throw new Error('No se encontró la columna «Nombre». Usa la plantilla como base.');
  const headers=rows[hi].map(h=>String(h||'').toLowerCase().trim());
  const cCd=buscarCol(headers,'digo padre')>=0
    ? headers.findIndex(h=>(h.includes('digo')||h.includes('codigo'))&&!h.includes('padre'))
    : buscarCol(headers,'digo','codigo');
  const cNm=buscarCol(headers,'nombre','centro','descrip');
  const cNivel=buscarCol(headers,'nivel','tipo');
  const cPadre=buscarCol(headers,'padre','depende');
  const cEstado=buscarCol(headers,'estado');
  const cFecha=buscarCol(headers,'fecha');
  const cCurva=buscarCol(headers,'curva');
  const cCuenta=buscarCol(headers,'cuenta');
  if(cNm<0)throw new Error('Falta la columna «Nombre».');

  const estadosOk=CC_ESTADOS.map(e=>e.id);
  const curvasOk=CURVAS_DEFAULT.map(c=>c.id);
  const errores=[];
  // Primera pasada: se leen todas las filas válidas; los nivel 1 se crean antes
  // que los nivel 2 para poder resolver el padre por código.
  const filas=[];
  for(let i=hi+1;i<rows.length;i++){
    const r=rows[i];if(!r)continue;
    const nombre=celda(r,cNm);
    if(!nombre)continue;
    const nivel=+(celda(r,cNivel)||1)===2?2:1;
    filas.push({
      fila:i+1,nombre,nivel,
      codigo:celda(r,cCd),
      padre:celda(r,cPadre),
      estado:celda(r,cEstado).toLowerCase(),
      fechaInicio:celda(r,cFecha),
      curva:celda(r,cCurva).toLowerCase(),
      cuentaCosto:celda(r,cCuenta),
    });
  }
  if(!filas.length)throw new Error('No se encontró ninguna fila con nombre de centro.');

  // Índice por código y por nombre de lo que ya existe
  const buscarExistente=f=>centros().find(c=>
    (f.codigo&&String(c.codigo||'').toLowerCase()===f.codigo.toLowerCase())||
    (!f.codigo&&String(c.nombre||'').toLowerCase()===f.nombre.toLowerCase()));

  let nuevos=0,actualizados=0;
  const procesar=f=>{
    if(f.nivel===2&&f.estado&&!estadosOk.includes(f.estado)){
      errores.push({fila:f.fila,ref:f.nombre,motivo:`Estado «${f.estado}» no válido (${estadosOk.join(', ')})`});return;
    }
    if(f.nivel===2&&f.curva&&!curvasOk.includes(f.curva)){
      errores.push({fila:f.fila,ref:f.nombre,motivo:`Curva «${f.curva}» no válida (${curvasOk.join(', ')})`});return;
    }
    if(f.fechaInicio&&!/^\d{4}-\d{2}-\d{2}$/.test(f.fechaInicio)){
      errores.push({fila:f.fila,ref:f.nombre,motivo:'Fecha de inicio debe ser AAAA-MM-DD'});return;
    }
    let padreId=null;
    if(f.nivel===2){
      const p=centros().find(c=>c.nivel===1&&(
        (f.padre&&String(c.codigo||'').toLowerCase()===f.padre.toLowerCase())||
        (f.padre&&String(c.nombre||'').toLowerCase()===f.padre.toLowerCase())));
      if(!p){errores.push({fila:f.fila,ref:f.nombre,motivo:`No se encontró el centro padre «${f.padre||'(vacío)'}»`});return;}
      padreId=p.id;
    }
    const ex=buscarExistente(f);
    const campos={
      nombre:f.nombre,codigo:f.codigo||'',nivel:f.nivel,
      padre:f.nivel===2?padreId:null,
      estado:f.nivel===2?(f.estado||'formacion'):null,
      fechaInicio:f.fechaInicio||'',
      curva:f.nivel===2?(f.curva||'cerezo'):null,
      cuentaCosto:f.nivel===2?(f.cuentaCosto||'3101003'):null,
    };
    if(ex){Object.assign(ex,campos);actualizados++;}
    else{crearCentro(campos);nuevos++;}
  };
  filas.filter(f=>f.nivel===1).forEach(procesar);
  filas.filter(f=>f.nivel===2).forEach(procesar);

  await guardarCentros();
  return {nuevas:nuevos,actualizadas:actualizados,errores,total:centros().length};
}

// ── UI ───────────────────────────────────────────────────────────────

// Dispara el selector de archivos para un tipo concreto
function abrirCargaDatos(tipo){
  const input=document.getElementById('cd-file');
  if(!input)return;
  input.dataset.tipo=tipo;
  input.value='';
  input.click();
}

async function handleCargaDatos(e){
  const file=e.target.files[0];if(!file)return;
  const tipo=e.target.dataset.tipo||'';
  const etiquetas={pdc:'Plan de cuentas',centros:'Centros de costo',cliente:'Clientes',proveedor:'Proveedores'};
  try{
    let res;
    if(tipo==='pdc')res=await importarPDC(file);
    else if(tipo==='centros')res=await importarCentros(file);
    else if(tipo==='cliente'||tipo==='proveedor'){
      res=await importarFichasExcel(file,tipo);
      res.total=Object.keys(fichasAux(tipo)).length;
    }
    else throw new Error('Tipo de carga desconocido');
    CD.res[tipo]={...res,archivo:file.name,cuando:new Date().toLocaleTimeString('es-CL')};
    const partes=[];
    if(res.nuevas)partes.push(`${res.nuevas} nuevos`);
    if(res.actualizadas)partes.push(`${res.actualizadas} actualizados`);
    if(res.errores.length)partes.push(`${res.errores.length} con problemas`);
    toast(`✅ ${etiquetas[tipo]}: ${partes.join(' · ')||'sin cambios'}`);
    logAccion(`Importó ${etiquetas[tipo]} desde Excel`,`${res.nuevas} nuevos · ${res.actualizadas} actualizados · ${res.errores.length} con problemas`);
    rerender();
    renderCargaDatos();
  }catch(err){
    CD.res[tipo]={error:err.message,archivo:file.name,cuando:new Date().toLocaleTimeString('es-CL')};
    toast('❌ '+err.message,'e');
    renderCargaDatos();
  }
}

function initCargaDatosListener(){
  const input=document.getElementById('cd-file');
  if(input&&!input._bound){input._bound=true;input.addEventListener('change',handleCargaDatos);}
}

// Bloque de resultado de la última importación de un tipo
function bloqueResultado(tipo){
  const r=CD.res[tipo];
  if(!r)return '';
  if(r.error){
    return `<div style="margin-top:10px;background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.35);border-radius:6px;padding:9px 12px;font-size:11px">
      <strong style="color:var(--err)">No se pudo importar «${r.archivo}»</strong><br>${r.error}
    </div>`;
  }
  const errs=r.errores||[];
  const detalle=errs.length?`<div style="margin-top:7px;max-height:150px;overflow:auto;border-top:1px solid var(--bd);padding-top:6px">
      ${errs.slice(0,30).map(x=>`<div style="font-size:10px;color:var(--err);font-family:var(--mono)">fila ${x.fila}${x.ref||x.rut?` · ${x.ref||x.rut}`:''} — ${x.motivo}</div>`).join('')}
      ${errs.length>30?`<div style="font-size:10px;color:var(--mt);margin-top:4px">… y ${errs.length-30} más</div>`:''}
    </div>`:'';
  return `<div style="margin-top:10px;background:${errs.length?'rgba(210,153,34,.09)':'rgba(46,160,67,.08)'};border:1px solid ${errs.length?'rgba(210,153,34,.35)':'rgba(46,160,67,.3)'};border-radius:6px;padding:9px 12px;font-size:11px">
    <strong>${errs.length?'⚠️':'✅'} ${r.archivo}</strong> <span style="color:var(--mt)">· ${r.cuando}</span><br>
    ${r.nuevas||0} nuevos · ${r.actualizadas||0} actualizados${errs.length?` · <strong style="color:var(--err)">${errs.length} fila${errs.length===1?'':'s'} con problemas</strong>`:''}
    ${detalle}
  </div>`;
}

const TARJETAS=[
  {tipo:'pdc',icono:'📋',titulo:'Plan de Cuentas',
   sub:'Código · Nombre · Tipo · Naturaleza',
   detalle:'Actualiza las cuentas cuyo código ya existe y agrega las nuevas. Nunca borra cuentas.',
   cuenta:()=>PDC.length,unidad:'cuentas'},
  {tipo:'centros',icono:'📊',titulo:'Centros de Costo',
   sub:'Código · Nombre · Nivel · Código padre · Estado · Fecha inicio · Curva · Cuenta',
   detalle:'Admite centros principales (nivel 1) y subcentros (nivel 2) en la misma planilla; el padre se enlaza por código.',
   cuenta:()=>centros().length,unidad:'centros'},
  {tipo:'cliente',icono:'📇',titulo:'Clientes',
   sub:'RUT · Razón social · Giro · Dirección · Contacto · Cuenta por defecto',
   detalle:'La ficha se identifica por RUT (se valida el dígito verificador). La cuenta por defecto se aplica al importar ventas.',
   cuenta:()=>Object.keys(fichasAux('cliente')).length,unidad:'fichas'},
  {tipo:'proveedor',icono:'🏭',titulo:'Proveedores',
   sub:'RUT · Razón social · Giro · Dirección · Contacto · Cuenta y centro por defecto',
   detalle:'La cuenta y el centro de costo por defecto pre-clasifican los documentos al importar el libro de compras del SII.',
   cuenta:()=>Object.keys(fichasAux('proveedor')).length,unidad:'fichas'},
];

function descargarPlantillaDatos(tipo){
  if(tipo==='pdc')descargarPlantillaPDC();
  else if(tipo==='centros')descargarPlantillaCentros();
  else descargarPlantillaAux(tipo);
}

function renderCargaDatos(){
  const el=document.getElementById('cd-content');if(!el)return;
  el.innerHTML=`
    <div class="info-tip" style="margin-bottom:14px">
      💡 Descarga la plantilla, complétala en Excel y súbela. Los importadores <strong>actualizan lo que ya existe</strong>
      (por código o por RUT) y <strong>agregan lo nuevo</strong>: nunca eliminan registros.
      Si alguna fila tiene un problema se informa aquí con su número de fila para que la corrijas y vuelvas a subir el archivo.
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">
    ${TARJETAS.map(t=>`
      <div class="card" style="margin-bottom:0;display:flex;flex-direction:column">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-size:15px;font-weight:700">${t.icono} ${t.titulo}</div>
            <div style="font-size:11px;color:var(--mt);margin-top:3px;font-family:var(--mono)">${t.sub}</div>
          </div>
          <span class="badge bb" style="white-space:nowrap">${t.cuenta()} ${t.unidad}</span>
        </div>
        <div style="font-size:11px;color:var(--mt);line-height:1.5;flex:1">${t.detalle}</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-g" onclick="descargarPlantillaDatos('${t.tipo}')">📄 Plantilla</button>
          <button class="btn btn-p" onclick="abrirCargaDatos('${t.tipo}')">📥 Importar Excel</button>
        </div>
        ${bloqueResultado(t.tipo)}
      </div>`).join('')}
    </div>`;
}

export {CD, renderCargaDatos, descargarPlantillaDatos, descargarPlantillaPDC, descargarPlantillaCentros,
        importarPDC, importarCentros, abrirCargaDatos, handleCargaDatos, initCargaDatosListener};
