// comprobantestipo-ui.js — Buscador y editor de comprobantes tipo.

import {toast, fmtC, pdcNm, PDC} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {inputCuenta} from './buscadorcuentas.js';
import {ccOpts, ccNombre} from './centroscosto.js';
import {aceptaCentroCosto} from './asientos.js';
import {EMPRESAS, empresaActiva} from './empresas.js';
import {comprobantesTipo, ctInfo, guardarComprobantes, crearComprobante,
        actualizarComprobante, eliminarComprobante, buscarComprobantes,
        lineasDesdeComprobante, resumenComprobante} from './comprobantestipo.js';

// Formulario de plantilla. El ENCABEZADO (nombre, descripción, glosa, montos)
// vive aquí y no sólo en el DOM: renderCTModal() reescribe todo el innerHTML,
// así que cualquier cosa que sólo estuviera en los inputs se perdía al agregar
// o borrar una línea — y con el nombre perdido, guardarCT() abortaba.
const CTF_VACIO=()=>({editId:null,nombre:'',descripcion:'',glosa:'',guardaMontos:false,
                      lineas:[{cd:'',desc:'',debe:0,haber:0,cc:''},{cd:'',desc:'',debe:0,haber:0,cc:''}],
                      // Distribución del gasto: reparte un monto entre cuentas de
                      // gasto por porcentaje, con centro de costo por línea.
                      distActiva:false, distBase:0,
                      dist:[{cd:'',pct:0,cc:''}]});
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
        ${r.cuentas} cuenta${r.cuentas===1?'':'s'}${r.dist?' · ⚖️ reparte en '+r.dist:''}${c.guardaMontos&&r.total?' · '+fmtC(r.total):''}${c.descripcion?' · '+c.descripcion:''}
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
  const c=ctInfo(id);
  if(!c){toast('⚠️ No se encontró el comprobante tipo','e');return;}
  // Si la plantilla reparte un gasto y no trae el monto guardado, se pide aquí:
  // así el % se aplica sobre la cifra real de este documento.
  let montoDist=null;
  const tieneDist=c.distActiva&&(c.dist||[]).some(d=>d.cd&&(+d.pct||0)>0);
  if(tieneDist&&!(c.guardaMontos&&+c.distBase>0)){
    const r=prompt(`"${c.nombre}" reparte el gasto entre ${(c.dist||[]).filter(d=>d.cd&&+d.pct>0).length} cuentas.\n\nMonto total a distribuir (deja vacío para completarlo a mano):`,'');
    if(r===null)return;                       // canceló
    montoDist=r.trim()?(+String(r).replace(/[^0-9-]/g,'')||0):0;
  }
  const datos=lineasDesdeComprobante(id,montoDist);
  if(!datos){toast('⚠️ No se encontró el comprobante tipo','e');return;}
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
  toast('📋 Plantilla aplicada: '+c.nombre+(datos.distribuido?` · gasto repartido en ${datos.distribuido} cuentas`:''));
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

    ${bloqueDistribucion()}

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
            <td style="text-align:right;font-size:11px">${r.cuentas}${r.dist?`<div style="font-size:10px;color:var(--acc)">⚖️ ${r.dist} por %</div>`:''}</td>
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

// ── DISTRIBUCIÓN DEL GASTO POR PORCENTAJE ──
// Reparte un mismo gasto entre varias cuentas de gasto según un %, y a cada
// tramo se le puede asignar su centro de costo. Al aplicar la plantilla, cada
// fila se convierte en una línea del asiento.
function bloqueDistribucion(){
  const activa=!!CTF.distActiva;
  const filas=(CTF.dist||[]).map((d,i)=>{
    const admiteCC=d.cd?aceptaCentroCosto(d.cd):true;
    const monto=CTF.guardaMontos&&+CTF.distBase?Math.round((+CTF.distBase)*(+d.pct||0)/100):0;
    return `<div style="display:grid;grid-template-columns:1fr 90px 1fr 110px 40px;gap:6px;margin-bottom:6px;align-items:start">
      <div>${inputCuenta({id:`ctd-cd-${i}`,value:d.cd,onPick:`setCTDist(${i},'cd','%CD%')`,placeholder:'Cuenta de gasto…',filtro:'gasto'})}</div>
      <div><input type="number" class="linea-num-inp" step="0.01" min="0" max="100" placeholder="%" value="${d.pct||''}" oninput="setCTDist(${i},'pct',this.value)"></div>
      <div>${admiteCC
        ? `<select class="linea-inp" title="Centro de costo" onchange="setCTDist(${i},'cc',this.value)">${opcionesCC(d.cc||'')}</select>`
        : `<input type="text" class="linea-inp" disabled title="El centro de costo sólo aplica a cuentas de gasto o ingreso" placeholder="—" style="opacity:.45">`}</div>
      <div style="font-family:var(--mono);font-size:11px;color:var(--mt);padding-top:7px;text-align:right">${monto?fmtC(monto):'—'}</div>
      <div style="text-align:center"><button class="btn btn-d" style="padding:4px 8px;font-size:11px" onclick="delCTDist(${i})">✕</button></div>
    </div>`;
  }).join('');

  const suma=(CTF.dist||[]).reduce((s,d)=>s+(+d.pct||0),0);
  const cuadra=Math.abs(suma-100)<0.01;
  const conCuenta=distValidas().length;

  return `<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--bd)">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" ${activa?'checked':''} onchange="toggleCTDist(this.checked)" style="width:16px;height:16px">
      <span style="font-weight:600">Distribuir el gasto entre varias cuentas por porcentaje</span>
    </label>
    <div style="font-size:10px;color:var(--mt);margin-top:2px;margin-left:24px">
      Útil cuando un mismo documento se reparte entre predios o áreas. Cada tramo puede llevar su centro de costo.
    </div>
    ${activa?`
    <div style="margin-top:12px">
      ${CTF.guardaMontos?`
      <div class="grp" style="max-width:260px;margin-bottom:10px">
        <label>Monto a distribuir</label>
        <input type="number" min="0" value="${CTF.distBase||''}" placeholder="0" oninput="setCTHeader('distBase',this.value)">
      </div>`:`
      <div style="font-size:11px;color:var(--mt);margin-bottom:10px">
        Como la plantilla no guarda montos, sólo se guardan los porcentajes: al aplicarla escribes el monto y se reparte solo.
      </div>`}
      <div style="display:grid;grid-template-columns:1fr 90px 1fr 110px 40px;gap:6px;font-size:10px;color:var(--mt);text-transform:uppercase;margin-bottom:4px">
        <div>Cuenta de gasto</div><div>%</div><div>Centro de costo</div><div style="text-align:right">Monto</div><div></div>
      </div>
      ${filas}
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-i" onclick="addCTDist()">+ Cuenta</button>
        <button class="btn btn-i" onclick="repartirCTDist()" title="Reparte 100% en partes iguales entre las cuentas con código">⚖️ Repartir en partes iguales</button>
        <span id="ct-dist-suma" style="font-size:11px;color:${cuadra?'var(--ach)':'var(--warn)'}">
          Suma ${fmtPct(suma)}% ${cuadra?'✓':'· faltan '+fmtPct(100-suma)+'%'}
        </span>
        <span style="font-size:11px;color:var(--mt)">${conCuenta} cuenta${conCuenta===1?'':'s'}</span>
      </div>
    </div>`:''}
  </div>`;
}

// Opciones de centro de costo. Si la plantilla apunta a un centro que ya no
// existe (lo borraron después), se agrega igual como opción marcada: perderlo
// en silencio al editar cambiaría la imputación sin que nadie se entere.
function opcionesCC(sel){
  const html=ccOpts(sel||'');
  if(sel&&!html.includes(`value="${sel}"`))
    return `<option value="${sel}" selected>⚠ centro no encontrado (${sel})</option>`+html;
  return html;
}

export function toggleCTDist(v){
  CTF.distActiva=!!v;
  if(CTF.distActiva&&!(CTF.dist||[]).length)CTF.dist=[{cd:'',pct:0,cc:''}];
  renderCTModal();
}
export function setCTDist(i,campo,valor){
  if(!CTF.dist||!CTF.dist[i])return;
  if(campo==='pct'){
    let v=+valor||0;
    if(v<0)v=0; if(v>100)v=100;
    CTF.dist[i].pct=v;
    actualizarCuadreDist();
    return;                      // sin re-render: se perdería el foco al teclear
  }
  CTF.dist[i][campo]=valor||'';
  // Si la cuenta nueva no admite centro de costo, el que hubiera queda sin sentido
  if(campo==='cd'&&valor&&!aceptaCentroCosto(valor))CTF.dist[i].cc='';
  if(campo==='cd')renderCTModal();
}
export function addCTDist(){
  if(!CTF.dist)CTF.dist=[];
  CTF.dist.push({cd:'',pct:0,cc:''});
  renderCTModal();
}
export function delCTDist(i){
  if(!CTF.dist)return;
  if(CTF.dist.length<=1)CTF.dist=[{cd:'',pct:0,cc:''}];
  else CTF.dist.splice(i,1);
  renderCTModal();
}
// Reparte 100% en partes iguales; el sobrante de redondeo va a la última fila
// para que la suma dé exactamente 100.
export function repartirCTDist(){
  const idx=(CTF.dist||[]).map((d,i)=>({d,i})).filter(x=>x.d.cd).map(x=>x.i);
  if(!idx.length){toast('⚠️ Primero elige las cuentas de gasto','e');return;}
  const base=Math.floor(10000/idx.length)/100;      // dos decimales
  idx.forEach(i=>{CTF.dist[i].pct=base;});
  const suma=idx.reduce((s,i)=>s+CTF.dist[i].pct,0);
  CTF.dist[idx[idx.length-1]].pct=Math.round((base+100-suma)*100)/100;
  renderCTModal();
}
function actualizarCuadreDist(){
  // Sólo se repinta al soltar el campo; aquí basta con no hacer nada pesado.
  const el=document.getElementById('ct-dist-suma');
  if(!el)return;
  const suma=(CTF.dist||[]).reduce((s,d)=>s+(+d.pct||0),0);
  const cuadra=Math.abs(suma-100)<0.01;
  el.style.color=cuadra?'var(--ach)':'var(--warn)';
  el.textContent=`Suma ${fmtPct(suma)}% `+(cuadra?'✓':'· faltan '+fmtPct(100-suma)+'%');
}

// Guarda el encabezado en CTF a medida que se escribe, para que sobreviva a
// los re-render que provocan «+ Línea» y «✕».
export function setCTHeader(campo,valor){
  if(!(campo in CTF))return;
  if(campo==='guardaMontos'){CTF.guardaMontos=!!valor;renderCTModal();return;}
  if(campo==='distBase'){CTF.distBase=+valor||0;return;}
  CTF[campo]=String(valor||'');
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
       guardaMontos:!!c.guardaMontos, lineas:(c.lineas||[]).map(l=>({...l})),
       distActiva:!!c.distActiva, distBase:+c.distBase||0,
       dist:(c.dist||[]).length?c.dist.map(d=>({...d})):[{cd:'',pct:0,cc:''}]};
  if(!CTF.lineas.length)CTF.lineas=[{cd:'',desc:'',debe:0,haber:0,cc:''}];
  renderCTModal();
}

export async function guardarCT(){
  // Se leen los inputs por si el usuario escribió y disparó guardar antes de que
  // corriera el oninput (autocompletar del navegador, pegar con el mouse…).
  sincronizarEncabezadoCT();
  const nombre=(CTF.nombre||'').trim();
  if(!nombre){toast('⚠️ Ponle un nombre al comprobante','e');return;}
  // Las líneas SIN cuenta se conservan: una plantilla puede reservar filas en
  // blanco para completar al momento de usarla. Sólo se descartan las que
  // quedaron totalmente vacías al final, para no arrastrar filas fantasma.
  const lineas=recortarVacias(CTF.lineas);
  const dist=distValidas();
  if(!lineas.some(l=>l.cd||l.desc)&&!dist.length){
    toast('⚠️ La plantilla está vacía: agrega al menos una cuenta o una descripción','e');return;
  }
  if(CTF.distActiva&&dist.length){
    const suma=dist.reduce((s,d)=>s+(+d.pct||0),0);
    if(Math.abs(suma-100)>0.01){
      toast(`⚠️ La distribución suma ${fmtPct(suma)}% — debe sumar 100%`,'e');return;
    }
  }
  const datos={
    nombre,
    descripcion:(CTF.descripcion||'').trim(),
    glosa:(CTF.glosa||'').trim(),
    guardaMontos:!!CTF.guardaMontos,
    lineas,
    distActiva:!!CTF.distActiva&&dist.length>0,
    distBase:CTF.guardaMontos?(+CTF.distBase||0):0,
    dist,
  };
  if(CTF.editId){
    actualizarComprobante(CTF.editId,{...datos,
      lineas:lineas.map(l=>({...l,
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

// Porcentajes con hasta dos decimales, en formato chileno
const fmtPct=v=>String(Math.round((+v||0)*100)/100).replace('.',',');

// Quita sólo las filas finales completamente vacías (sin cuenta, sin texto y
// sin monto). Las vacías intercaladas se respetan: el usuario las puso ahí.
function recortarVacias(lineas){
  const l=lineas.map(x=>({...x}));
  const vacia=x=>!x.cd&&!String(x.desc||'').trim()&&!(+x.debe||0)&&!(+x.haber||0);
  while(l.length&&vacia(l[l.length-1]))l.pop();
  return l;
}

// Filas de distribución utilizables: con cuenta y porcentaje mayor que cero
function distValidas(){
  return (CTF.dist||[]).filter(d=>d.cd&&(+d.pct||0)>0)
    .map(d=>({cd:d.cd,pct:+d.pct||0,cc:d.cc||''}));
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
