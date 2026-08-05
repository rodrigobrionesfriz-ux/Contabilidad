// importadoraux.js — Carga masiva de fichas de clientes y proveedores desde Excel.
//
// Los "auxiliares" no son entidades separadas: se derivan de los movimientos.
// Pero conviene poder pre-cargar una lista con los datos de contacto y
// razón social para que las nuevas facturas aparezcan ya con los datos
// completos y bien escritos.
//
// La ficha auxiliar se guarda como {rutCodigo, rutDV, razonSocial, giro,
// direccion, email, telefono, notas} en S.fichasAux[tipo][rut].

import {toast} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {rutParse} from './core.js';

// ── Estado ──
export const fichasAux=(tipo)=>{
  if(!S.fichasAux)S.fichasAux={cliente:{},proveedor:{}};
  if(!S.fichasAux[tipo])S.fichasAux[tipo]={};
  return S.fichasAux[tipo];
};

export async function guardarFichasAux(){
  if(!S.fichasAux)S.fichasAux={cliente:{},proveedor:{}};
  try{await window.storage.set('fichasAux',JSON.stringify(S.fichasAux));}catch(e){}
}

export async function cargarFichasAux(){
  try{
    const r=await window.storage.get('fichasAux');
    S.fichasAux=r?JSON.parse(r.value):{cliente:{},proveedor:{}};
    if(!S.fichasAux.cliente)S.fichasAux.cliente={};
    if(!S.fichasAux.proveedor)S.fichasAux.proveedor={};
  }catch(e){S.fichasAux={cliente:{},proveedor:{}};}
  return S.fichasAux;
}

export function fichaAux(tipo,rutCodigo){
  return fichasAux(tipo)[rutCodigo]||null;
}

// ── Descarga de plantilla ──
export function descargarPlantillaAux(tipo){
  if(typeof XLSX==='undefined'){toast('⚠️ Librería Excel no cargada','e');return;}
  const encabezado=[
    'RUT','Razón Social','Giro','Dirección','Comuna','Ciudad','Email','Teléfono','Notas',
    'Cuenta por defecto','Centro de costo por defecto'
  ];
  const ejemplo=[
    '76.543.210-K',
    tipo==='cliente'?'Ejemplo Cliente SpA':'Ejemplo Proveedor Ltda.',
    'Comercio al por menor',
    'Av. Providencia 1234, of. 501',
    'Providencia','Santiago',
    'contacto@ejemplo.cl','+56 9 1234 5678',
    'Notas internas opcionales',
    tipo==='cliente'?'4101001':'3101006',
    '',
  ];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([encabezado,ejemplo,[]]);
  ws['!cols']=[{wch:14},{wch:32},{wch:24},{wch:32},{wch:16},{wch:14},{wch:24},{wch:16},{wch:24},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb,ws,tipo==='cliente'?'Clientes':'Proveedores');
  XLSX.writeFile(wb,`plantilla_${tipo==='cliente'?'clientes':'proveedores'}.xlsx`);
  toast('📥 Plantilla descargada — completa las filas y súbela');
}

// ── Lectura de un Excel con la plantilla completa ──
export async function importarFichasExcel(file,tipo){
  if(typeof XLSX==='undefined')throw new Error('Librería Excel (XLSX) no está cargada');
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array'});
  const hoja=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(hoja,{header:1,defval:'',raw:false});
  if(!rows.length)throw new Error('El archivo está vacío');

  // Buscar la fila con "RUT" en la primera celda
  let headerIdx=-1;
  for(let i=0;i<Math.min(5,rows.length);i++){
    const primero=String(rows[i][0]||'').toLowerCase().trim();
    if(primero==='rut'){headerIdx=i;break;}
  }
  if(headerIdx<0)throw new Error('No se encontró la columna "RUT" en el archivo. Usa la plantilla como base.');

  const headers=rows[headerIdx].map(h=>String(h||'').toLowerCase().trim());
  const col=(...variantes)=>{
    for(const v of variantes){const i=headers.findIndex(h=>h.includes(v));if(i>=0)return i;}
    return -1;
  };
  const cRut=0;
  const cRazon=col('razon','razón');
  const cGiro=col('giro','actividad');
  const cDir=col('direcc','domicil');
  const cComuna=col('comuna');
  const cCiudad=col('ciudad');
  const cEmail=col('email','correo');
  const cTel=col('tel','fono','celular');
  const cNotas=col('nota','observ');
  const cCuenta=col('cuenta');
  const cCC=col('centro');

  const nuevas=[]; const actualizadas=[]; const errores=[];
  const existentes=fichasAux(tipo);

  for(let i=headerIdx+1;i<rows.length;i++){
    const r=rows[i];
    if(!r||!r[cRut])continue;
    const rutTxt=String(r[cRut]).trim();
    if(!rutTxt)continue;
    const info=rutParse(rutTxt);
    if(!info.codigo||!info.valido){
      errores.push({fila:i+1,rut:rutTxt,motivo:'RUT inválido'});continue;
    }
    const ficha={
      rutCodigo:info.codigo,
      rutDV:info.dv,
      razonSocial:cRazon>=0?String(r[cRazon]||'').trim():'',
      giro:cGiro>=0?String(r[cGiro]||'').trim():'',
      direccion:cDir>=0?String(r[cDir]||'').trim():'',
      comuna:cComuna>=0?String(r[cComuna]||'').trim():'',
      ciudad:cCiudad>=0?String(r[cCiudad]||'').trim():'',
      email:cEmail>=0?String(r[cEmail]||'').trim():'',
      telefono:cTel>=0?String(r[cTel]||'').trim():'',
      notas:cNotas>=0?String(r[cNotas]||'').trim():'',
      cuentaDefault:cCuenta>=0?String(r[cCuenta]||'').trim():'',
      ccDefault:cCC>=0?String(r[cCC]||'').trim():'',
    };
    if(!ficha.razonSocial){
      errores.push({fila:i+1,rut:rutTxt,motivo:'Falta razón social'});continue;
    }
    if(existentes[info.codigo])actualizadas.push(ficha);
    else nuevas.push(ficha);
    existentes[info.codigo]=ficha;
  }
  await guardarFichasAux();
  return {nuevas:nuevas.length, actualizadas:actualizadas.length, errores};
}

// ── UI: botón y manejador de archivo ──
export function abrirImportFichas(tipo){
  const input=document.getElementById('imp-fichas-file');
  if(!input)return;
  input.dataset.tipo=tipo;
  input.value='';
  input.click();
}

export async function handleImportFichas(e){
  const file=e.target.files[0];if(!file)return;
  const tipo=e.target.dataset.tipo||'cliente';
  try{
    const res=await importarFichasExcel(file,tipo);
    const partes=[];
    if(res.nuevas)partes.push(`${res.nuevas} nuevas`);
    if(res.actualizadas)partes.push(`${res.actualizadas} actualizadas`);
    if(res.errores.length)partes.push(`${res.errores.length} con errores`);
    toast(`✅ Fichas de ${tipo==='cliente'?'clientes':'proveedores'}: ${partes.join(' · ')||'sin cambios'}`);
    logAccion(`Importó fichas de ${tipo}s`,`${res.nuevas} nuevas · ${res.actualizadas} actualizadas`);
    if(res.errores.length){
      const detalle=res.errores.slice(0,5).map(x=>`  fila ${x.fila} (${x.rut}): ${x.motivo}`).join('\n');
      console.warn('Fichas con errores:\n'+detalle);
      if(res.errores.length>5)console.warn(`... y ${res.errores.length-5} más`);
    }
    rerender();
  }catch(err){
    toast('❌ '+err.message,'e');
  }
}

export function initImportFichasListener(){
  const input=document.getElementById('imp-fichas-file');
  if(input&&!input._bound){input._bound=true;input.addEventListener('change',handleImportFichas);}
}
