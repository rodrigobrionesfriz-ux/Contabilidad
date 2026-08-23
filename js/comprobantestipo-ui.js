// comprobantestipo-ui.js — Buscador y editor de comprobantes tipo.

import {toast, fmtC, pdcNm, PDC} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {inputCuenta} from './buscadorcuentas.js';
import {ccOpts} from './centroscosto.js';
import {EMPRESAS, empresaActiva} from './empresas.js';
import {comprobantesTipo, ctInfo, guardarComprobantes, crearComprobante,
        actualizarComprobante, eliminarComprobante, buscarComprobantes,
        lineasDesdeComprobante, resumenComprobante} from './comprobantestipo.js';

// Formulario de plantilla. El ENCABEZADO (nombre, descripción, glosa, montos)
// vive aquí y no sólo en el DOM: renderCTModal() reescribe todo el innerHTML,
// así que cualquier cosa que sólo estuviera en los inputs se perdía al agregar
// o borrar una línea — y con el nombre perdido, guardarCT() abortaba.
const CTF_VACIO=()=>({editId:null,nombre:'',descripcion:'',glosa:'',guardaMontos:false,
                      lineas:[{cd:'',desc:'',debe:0,haber:0,cc:''},{cd:'',desc:'',debe:0,haber:0,cc:''}]});
let CTF=CTF_VACIO();               // formulario de plantilla
let CT_SEL=0;                      // resultado resaltado en el buscador

// ══ BUSCADOR EN EL ENCABEZADO DEL FORMULARIO DE ASIENTOS ══

export function buscarCT(){
  const inp=document.getElementById('ct-search');
  const box=document.getElementById('ct-results');
  if(!inp||!box)return;
  const res=buscarComprobantes(inp.value);
  CT_SEL=0;
  if(!comprobantesTipo().length){
    box.innerHTML=`<div class="ac-item" style="color:var(--mt)">
      Aún no hay comprobantes tipo. Crea uno con el botón «+ Comprobante tipo».</div>`;
    box.style.display='block';return;
  }
  if(!res.length){
    box.innerHTML='<div class="ac-item" style="color:var(--mt)">Sin coincidencias</div>';
    box.style.display='block';return;
  }
  window._ctRes=res;
  box.innerHTML=res.map((c,i)=>{
    const r=resumenComprobante(c);
    return `<div class="ac-item${i===CT_SEL?' sel':''}" onmousedown="aplicarCT('${c.id}')">
      <div style="font-weight:600">${c.nombre}</div>
      <div style="font-size:10px;color:var(--mt)">
        ${r.cuentas} cuenta${r.cuentas===1?'':'s'}${c.guardaMontos&&r.total?' · '+fmtC(r.total):''}${c.descripcion?' · '+c.descripcion:''}
      </div>
    </div>`;
  }).join('');
  box.style.display='block';
}

export function cerrarBuscarCT(){
  setTimeout(()=>{const b=document.getElementById('ct-results');if(b)b.style.display='none';},180);
}

export function navCT(ev){
  const box=document.getElementById('ct-results');
  const res=window._ctRes||[];
  if(!box||box.style.display==='none'||!res.length)return;
  if(ev.key==='ArrowDown'){ev.preventDefault();CT_SEL=Math.min(CT_SEL+1,res.length-1);buscarCT();}
  else if(ev.key==='ArrowUp'){ev.preventDefault();CT_SEL=Math.max(CT_SEL-1,0);buscarCT();}
  else if(ev.key==='Enter'){ev.preventDefault();if(res[CT_SEL])aplicarCT(res[CT_SEL].id);}
  else if(ev.key==='Escape'){box.style.display='none';}
}

// Carga la plantilla en el formulario de asientos que está abierto
export function aplicarCT(id){
  const datos=lineasDesdeComprobante(id);
  if(!datos){toast('⚠️ No se encontró el comprobante tipo','e');return;}
  const c=ctInfo(id);
  // Si ya hay datos escritos, confirmar antes de reemplazar
  const AF=window.AF;
  const hayDatos=AF&&AF.lineas&&AF.lineas.some(l=>l.cd||l.debe||l.haber);
  if(hayDatos&&!confirm(`¿Aplicar "${c.nombre}"?\n\nSe reemplazarán las líneas que tengas escritas.`))return;
  AF.lineas=datos.lineas;
  const g=document.getElementById('af-glosa');
  if(g&&datos.glosa)g.value=datos.glosa;
  const inp=document.getElementById('ct-search');if(inp)inp.value='';
  const box=document.getElementById('ct-results');if(box)box.style.display='none';
  if(window.renderLineas)window.renderLineas();
  if(window.updCuadre)window.updCuadre();
  toast('📋 Plantilla aplicada: '+c.nombre);
}

// ══ EDITOR DE COMPROBANTES TIPO (modal) ══

export function abrirCTModal(){
  CTF=CTF_VACIO();
  const m=document.getElementById('ct-modal');
  if(m)m.classList.add('open');
  renderCTModal();
}

export function cerrarCTModal(){
  const m=document.getElementById('ct-modal');
  if(m)m.classList.remove('open');
  CTF=CTF_VACIO();
}

// Escapa un valor para meterlo dentro de un atributo HTML
const at=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

export function renderCTModal(){
  const cont=document.getElementById('ct-modal-body');
  if(!cont)return;
  const editando=!!CTF.editId;
  const lista=comprobantesTipo();

  const filas=CTF.lineas.map((l,i)=>`
    <div class="linea-row" style="display:grid;grid-template-columns:1fr 1fr 110px 110px 40px;gap:6px;margin-bottom:6px;align-items:start">
      <div>${inputCuenta({id:`ct-cd-${i}`,value:l.cd,onPick:`setCTCuenta(${i},'%CD%')`,placeholder:'Cuenta…'})}</div>
      <div><input type="text" class="linea-inp" placeholder="Descripción" value="${(l.desc||'').replace(/"/g,'&quot;')}" oninput="setCTCampo(${i},'desc',this.value)"></div>
      <div><input type="number" class="linea-num-inp" placeholder="Debe" value="${l.debe||''}" oninput="setCTCampo(${i},'debe',this.value)"></div>
      <div><input type="number" class="linea-num-inp" placeholder="Haber" value="${l.haber||''}" oninput="setCTCampo(${i},'haber',this.value)"></div>
      <div style="text-align:center"><button class="btn btn-d" style="padding:4px 8px;font-size:11px" onclick="delCTLinea(${i})">✕</button></div>
    </div>`).join('');

  const totD=CTF.lineas.reduce((s,l)=>s+(+l.debe||0),0);
  const totH=CTF.lineas.reduce((s,l)=>s+(+l.haber||0),0);
  const cuadra=Math.abs(totD-totH)<1;

  cont.innerHTML=`
    <div class="fg">
      <div class="grp"><label>Nombre del comprobante</label>
        <input type="text" id="ctf-nombre" value="${at(CTF.nombre)}" placeholder="Ej: Pago de arriendo mensual" oninput="setCTHeader('nombre',this.value)"></div>
      <div class="grp"><label>Descripción (opcional)</label>
        <input type="text" id="ctf-desc" value="${at(CTF.descripcion)}" placeholder="Para qué sirve esta plantilla" oninput="setCTHeader('descripcion',this.value)"></div>
      <div class="grp full"><label>Glosa sugerida</label>
        <input type="text" id="ctf-glosa" value="${at(CTF.glosa)}" placeholder="Se copiará a la glosa del asiento" oninput="setCTHeader('glosa',this.value)"></div>
      <div class="grp full">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="ctf-montos" ${CTF.guardaMontos?'checked':''} onchange="setCTHeader('guardaMontos',this.checked)" style="width:16px;height:16px">
          <span>Guardar también los montos</span>
        </label>
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Si lo dejas sin marcar, la plantilla solo trae las cuentas y tú escribes los montos cada vez.</div>
      </div>
    </div>

    <div style="margin-top:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 110px 110px 40px;gap:6px;font-size:10px;color:var(--mt);text-transform:uppercase;margin-bottom:4px">
        <div>Cuenta</div><div>Descripción</div><div>Debe</div><div>Haber</div><div></div>
      </div>
      ${filas}
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-i" onclick="addCTLinea()">+ Línea</button>
        <span id="ct-cuadre" style="font-size:11px;color:${cuadra?'var(--ach)':'var(--mt)'}">
          Debe ${fmtC(totD)} · Haber ${fmtC(totH)} ${totD||totH?(cuadra?'✓ cuadra':'· diferencia '+fmtC(Math.abs(totD-totH))):''}
        </span>
      </div>
      <div style="font-size:10px;color:var(--mt);margin-top:6px">La plantilla no necesita cuadrar si no guardas montos.</div>
    </div>

    <div class="save-row" style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-p" onclick="guardarCT()">💾 ${editando?'Actualizar':'Guardar'} comprobante</button>
      ${editando?'<button class="btn btn-g" onclick="nuevoCT()">+ Crear otro</button>':''}
      <button class="btn btn-g" onclick="cerrarCTModal()">Cerrar</button>
    </div>

    ${lista.length?`
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--bd)">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">Comprobantes guardados (${lista.length})</div>
      <div class="tw"><table>
        <thead><tr><th class="tl">NOMBRE</th><th style="text-align:right">CUENTAS</th><th style="text-align:right">MONTOS</th><th></th></tr></thead>
        <tbody>${lista.map(x=>{
          const r=resumenComprobante(x);
          return `<tr>
            <td class="tl" style="font-size:12px">${x.nombre}
              ${x.descripcion?`<div style="font-size:10px;color:var(--mt)">${x.descripcion}</div>`:''}</td>
            <td style="text-align:right;font-size:11px">${r.cuentas}</td>
            <td style="text-align:right;font-size:11px">${x.guardaMontos?fmtC(r.total):'—'}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn btn-i" onclick="editarCT('${x.id}')">✏️</button>
              ${EMPRESAS.lista.length>1?`<button class="btn btn-i" onclick="copiarCTaEmpresa('${x.id}')" title="Copiar a otra empresa">📋</button>`:''}
              <button class="btn btn-d" onclick="borrarCT('${x.id}')">🗑</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`:''}`;
}

// Guarda el encabezado en CTF a medida que se escribe, para que sobreviva a
// los re-render que provocan «+ Línea» y «✕».
export function setCTHeader(campo,valor){
  if(!(campo in CTF))return;
  CTF[campo]=campo==='guardaMontos'?!!valor:String(valor||'');
  if(campo==='guardaMontos')actualizarCuadreCT();
}

export function setCTCuenta(i,cd){
  if(CTF.lineas[i])CTF.lineas[i].cd=cd;
}
export function setCTCampo(i,campo,valor){
  if(!CTF.lineas[i])return;
  CTF.lineas[i][campo]=(campo==='debe'||campo==='haber')?(+valor||0):valor;
  // Debe y haber son excluyentes
  if(campo==='debe'&&+valor)CTF.lineas[i].haber=0;
  if(campo==='haber'&&+valor)CTF.lineas[i].debe=0;
  if(campo==='debe'||campo==='haber')actualizarCuadreCT();
}

// Refresca sólo la línea de totales. Re-renderizar el modal completo aquí
// haría perder el foco y el cursor mientras se escribe un monto.
function actualizarCuadreCT(){
  const el=document.getElementById('ct-cuadre');
  if(!el)return;
  const totD=CTF.lineas.reduce((s,l)=>s+(+l.debe||0),0);
  const totH=CTF.lineas.reduce((s,l)=>s+(+l.haber||0),0);
  const cuadra=Math.abs(totD-totH)<1;
  el.style.color=cuadra?'var(--ach)':'var(--mt)';
  el.textContent=`Debe ${fmtC(totD)} · Haber ${fmtC(totH)} `+
    (totD||totH?(cuadra?'✓ cuadra':'· diferencia '+fmtC(Math.abs(totD-totH))):'');
}
export function addCTLinea(){CTF.lineas.push({cd:'',desc:'',debe:0,haber:0,cc:''});renderCTModal();}
export function delCTLinea(i){
  if(CTF.lineas.length<=1)return;
  CTF.lineas.splice(i,1);renderCTModal();
}
export function nuevoCT(){
  CTF=CTF_VACIO();
  renderCTModal();
}

export function editarCT(id){
  const c=ctInfo(id);if(!c)return;
  CTF={editId:id, nombre:c.nombre||'', descripcion:c.descripcion||'', glosa:c.glosa||'',
       guardaMontos:!!c.guardaMontos, lineas:(c.lineas||[]).map(l=>({...l}))};
  if(!CTF.lineas.length)CTF.lineas=[{cd:'',desc:'',debe:0,haber:0,cc:''}];
  renderCTModal();
}

export async function guardarCT(){
  // Se leen los inputs por si el usuario escribió y disparó guardar antes de que
  // corriera el oninput (autocompletar del navegador, pegar con el mouse…).
  sincronizarEncabezadoCT();
  const nombre=(CTF.nombre||'').trim();
  if(!nombre){toast('⚠️ Ponle un nombre al comprobante','e');return;}
  const conCuenta=CTF.lineas.filter(l=>l.cd);
  if(!conCuenta.length){toast('⚠️ Agrega al menos una cuenta','e');return;}
  const datos={
    nombre,
    descripcion:(CTF.descripcion||'').trim(),
    glosa:(CTF.glosa||'').trim(),
    guardaMontos:!!CTF.guardaMontos,
    lineas:conCuenta,
  };
  if(CTF.editId){
    actualizarComprobante(CTF.editId,{...datos,
      lineas:conCuenta.map(l=>({...l,
        debe:datos.guardaMontos?(+l.debe||0):0,
        haber:datos.guardaMontos?(+l.haber||0):0}))});
    toast('✅ Comprobante actualizado');
  }else{
    crearComprobante(datos);
    toast('✅ Comprobante tipo creado');
  }
  await guardarComprobantes();
  logAccion(CTF.editId?'Editó comprobante tipo':'Creó comprobante tipo',nombre);
  CTF.editId=null;
  nuevoCT();
}

// Vuelca al estado lo que haya en los inputs del encabezado.
function sincronizarEncabezadoCT(){
  const v=id=>{const e=document.getElementById(id);return e?e.value:null;};
  const n=v('ctf-nombre');      if(n!=null)CTF.nombre=n;
  const d=v('ctf-desc');        if(d!=null)CTF.descripcion=d;
  const g=v('ctf-glosa');       if(g!=null)CTF.glosa=g;
  const m=document.getElementById('ctf-montos'); if(m)CTF.guardaMontos=!!m.checked;
}

export async function borrarCT(id){
  const c=ctInfo(id);if(!c)return;
  if(!confirm(`¿Eliminar el comprobante tipo "${c.nombre}"?`))return;
  eliminarComprobante(id);
  await guardarComprobantes();
  if(CTF.editId===id)nuevoCT();else renderCTModal();
  toast('🗑 Comprobante eliminado');
}

// Copiar una plantilla a otra empresa
export async function copiarCTaEmpresa(id){
  const c=ctInfo(id);if(!c)return;
  const otras=EMPRESAS.lista.filter(e=>e.id!==EMPRESAS.activa);
  if(!otras.length){toast('⚠️ No hay otras empresas','e');return;}
  const opciones=otras.map((e,i)=>`${i+1}. ${e.nombre}`).join('\n');
  const sel=prompt(`¿A qué empresa copiar "${c.nombre}"?\n\n${opciones}\n\nEscribe el número:`);
  const idx=parseInt(sel,10)-1;
  if(isNaN(idx)||idx<0||idx>=otras.length)return;
  const destino=otras[idx];
  try{
    // Leer las plantillas de la empresa destino, agregar y volver a guardar
    const prefijoActual=window.storage.getPrefijo();
    window.storage.setPrefijo(destino.id);
    let lista=[];
    try{
      const r=await window.storage.get('comprobantesTipo');
      lista=r?JSON.parse(r.value):[];
      if(!Array.isArray(lista))lista=[];
    }catch(e){lista=[];}
    lista.push({...c,id:'ct_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      creado:new Date().toISOString()});
    await window.storage.set('comprobantesTipo',JSON.stringify(lista));
    window.storage.setPrefijo(prefijoActual); // volver a la empresa activa
    toast(`📋 "${c.nombre}" copiado a ${destino.nombre}`);
    logAccion('Copió comprobante tipo',`${c.nombre} → ${destino.nombre}`);
  }catch(e){
    toast('❌ No se pudo copiar: '+e.message,'e');
  }
}
