// asientos.js — Asientos manuales, modal DTE, documentos unificados
import {toast, fmtC, pn, today, IVA, pdcNm, PDC, CUENTAS_SEL, rutParse, rutFmt, dteV, dteC, rutDV} from './core.js';
import {updateHdr} from './empresa.js';
import {nav, rerender} from './ui.js';
import {cuentasGastoOpts, dteComprasOpts} from './compras.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {foliosMensuales, dteVentasOpts} from './helpers.js';
import {retencionHonorarios} from './indicadores.js';
import {ccOpts} from './centroscosto.js';
import {inputCuenta, inputCC, inputAux} from './buscadorcuentas.js';
import {fichaAux} from './importadoraux.js';
import './storage.js';

// Estado del formulario de asientos (interno del módulo; se reasigna al abrir/editar)
// AF NUNCA debe reasignarse. app.js expone este objeto con Object.assign(window,{AF})
// una sola vez al arrancar, y los onclick/oninput del HTML generado leen
// window.AF. Si aquí se hiciera AF={...}, window.AF quedaría apuntando al objeto
// viejo y todo lo que esos handlers escriben (descripción, centro de costo,
// razón social) se perdería en silencio, además de romper aplicarCT().
// Por eso el estado se reemplaza mutando las propiedades, no la referencia.
const AF={editId:null,lineas:[]};
function fijarAF(editId,lineas){
  AF.editId=editId==null?null:editId;
  AF.lineas=lineas||[];
}
const lineasEnBlanco=()=>[{cd:'',nm:'',desc:'',debe:0,haber:0},{cd:'',nm:'',desc:'',debe:0,haber:0}];

// ═══ ASIENTOS MANUALES ═══
// Cuentas que requieren sub-auxiliar (RUT + razón social): clientes, proveedores
// Cuentas que llevan auxiliar: al usarlas se abre el modal para registrar el documento.
//   cliente    → factura de venta (IVA débito)
//   proveedor  → factura de compra (IVA crédito) + distribución de gastos
//   honorario  → boleta de honorarios (retención, sin IVA)
const CUENTAS_AUX={
  '1104001':'cliente',
  '2102001':'proveedor',
  '2102006':'honorario',   // HONORARIOS POR PAGAR
  '3202019':'honorario',   // HONORARIOS PROFESIONALES
};
const esAux=cd=>!!CUENTAS_AUX[cd];

// ── ¿Esta cuenta admite centro de costo? ──
// Sólo las de RESULTADO: gastos/costos (tp 'C', prefijo 3) e ingresos (tp 'I',
// prefijo 4). Un centro de costo responde "¿dónde se gastó / de dónde vino
// esto?", una pregunta que no tiene sentido sobre un banco, un proveedor o el
// capital: el activo y el pasivo son saldos, no consumo.
//
// Se mira el `tp` del plan de cuentas y, si la cuenta no está en el plan
// (cargada desde Excel, por ejemplo), se cae al prefijo del código.
export function aceptaCentroCosto(cd){
  const c=String(cd||'');
  if(c.length<1)return false;
  const cta=PDC.find(x=>x.cd===c);
  if(cta&&cta.tp)return cta.tp==='C'||cta.tp==='I';
  return c[0]==='3'||c[0]==='4';
}

function renderAsientos(){
  updateHdr();
  // El listado de asientos manuales desapareció como módulo: ahora todos los
  // comprobantes —apertura, automáticos y manuales— se ven en Comprobantes.
  // La función sobrevive porque varios flujos la llaman tras guardar.
  const el=document.getElementById('as-list');
  if(!el)return;
  if(!S.asientos.length){
    el.innerHTML=`<div class="empty"><div class="ei">✏️</div>No hay asientos manuales.<br><br><button class="btn btn-p" onclick="abrirForm()">+ Crear primer asiento</button></div>`;return;
  }
  const sorted=[...S.asientos].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  let h='';
  sorted.forEach((a,idx)=>{
    const tD=a.movs.reduce((s,m)=>s+m.debe,0),tH=a.movs.reduce((s,m)=>s+m.haber,0),ok=tD===tH;
    const anul=!!a.anulado;
    h+=`<div class="asiento-item" style="${anul?'opacity:.5;filter:grayscale(.6)':''}">
      <div class="asiento-hdr" onclick="toggleAs('ab${a.id}')">
        <span class="as-num">N°${a.n||idx+1}</span>
        <span class="as-fecha">${a.fecha}</span>
        <span class="as-glosa" style="${anul?'text-decoration:line-through':''}">${a.glosa||'(sin glosa)'}</span>
        ${anul?'<span class="badge br">🚫 ANULADO</span>':`<span class="badge ${ok?'bg':'br'}">${ok?'✓ Cuadrado':'⚠ Descuadre'}</span>`}
        <span class="as-tot">${fmtC(tD)}</span>
        <div class="as-actions">
          ${anul?
            `<button class="btn btn-i" onclick="event.stopPropagation();anularAsiento('${a.id}')">↩️ Reactivar</button>`:
            `<button class="btn btn-i" onclick="event.stopPropagation();editarAsiento('${a.id}')">✏️ Editar</button>
             <button class="btn btn-s" onclick="event.stopPropagation();duplicarAsiento('${a.id}')">📋 Duplicar</button>
             <button class="btn btn-i" style="color:var(--warn,#d29922);border-color:var(--warn,#d29922)" onclick="event.stopPropagation();anularAsiento('${a.id}')">🚫 Anular</button>`}
          <button class="btn btn-d" onclick="event.stopPropagation();eliminarAsiento('${a.id}')">🗑</button>
        </div>
      </div>
      <div class="asiento-body" id="ab${a.id}">
        <div style="margin-top:12px">
          <div style="display:grid;grid-template-columns:36px 1fr 110px 110px;padding:5px 0;font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;border-bottom:1px solid var(--bd)">
            <div style="text-align:center">#</div><div style="padding-left:8px">Cuenta</div><div style="text-align:right">Debe</div><div style="text-align:right">Haber</div>
          </div>
          ${a.movs.map((m,li)=>`<div style="display:grid;grid-template-columns:36px 1fr 110px 110px;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(48,54,61,.4)">
            <div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--mt)">${li+1}</div>
            <div style="${m.haber>0?'padding-left:20px;color:var(--mt)':''}padding-left:${m.haber>0?'20':'8'}px">
              <span style="font-family:var(--mono);font-size:10px;color:var(--mt)">${m.cd}</span>
              <span style="margin-left:6px">${m.nm||pdcNm(m.cd)}</span>
              ${m.desc?`<span style="color:var(--mt);font-size:11px"> — ${m.desc}</span>`:''}
              ${m.rutCodigo?`<div style="font-size:10px;color:var(--info);margin-top:2px;padding-left:${m.haber>0?'0':'0'}px"><span style="font-family:var(--mono)">${rutFmt(m.rutCodigo,m.rutDV)}</span>${m.razonSocial?' · '+m.razonSocial:''}</div>`:''}
            </div>
            <div style="text-align:right;font-family:var(--mono);color:${m.debe?'var(--tx)':'var(--bd)'}">${m.debe?fmtC(m.debe):'–'}</div>
            <div style="text-align:right;font-family:var(--mono);color:${m.haber?'var(--mt)':'var(--bd)'}">${m.haber?fmtC(m.haber):'–'}</div>
          </div>`).join('')}
          <div style="display:grid;grid-template-columns:36px 1fr 110px 110px;padding:7px 0;font-weight:700;font-size:12px;border-top:1px solid var(--bd);margin-top:4px">
            <div></div>
            <div style="padding-left:8px;font-size:10px;color:var(--mt);text-transform:uppercase">Total</div>
            <div style="text-align:right;font-family:var(--mono);color:var(--ach)">${fmtC(tD)}</div>
            <div style="text-align:right;font-family:var(--mono);color:var(--ach)">${fmtC(tH)}</div>
          </div>
        </div>
      </div>
    </div>`;
  });
  el.innerHTML=h;
}
function toggleAs(id){const el=document.getElementById(id);if(el)el.classList.toggle('open');}

// — Formulario —
function cuentasOpts(sel=''){
  return '<option value="">— seleccionar cuenta —</option>'+CUENTAS_SEL.map(c=>`<option value="${c.cd}" ${c.cd===sel?'selected':''}>${c.cd} \u2013 ${c.nm}</option>`).join('');
}

function renderLineas(){
  const box=document.getElementById('af-lineas');
  if(!AF.lineas.length){box.innerHTML='<div style="padding:14px;text-align:center;color:var(--mt);font-size:12px">Agrega al menos 2 líneas</div>';return;}
  box.innerHTML=AF.lineas.map((l,i)=>{
    const aux=esAux(l.cd);
    const tipoAux=CUENTAS_AUX[l.cd]||'';
    let auxHtml='';
    if(aux){
      if(l.dte){
        // Ya tiene DTE asociado: mostrar badge resumen
        const folio=folioPreviewDte(l.dte,l.cd,i);
        const dteInfo=l.cd==='1104001'?dteV(l.dte.tipoDTE):dteC(l.dte.tipoDTE);
        const dteNm=dteInfo?.nm||'';
        auxHtml=`<div class="linea-dte-badge">
          <div class="ldb-lbl">📄 DTE</div>
          <div class="ldb-info">
            <b>Folio ${folio}</b> · ${l.dte.fecha} · ${dteNm} N°${l.dte.numero} · ${rutFmt(l.dte.rutCodigo,l.dte.rutDV)} · ${l.dte.razonSocial||''} · <b>${fmtC(l.dte.total)}</b>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-i" onclick="abrirDteModal(${i})">✏️ Editar</button>
            <button class="btn btn-d" onclick="quitarDte(${i})">✕</button>
          </div>
        </div>`;
      }else{
        // Sin DTE: campos RUT rápidos + botón para abrir modal DTE
        const rutVal=(l.rutCodigo||'')+(l.rutDV||'');
        let dvHtml='',dvCls='rut-dv-ln';
        if(l.rutCodigo){
          if(l.rutDV&&rutDV(l.rutCodigo)===String(l.rutDV).toUpperCase()){dvHtml='✓ '+l.rutDV;dvCls='rut-dv-ln ok';}
          else if(l.rutDV){dvHtml='✗';dvCls='rut-dv-ln bad';}
        }
        auxHtml=`<div class="linea-aux">
          <div></div>
          <div class="linea-aux-lbl">RUT ${tipoAux}</div>
          <div class="rut-wrap">
            ${inputAux({id:`ln-rut-${i}`,tipo:tipoAux==='cliente'?'cliente':'proveedor',
                        value:rutVal,onPick:`lAuxElegido(${i},'%RUT%')`,
                        placeholder:'RUT o nombre…'})}
            <span class="${dvCls}" id="ln-dv-${i}">${dvHtml}</span>
          </div>
          <div style="display:flex;gap:6px">
            <input type="text" class="linea-inp" style="flex:1" placeholder="Razón social" value="${l.razonSocial||''}" oninput="AF.lineas[${i}].razonSocial=this.value">
            <button class="btn btn-i" style="padding:4px 9px;font-size:10px;white-space:nowrap" onclick="abrirDteModal(${i})">📄 DTE</button>
          </div>
        </div>`;
      }
    }
    return `<div class="linea-row">
      <div class="linea-num">${i+1}</div>
      <div>${inputCuenta({id:`ln-cd-${i}`,value:l.cd,onPick:`lCd(${i},'%CD%')`,placeholder:'Código o nombre…'})}</div>
      <div>${aceptaCentroCosto(l.cd)
        ? inputCC({id:`ln-cc-${i}`,value:l.cc||'',onPick:`AF.lineas[${i}].cc='%CC%'`,placeholder:'Buscar centro…'})
        : `<input type="text" class="linea-inp" disabled title="${l.cd?'El centro de costo sólo aplica a cuentas de gasto o ingreso':'Elige primero la cuenta'}" placeholder="${l.cd?'—':''}" style="opacity:.45">`}</div>
      <div><input type="text" class="linea-num-inp ${digitsClass(l.debe)}" inputmode="numeric" placeholder="0" value="${l.debe?new Intl.NumberFormat('es-CL').format(Math.round(l.debe)):''}" oninput="lValFmt(this,${i},'debe')" onblur="lValFmtBlur(this,${i},'debe')" onfocus="this.select()"></div>
      <div><input type="text" class="linea-num-inp ${digitsClass(l.haber)}" inputmode="numeric" placeholder="0" value="${l.haber?new Intl.NumberFormat('es-CL').format(Math.round(l.haber)):''}" oninput="lValFmt(this,${i},'haber')" onblur="lValFmtBlur(this,${i},'haber')" onfocus="this.select()"></div>
      <div><input type="text" class="linea-inp" placeholder="Descripción libre" maxlength="120" value="${(l.desc||'').replace(/"/g,'&quot;')}" oninput="AF.lineas[${i}].desc=this.value"></div>
      <div style="text-align:center"><button class="btn btn-d" onclick="delLinea(${i})">✕</button></div>
    </div>${auxHtml}`;
  }).join('');
  updCuadre();
}

function lCd(i,cd){
  AF.lineas[i].cd=cd;
  AF.lineas[i].nm=pdcNm(cd);
  if(!esAux(cd)){delete AF.lineas[i].rutCodigo;delete AF.lineas[i].rutDV;delete AF.lineas[i].razonSocial;delete AF.lineas[i].dte;}
  // Si la cuenta nueva no admite centro de costo, el que hubiera queda sin
  // sentido: se descarta en vez de arrastrarse invisible hasta el guardado.
  if(!aceptaCentroCosto(cd))delete AF.lineas[i].cc;
  renderLineas();
}
// Elegir un auxiliar del buscador: trae RUT, dígito verificador y razón social
// desde la ficha. Si el RUT no tiene ficha, igual queda registrado — sólo que
// sin datos que autocompletar.
function lAuxElegido(i,rut){
  const l=AF.lineas[i];
  const tipo=CUENTAS_AUX[l.cd]==='cliente'?'cliente':'proveedor';
  l.rutCodigo=String(rut||'');
  l.rutDV=rutDV(l.rutCodigo)||'';
  const f=fichaAux(tipo,l.rutCodigo);
  if(f){
    l.razonSocial=f.razonSocial||f.nombre||'';
    if(f.giro)l.giro=f.giro;
  }
  renderLineas();
  // Dejar el foco donde el usuario va a seguir escribiendo
  setTimeout(()=>{const el=document.getElementById('ln-rut-'+i);if(el)el.blur();},0);
}

function lRut(i,val){
  const r=rutParse(val);
  AF.lineas[i].rutCodigo=r.codigo||'';
  AF.lineas[i].rutDV=r.dv||'';
  const el=document.getElementById('ln-dv-'+i);
  if(el){
    if(!r.raw){el.textContent='';el.className='rut-dv-ln';}
    else if(r.codigo&&r.valido){el.textContent='✓ '+r.dv;el.className='rut-dv-ln ok';
      if(!AF.lineas[i].razonSocial){
        const tipoAux=CUENTAS_AUX[AF.lineas[i].cd];
        let prev=null;
        if(tipoAux==='cliente')prev=S.ventas.find(v=>v.rutCodigo===r.codigo&&v.razonSocial);
        else if(tipoAux==='proveedor')prev=S.compras.find(c=>c.rutCodigo===r.codigo&&c.razonSocial);
        if(!prev){
          for(const as of S.asientos){
            const mm=(as.movs||[]).find(mv=>mv.rutCodigo===r.codigo&&mv.razonSocial);
            if(mm){prev=mm;break;}
            const mdte=(as.movs||[]).find(mv=>mv.dte&&mv.dte.rutCodigo===r.codigo&&mv.dte.razonSocial);
            if(mdte){prev=mdte.dte;break;}
          }
        }
        if(prev){AF.lineas[i].razonSocial=prev.razonSocial;renderLineas();return;}
      }
    }else if(r.codigo){el.textContent='✗';el.className='rut-dv-ln bad';}
    else{el.textContent='…';el.className='rut-dv-ln';}
  }
}
function lVal(i,side,val){
  const v=pn(val);
  AF.lineas[i][side]=v;
  if(side==='debe'&&v>0)AF.lineas[i].haber=0;
  if(side==='haber'&&v>0)AF.lineas[i].debe=0;
  updCuadre();
  // La apertura del modal vive en `lValFmtBlur`: al terminar de escribir, no
  // en cada tecla.
}
// Input formateado con separador de miles.
// Mientras se escribe, quitamos los puntos, guardamos el número puro y
// reformateamos manteniendo el cursor al final si el usuario está tipeando ahí.
// Auto-shrink: aplicamos una clase digs-N según la cantidad de caracteres del
// valor formateado, para que se reduzca la fuente y quepa hasta ~16 caracteres.
function digitsClass(n){
  const v=Math.round(+n||0);
  if(!v)return '';
  const len=new Intl.NumberFormat('es-CL').format(v).length;
  if(len>=15)return 'digs-15';
  if(len>=13)return 'digs-13';
  if(len>=10)return 'digs-10';
  return '';
}
function lValFmt(inp,i,side){
  const raw=String(inp.value||'').replace(/[^\d]/g,'');
  const num=+raw||0;
  AF.lineas[i][side]=num;
  if(side==='debe'&&num>0)AF.lineas[i].haber=0;
  if(side==='haber'&&num>0)AF.lineas[i].debe=0;
  // Reformatear con separador de miles conservando el foco.
  const formatted=num?new Intl.NumberFormat('es-CL').format(num):'';
  const posEnd=inp.selectionStart===inp.value.length;
  if(inp.value!==formatted){
    inp.value=formatted;
    if(posEnd)try{inp.setSelectionRange(formatted.length,formatted.length);}catch(e){}
  }
  // Aplicar clase de auto-shrink según el largo
  inp.classList.remove('digs-10','digs-13','digs-15');
  const cls=digitsClass(num);
  if(cls)inp.classList.add(cls);
  // Actualizar el input de la pareja (si borra debe, mostrar '' en haber)
  const par=side==='debe'?'haber':'debe';
  if(num>0){
    const inputs=inp.parentElement.parentElement.querySelectorAll('.linea-num-inp');
    if(inputs.length===2){
      const otro=inputs[side==='debe'?1:0];
      if(otro&&otro!==inp){otro.value='';otro.classList.remove('digs-10','digs-13','digs-15');}
    }
  }
  updCuadre();
  // El modal del DTE ya NO se abre acá: `oninput` dispara con el primer dígito
  // y arrancaba la ventana en la cara mientras se escribía el monto. Ahora se
  // abre al SALIR del campo (blur / tab), cuando el monto ya está completo.
}
function lValFmtBlur(inp,i,side){
  const num=+AF.lineas[i][side]||0;
  inp.value=num?new Intl.NumberFormat('es-CL').format(num):'';
  inp.classList.remove('digs-10','digs-13','digs-15');
  const cls=digitsClass(num);
  if(cls)inp.classList.add(cls);
  // Recién ahora, con el monto terminado, se ofrece asociar el documento.
  const l=AF.lineas[i];
  if(esAux(l.cd)&&num>0&&!l.dte&&!l._promptedDte){
    l._promptedDte=true;
    setTimeout(()=>abrirDteModal(i),120);
  }
}
function quitarDte(i){
  if(!confirm('¿Quitar el DTE asociado a esta línea?\n(El asiento contable se mantiene, solo se retira el documento del libro/auxiliar)'))return;
  delete AF.lineas[i].dte;
  renderLineas();
}
function delLinea(i){AF.lineas.splice(i,1);renderLineas();}
function addLinea(){AF.lineas.push({cd:'',nm:'',desc:'',debe:0,haber:0});renderLineas();}

function updCuadre(){
  const tD=AF.lineas.reduce((s,l)=>s+(l.debe||0),0);
  const tH=AF.lineas.reduce((s,l)=>s+(l.haber||0),0);
  const diff=tD-tH,ok=tD>0&&tH>0&&diff===0;
  const box=document.getElementById('af-cuadre');
  box.className='as-cuadre '+(ok?'ok':'err');
  document.getElementById('af-cuadre-ico').textContent=ok?'✅':'⚠️';
  document.getElementById('af-cuadre-msg').textContent=ok?'Asiento cuadrado — listo para guardar':
    tD===0&&tH===0?'Ingresa montos en las líneas':
    diff>0?`Falta ${fmtC(diff)} en el HABER`:
    `Falta ${fmtC(-diff)} en el DEBE`;
  document.getElementById('af-cuadre-det').innerHTML=(tD||tH)?`<span>D: ${fmtC(tD)}</span><span>H: ${fmtC(tH)}</span>`:'';
}

// ═══ DOCUMENTOS UNIFICADOS (libros + DTEs embebidos en asientos) ═══
// Retorna todos los documentos de ventas, fusionando S.ventas con los DTEs asociados a asientos manuales
function todosDocsVentas(excluirAsientoLineaActual){
  const base=S.ventas.map(d=>({...d,origen:'libro'}));
  S.asientos.forEach(a=>{
    if(a.anulado)return;
    (a.movs||[]).forEach((m,li)=>{
      if(m.cd==='1104001'&&m.dte){
        // Excluir la línea que estamos editando actualmente (si aplica)
        if(excluirAsientoLineaActual&&excluirAsientoLineaActual.asId===a.id&&excluirAsientoLineaActual.lineaIdx===li)return;
        base.push({...m.dte,id:'vm_'+a.id+'_'+li,origen:'asiento',asientoId:a.id,asientoN:a.n,lineaIdx:li});
      }
    });
  });
  return base;
}
function todosDocsCompras(excluirAsientoLineaActual){
  const base=S.compras.map(d=>({...d,origen:'libro'}));
  S.asientos.forEach(a=>{
    if(a.anulado)return;
    (a.movs||[]).forEach((m,li)=>{
      if(m.cd==='2102001'&&m.dte){
        if(excluirAsientoLineaActual&&excluirAsientoLineaActual.asId===a.id&&excluirAsientoLineaActual.lineaIdx===li)return;
        base.push({...m.dte,id:'cm_'+a.id+'_'+li,origen:'asiento',asientoId:a.id,asientoN:a.n,lineaIdx:li});
      }
    });
  });
  return base;
}
// Igual pero considera también el asiento que se está editando (usado por el modal DTE)
function todosDocsComprasConBorrador(){
  const base=todosDocsCompras();
  // agregar los DTEs del asiento que se está editando ahora mismo (AF.lineas)
  AF.lineas.forEach((l,li)=>{
    if(l.cd==='2102001'&&l.dte&&(!DM.lineaIdx||li!==DM.lineaIdx))base.push({...l.dte,id:'cm_draft_'+li,origen:'draft',lineaIdx:li});
  });
  return base;
}
function todosDocsVentasConBorrador(){
  const base=todosDocsVentas();
  AF.lineas.forEach((l,li)=>{
    if(l.cd==='1104001'&&l.dte&&(!DM.lineaIdx||li!==DM.lineaIdx))base.push({...l.dte,id:'vm_draft_'+li,origen:'draft',lineaIdx:li});
  });
  return base;
}

// Preview del folio para un DTE (usado en el badge de línea)
function folioPreviewDte(dte,cuenta,lineaIdx){
  if(!dte||!dte.fecha)return '—';
  const docs=cuenta==='1104001'?todosDocsVentasConBorrador():todosDocsComprasConBorrador();
  // incluir el DTE actual si no está
  const currentId='draft_line_'+lineaIdx;
  if(!docs.find(d=>d.id===currentId))docs.push({...dte,id:currentId});
  const folios=foliosMensuales(docs);
  const mesSl=dte.fecha.slice(5,7);
  const n=folios[currentId]||'?';
  return `${mesSl}-${String(n).padStart(3,'0')}`;
}

// ═══ MODAL DTE ═══
let DM={open:false,lineaIdx:null,dist:[]};

// Líneas del asiento que representan el gasto: cuentas de resultado con monto,
// excluyendo la propia línea del proveedor.
function lineasDeGasto(exceptoIdx){
  return AF.lineas.map((l,idx)=>({l,idx}))
    .filter(({l,idx})=>idx!==exceptoIdx&&l.cd&&aceptaCentroCosto(l.cd)&&((l.debe||0)+(l.haber||0))>0)
    .map(({l,idx})=>({idx,cd:l.cd,monto:l.debe||l.haber||0}));
}

// Si en el modal se cambió la cuenta de una fila que vino del asiento, el
// asiento manda menos que lo que el usuario acaba de elegir acá: se actualiza
// la línea para que no queden discrepando.
function sincronizarCuentasConAsiento(){
  const cambios=[];
  DM.dist.forEach(d=>{
    if(d._linea==null||!d.cuenta)return;
    const l=AF.lineas[d._linea];
    if(!l||l.cd===d.cuenta)return;
    cambios.push({antes:l.cd,ahora:d.cuenta});
    l.cd=d.cuenta;
    l.nm=pdcNm(d.cuenta);
    if(!aceptaCentroCosto(d.cuenta))delete l.cc;
  });
  if(cambios.length){
    renderLineas();
    toast(`✏️ Se actualizó la cuenta del asiento: ${cambios.map(c=>c.antes+' → '+c.ahora).join(', ')}`);
  }
  return cambios;
}

function abrirDteModal(lineaIdx){
  const l=AF.lineas[lineaIdx];if(!l||!esAux(l.cd))return;
  DM.open=true;DM.lineaIdx=lineaIdx;
  const tipoAux=CUENTAS_AUX[l.cd]; // 'cliente' | 'proveedor' | 'honorario'
  const esCompra=l.cd==='2102001';
  const esHon=tipoAux==='honorario';
  // Título según el tipo de auxiliar
  const titulos={cliente:'📄 Documento de Venta (DTE)',proveedor:'📄 Documento de Compra (DTE)',honorario:'📄 Boleta de Honorarios'};
  document.getElementById('dte-modal-title').textContent=titulos[tipoAux]||'📄 Documento';
  document.getElementById('dte-modal-sub').textContent=esHon
    ? 'Completa los datos de la boleta. La retención se calcula con la tasa del año. No duplica el efecto contable — ya está en el asiento.'
    : `Completa los datos del documento del ${tipoAux}. El folio se asigna automáticamente. No duplica el efecto contable — ya está en el asiento.`;
  // Tipos de documento
  document.getElementById('dtm-dte').innerHTML=esHon
    ? `<option value="70" ${l.dte?.tipoDTE==70?'selected':''}>70 – Boleta de Honorarios</option>
       <option value="71" ${l.dte?.tipoDTE==71?'selected':''}>71 – Boleta de Honorarios Electrónica</option>`
    : (esCompra?dteComprasOpts(l.dte?.tipoDTE||''):dteVentasOpts(l.dte?.tipoDTE||''));
  // Distribución solo en compras
  document.getElementById('dtm-dist-wrap').style.display=esCompra?'block':'none';
  // Campos según el tipo: honorarios usan retención, no IVA
  const mostrar=(id,v)=>{const e=document.getElementById(id);if(e)e.style.display=v?'':'none';};
  mostrar('dtm-iva-wrap',!esHon);
  mostrar('dtm-ret-wrap',esHon);
  mostrar('dtm-exento-wrap',!esHon);
  mostrar('dtm-otros-wrap',!esHon);
  const lblNeto=document.getElementById('dtm-lbl-neto');
  if(lblNeto)lblNeto.textContent=esHon?'Bruto (honorario)':'Neto';
  const lblRet=document.getElementById('dtm-lbl-ret');
  if(lblRet)lblRet.textContent=`Retención ${(retencionHonorarios(S.empresa.anio)*100).toFixed(2)}%`;
  // Cargar datos existentes o defaults
  const d=l.dte||{};
  document.getElementById('dtm-fecha').value=d.fecha||today();
  document.getElementById('dtm-vence').value=d.fechaVencimiento||'';
  document.getElementById('dtm-num').value=d.numero||'';
  // RUT: prefill desde la línea si ya está
  const rutVal=d.rutCodigo?(d.rutCodigo+d.rutDV):(l.rutCodigo?(l.rutCodigo+l.rutDV):'');
  document.getElementById('dtm-rut').value=rutVal;
  document.getElementById('dtm-rs').value=d.razonSocial||l.razonSocial||'';
  // Montos: si no hay DTE, prefill con el monto de la línea como total estimado
  const montoLinea=esCompra?(l.haber||l.debe||0):(l.debe||l.haber||0);
  document.getElementById('dtm-neto').value=d.neto||'';
  document.getElementById('dtm-exento').value=d.exento||'';
  const elDesc=document.getElementById('dtm-desc');if(elDesc)elDesc.value=d.descripcion||l.desc||'';
  const elRet=document.getElementById('dtm-ret');if(elRet)elRet.value=d.retencion||'';
  document.getElementById('dtm-iva').value=d.iva||'';
  document.getElementById('dtm-otros').value=d.otrosImpuestos||'';
  document.getElementById('dtm-total').value=d.total||montoLinea||'';
  // ── Distribución del gasto ──
  // La cuenta de gasto YA está en el asiento: es la contrapartida de la línea
  // del proveedor. Pedirla otra vez era hacer escribir dos veces lo mismo y
  // abría la puerta a que quedaran distintas. Se trae de ahí, recordando de qué
  // línea salió (`_linea`) para poder sincronizarlas al guardar.
  if(d.dist&&d.dist.length){
    DM.dist=d.dist.map(x=>({...x}));
  }else{
    const delAsiento=lineasDeGasto(DM.lineaIdx);
    DM.dist=delAsiento.length
      ? delAsiento.map(x=>({cuenta:x.cd,monto:x.monto,_linea:x.idx}))
      : [{cuenta:'',monto:d.neto||0}];
  }
  document.getElementById('dtm-dv').textContent='';
  document.getElementById('dtm-dup-warn').style.display='none';
  document.getElementById('dtm-btn-remover').style.display=l.dte?'':'none';
  // Inicializar
  dtmRutInput(rutVal);
  if(esCompra)dtmRenderDist();
  dtmRefresh();
  document.getElementById('dte-modal').classList.add('open');
}

function cerrarDteModal(){
  DM.open=false;DM.lineaIdx=null;
  document.getElementById('dte-modal').classList.remove('open');
}

function dtmRutInput(val){
  const r=rutParse(val);
  const el=document.getElementById('dtm-dv');
  if(!r.raw){el.textContent='';el.className='rut-dv';return;}
  if(r.codigo&&r.valido){
    el.textContent='✓ '+r.dv;el.className='rut-dv ok';
    const rs=document.getElementById('dtm-rs');
    if(!rs.value){
      // Buscar razón social en libros y asientos
      const l=AF.lineas[DM.lineaIdx];
      const esCompra=l&&l.cd==='2102001';
      const docs=esCompra?todosDocsCompras():todosDocsVentas();
      const prev=docs.find(d=>d.rutCodigo===r.codigo&&d.razonSocial);
      if(prev)rs.value=prev.razonSocial;
    }
  }else if(r.codigo){el.textContent='✗ DV ≠ '+rutDV(r.codigo);el.className='rut-dv bad';}
  else{el.textContent='…';el.className='rut-dv';}
}

function dtmCalcTotals(changed){
  const lHon=AF.lineas[DM.lineaIdx];
  // Honorarios: bruto − retención = líquido a pagar
  if(lHon&&CUENTAS_AUX[lHon.cd]==='honorario'){
    const bruto=pn(document.getElementById('dtm-neto').value);
    const retEl=document.getElementById('dtm-ret'), totEl2=document.getElementById('dtm-total');
    const tasa=retencionHonorarios(S.empresa.anio);
    if(changed==='neto'){
      const ret=Math.round(bruto*tasa);
      retEl.value=ret||'';
      totEl2.value=bruto-ret;
    }else if(changed==='ret'){
      const ret=pn(retEl.value);
      totEl2.value=bruto-ret;
    }else if(changed==='total'){
      // Desde el líquido: reconstruir el bruto
      const liq=pn(totEl2.value);
      const b=Math.round(liq/(1-tasa));
      const ret=b-liq;
      document.getElementById('dtm-neto').value=b;
      retEl.value=ret;
    }
    return;
  }
  const neto=pn(document.getElementById('dtm-neto').value);
  const exento=pn(document.getElementById('dtm-exento').value);
  const otros=pn(document.getElementById('dtm-otros').value);
  const ivaEl=document.getElementById('dtm-iva'),totEl=document.getElementById('dtm-total');
  const l=AF.lineas[DM.lineaIdx];if(!l)return;
  const esCompra=l.cd==='2102001';
  const dteInfo=esCompra?dteC(document.getElementById('dtm-dte').value):dteV(document.getElementById('dtm-dte').value);
  const afecto=dteInfo?dteInfo.afecto:true;
  if(changed==='neto'||changed==='exento'||changed==='otros'){
    const iva=afecto?Math.round(neto*IVA):0;
    ivaEl.value=iva||'';
    totEl.value=neto+exento+iva+otros;
    if(esCompra&&DM.dist.length===1&&!DM.dist[0].monto&&changed==='neto'){DM.dist[0].monto=neto;dtmRenderDist();}
  }else if(changed==='total'){
    const total=pn(totEl.value);
    if(afecto&&total>0&&!exento&&!otros){
      const n=Math.round(total/(1+IVA)),iv=total-n;
      document.getElementById('dtm-neto').value=n;ivaEl.value=iv;
      if(esCompra&&DM.dist.length===1&&!DM.dist[0].monto){DM.dist[0].monto=n;dtmRenderDist();}
    }
  }else if(changed==='iva'){
    const iva=pn(ivaEl.value);
    totEl.value=neto+exento+iva+otros;
  }
  if(esCompra)dtmUpdDistCheck();
}

function dtmRefresh(){
  // Recalcula folio preview
  const fecha=document.getElementById('dtm-fecha').value;
  const tipoDTE=+document.getElementById('dtm-dte').value;
  const l=AF.lineas[DM.lineaIdx];
  if(!fecha||!l){document.getElementById('dte-modal-folio-val').textContent='—';return;}
  const esCompra=l.cd==='2102001';
  const mesSl=fecha.slice(5,7);
  // Simular el folio: contar cuántos docs del mismo mes hay antes de este
  const docs=esCompra?todosDocsCompras():todosDocsVentas();
  // Excluir este DTE si ya está asociado
  const filtered=docs.filter(d=>!(l.dte&&d.origen==='asiento'&&d.asientoId===AF.editId&&d.lineaIdx===DM.lineaIdx));
  // Agregar el borrador
  const draft={id:'__draft__',fecha,tipoDTE,numero:document.getElementById('dtm-num').value};
  filtered.push(draft);
  const folios=foliosMensuales(filtered);
  const n=folios['__draft__']||'?';
  document.getElementById('dte-modal-folio-val').textContent=`${mesSl}-${String(n).padStart(3,'0')}`;
  document.getElementById('dte-modal-folio-info').textContent=`Libro de ${esCompra?'compras':'ventas'} · mes ${mesSl}`;
  dtmCheckDup();
}

function dtmCheckDup(){
  const warn=document.getElementById('dtm-dup-warn');if(!warn)return;
  const tipoDTE=+document.getElementById('dtm-dte').value;
  const numero=document.getElementById('dtm-num').value.trim();
  const r=rutParse(document.getElementById('dtm-rut').value);
  if(!tipoDTE||!numero||!r.codigo){warn.style.display='none';return;}
  const l=AF.lineas[DM.lineaIdx];if(!l)return;
  const esCompra=l.cd==='2102001';
  const docs=esCompra?todosDocsCompras():todosDocsVentas();
  // Excluir el DTE actual si estamos editando
  const dup=docs.find(d=>d.rutCodigo===r.codigo&&+d.tipoDTE===tipoDTE&&d.numero===numero
    &&!(d.origen==='asiento'&&d.asientoId===AF.editId&&d.lineaIdx===DM.lineaIdx));
  if(dup){
    const folios=foliosMensuales(docs);
    const f=folios[dup.id]||'?';
    const mesSl=dup.fecha.slice(5,7);
    const fuente=dup.origen==='asiento'?`en Asiento N°${dup.asientoN}`:'en Libro directo';
    warn.className='doc-dup-warn';warn.style.display='';
    warn.innerHTML=`⚠️ <span>DOCUMENTO DUPLICADO</span><span style="font-weight:400;margin-left:auto;font-size:11px">Ya existe Folio ${mesSl}-${String(f).padStart(3,'0')} (${fuente}) · ${dup.fecha} · ${rutFmt(dup.rutCodigo,dup.rutDV)} · ${fmtC(dup.total)}</span>`;
  }else{warn.style.display='none';}
}

// Distribución (solo compras)
function dtmRenderDist(){
  const box=document.getElementById('dtm-dist');
  if(!DM.dist.length)DM.dist=[{cuenta:'',monto:0}];
  box.innerHTML=DM.dist.map((l,i)=>`<div class="dist-row">
    <div class="dist-num">${i+1}</div>
    <div>${inputCuenta({id:`dm-cd-${i}`,value:l.cuenta,onPick:`DM.dist[${i}].cuenta='%CD%';dtmUpdDistCheck()`,placeholder:'Cuenta de gasto…',clase:'dist-inp'})}
      ${l._linea!=null?`<div style="font-size:9px;color:var(--mt);margin-top:2px">↔ línea ${l._linea+1} del asiento</div>`:''}</div>
    <div><input type="number" class="dist-num-inp" min="0" placeholder="0" value="${l.monto||''}" oninput="DM.dist[${i}].monto=pn(this.value);dtmUpdDistCheck()"></div>
    <div style="text-align:center"><button class="btn btn-d" style="padding:3px 7px;font-size:10px" onclick="dtmDelDist(${i})">✕</button></div>
  </div>`).join('');
  dtmUpdDistCheck();
}
function dtmAddDist(){DM.dist.push({cuenta:'',monto:0});dtmRenderDist();}
function dtmDelDist(i){if(DM.dist.length>1)DM.dist.splice(i,1);else DM.dist[0]={cuenta:'',monto:0};dtmRenderDist();}
function dtmUpdDistCheck(){
  const neto=pn(document.getElementById('dtm-neto').value);
  const sum=DM.dist.reduce((s,l)=>s+(l.monto||0),0);
  const diff=sum-neto,ok=neto>0&&diff===0;
  const box=document.getElementById('dtm-dist-check');if(!box)return;
  box.className='dist-check '+(ok?'ok':'err');
  document.getElementById('dtm-dist-ico').textContent=ok?'✅':'⚠️';
  document.getElementById('dtm-dist-msg').textContent=ok?'Distribución cuadrada con el neto':
    neto===0?'Ingresa el neto y distribúyelo en cuentas':
    diff>0?`Exceso de ${fmtC(diff)} sobre el neto`:
    `Faltan ${fmtC(-diff)} por distribuir`;
  document.getElementById('dtm-dist-det').innerHTML=`<span>Neto: ${fmtC(neto)}</span> · <span>Distribuido: ${fmtC(sum)}</span>`;
}

function dtmGuardar(){
  const l=AF.lineas[DM.lineaIdx];if(!l)return;
  const esCompra=l.cd==='2102001';
  const fecha=document.getElementById('dtm-fecha').value;
  const fechaVencimiento=document.getElementById('dtm-vence').value||'';
  const tipoDTE=+document.getElementById('dtm-dte').value;
  const numero=document.getElementById('dtm-num').value.trim();
  const rutInput=document.getElementById('dtm-rut').value;
  const razonSocial=document.getElementById('dtm-rs').value.trim();
  const neto=pn(document.getElementById('dtm-neto').value);
  const exento=pn(document.getElementById('dtm-exento').value);
  const iva=pn(document.getElementById('dtm-iva').value);
  const otrosImpuestos=pn(document.getElementById('dtm-otros').value);
  const total=pn(document.getElementById('dtm-total').value);
  const descripcion=(document.getElementById('dtm-desc')||{}).value?.trim()||'';
  const retencion=pn((document.getElementById('dtm-ret')||{}).value);
  const esHon=CUENTAS_AUX[l.cd]==='honorario';

  if(!fecha){toast('⚠️ Ingresa la fecha de emisión','e');return;}
  if(fechaVencimiento&&fechaVencimiento<fecha){toast('⚠️ Vencimiento no puede ser anterior a emisión','e');return;}
  if(!tipoDTE){toast('⚠️ Selecciona el tipo de documento','e');return;}
  if(!numero){toast('⚠️ Ingresa el N° de documento','e');return;}
  const r=rutParse(rutInput);
  if(!r.codigo){toast('⚠️ Ingresa el RUT','e');return;}
  if(!r.valido){toast('⚠️ RUT inválido — DV no coincide','e');return;}
  if(!razonSocial){toast('⚠️ Ingresa la razón social','e');return;}
  if(total<=0){toast('⚠️ El total debe ser mayor a cero','e');return;}
  if(esHon){
    // Honorarios: bruto − retención = líquido
    if(Math.abs((neto-retencion)-total)>1){toast('⚠️ Bruto − Retención no coincide con el líquido','e');return;}
  }else if(Math.abs((neto+exento+iva+otrosImpuestos)-total)>1){
    toast('⚠️ Neto + Exento + IVA + Otros no coincide con el Total','e');return;
  }

  // Validar duplicado (los honorarios no van a los libros de compra/venta)
  const docs=esHon?[]:(esCompra?todosDocsCompras():todosDocsVentas());
  const dup=docs.find(d=>d.rutCodigo===r.codigo&&+d.tipoDTE===tipoDTE&&d.numero===numero
    &&!(d.origen==='asiento'&&d.asientoId===AF.editId&&d.lineaIdx===DM.lineaIdx));
  if(dup){
    const folios=foliosMensuales(docs);
    const f=folios[dup.id]||'?';
    const mesSl=dup.fecha.slice(5,7);
    toast(`⚠️ Duplicado — ya existe Folio ${mesSl}-${String(f).padStart(3,'0')} (${fmtC(dup.total)})`,'e');
    return;
  }

  // Distribución (solo compras)
  let dist=null;
  if(esCompra){
    dist=DM.dist.filter(x=>x.cuenta&&x.monto>0).map(({cuenta,monto})=>({cuenta,monto}));
    if(!dist.length){toast('⚠️ Agrega al menos una cuenta de gasto en la distribución','e');return;}
    const sumDist=dist.reduce((s,x)=>s+x.monto,0);
    if(Math.abs(sumDist-neto)>1){toast('⚠️ La distribución no cuadra con el neto','e');return;}
  }

  // Si acá se eligió una cuenta de gasto distinta a la del asiento, el asiento
  // se ajusta: son el mismo hecho económico y no pueden quedar discrepando.
  if(esCompra)sincronizarCuentasConAsiento();

  // Guardar en la línea
  const dteObj={fecha,fechaVencimiento,tipoDTE,numero,rutCodigo:r.codigo,rutDV:r.dv,razonSocial,
                neto,exento,iva,otrosImpuestos,total,descripcion};
  if(esHon){dteObj.retencion=retencion;dteObj.tipoAux='honorario';}
  if(dist)dteObj.dist=dist;
  AF.lineas[DM.lineaIdx].dte=dteObj;
  // Sincronizar RUT/RS en el nivel de la línea para el auxiliar
  AF.lineas[DM.lineaIdx].rutCodigo=r.codigo;
  AF.lineas[DM.lineaIdx].rutDV=r.dv;
  AF.lineas[DM.lineaIdx].razonSocial=razonSocial;
  if(descripcion&&!AF.lineas[DM.lineaIdx].desc)AF.lineas[DM.lineaIdx].desc=descripcion;

  // ── Asignar el total al DEBE o HABER según el tipo de auxiliar y el documento ──
  //   cliente   (por cobrar, activo): factura → DEBE · nota de crédito → HABER
  //   proveedor (por pagar, pasivo) : factura → HABER · nota de crédito → DEBE
  //   honorario: la cuenta define el lado (gasto al debe, por pagar al haber)
  const signo=esHon?1:((esCompra?dteC(tipoDTE)?.signo:dteV(tipoDTE)?.signo)||1);
  const montoLinea=esHon?total:Math.abs(total); // en honorarios el total es el líquido
  const lin=AF.lineas[DM.lineaIdx];
  const naturalDebe=esHon
    ? (l.cd==='3202019'||l.cd==='1107002')   // gasto o anticipo → debe
    : !esCompra;                              // cliente → debe; proveedor → haber
  // Una nota de crédito (signo -1) invierte el lado natural
  const alDebe=signo>=0?naturalDebe:!naturalDebe;
  if(esHon&&l.cd==='3202019'){
    // Gasto por honorarios: se registra el BRUTO (la retención va en otra línea)
    lin.debe=neto;lin.haber=0;
  }else{
    lin.debe=alDebe?montoLinea:0;
    lin.haber=alDebe?0:montoLinea;
  }
  updCuadre();
  cerrarDteModal();
  renderLineas();
  toast('✅ Documento asociado a la línea');
}

function dtmRemover(){
  if(!confirm('¿Quitar el DTE de esta línea?'))return;
  if(DM.lineaIdx!=null&&AF.lineas[DM.lineaIdx]){
    delete AF.lineas[DM.lineaIdx].dte;
  }
  cerrarDteModal();renderLineas();toast('🗑 DTE removido');
}


// Correlativo GLOBAL de comprobantes contables. Considera:
//   - Asientos manuales (S.asientos[].folioComp)
//   - Documentos de compras (S.compras[].folioComp) - cada doc genera 1 asiento
//   - Documentos de ventas (S.ventas[].folioComp)
//   - Balance de apertura (S.apertura?.folioComp — usualmente 1)
// Este correlativo NUNCA se reasigna: cada elemento lo obtiene una vez al crearse
// y lo conserva de por vida. Al importar 100 facturas, cada una recibe un folio
// consecutivo. Los asientos manuales toman el siguiente disponible.
function proxFolioComprobante(){
  let max=0;
  (S.asientos||[]).forEach(a=>{const n=+a.folioComp||+a.n||0;if(n>max)max=n;});
  (S.compras||[]).forEach(d=>{const n=+d.folioComp||0;if(n>max)max=n;});
  (S.ventas||[]).forEach(d=>{const n=+d.folioComp||0;if(n>max)max=n;});
  const ap=S.apertura?.folioComp||0;
  if(ap>max)max=ap;
  return max+1;
}
// Compat: proxFolioAsiento (para código legacy que lo llamaba) ahora devuelve
// el próximo folio del pool global, no solo el max de asientos manuales.
function proxFolioAsiento(){return proxFolioComprobante();}

// Asegura que TODOS los elementos existentes tengan folioComp asignado. Se
// invoca al arrancar la app: docs importados en versiones previas obtienen
// folios secuenciales por fecha (para no romper la vista Comprobantes).
function migrarFoliosComprobante(){
  const items=[];
  // Ordenar por fecha para asignar correlativos consistentes
  (S.asientos||[]).filter(a=>!a.folioComp).forEach(a=>items.push({obj:a,fecha:a.fecha||'',tipo:'m'}));
  (S.compras||[]).filter(d=>!d.folioComp).forEach(d=>items.push({obj:d,fecha:d.fecha||'',tipo:'c'}));
  (S.ventas||[]).filter(d=>!d.folioComp).forEach(d=>items.push({obj:d,fecha:d.fecha||'',tipo:'v'}));
  if(S.apertura&&!S.apertura.folioComp)items.unshift({obj:S.apertura,fecha:S.apertura.fecha||'',tipo:'a'});
  if(!items.length)return 0;
  items.sort((a,b)=>a.fecha.localeCompare(b.fecha));
  // Iniciar desde el max existente + 1
  let next=1;
  (S.asientos||[]).forEach(a=>{const n=+a.folioComp||0;if(n>=next)next=n+1;});
  (S.compras||[]).forEach(d=>{const n=+d.folioComp||0;if(n>=next)next=n+1;});
  (S.ventas||[]).forEach(d=>{const n=+d.folioComp||0;if(n>=next)next=n+1;});
  items.forEach(it=>{it.obj.folioComp=next++;});
  return items.length;
}

// Lleva a Comprobantes salvo que ya estemos ahí (evita re-render innecesario)
function irAComprobantes(){
  try{
    const sec=window.getCurSec&&window.getCurSec();
    if(sec!=='comprobantes'&&window.nav)window.nav('comprobantes');
  }catch(e){}
}

function abrirForm(){
  // El formulario vive dentro de la sección Comprobantes. Si se llega desde
  // otra parte (un botón del Diario, el buscador), primero hay que llevar al
  // usuario ahí; si no, el formulario se abre en una sección invisible.
  irAComprobantes();
  fijarAF(null,lineasEnBlanco());
  const f=document.getElementById('as-form');f.style.display='block';f.classList.remove('editing');
  document.getElementById('af-title').textContent='Nuevo Asiento Contable';
  document.getElementById('af-folio-badge').textContent='N° '+proxFolioAsiento()+' (siguiente)';
  document.getElementById('af-fecha').value=today();
  document.getElementById('af-glosa').value='';
  document.getElementById('af-last-saved').textContent='';
  renderLineas();
  f.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>document.getElementById('af-glosa').focus(),200);
}

function editarAsiento(id){
  const a=S.asientos.find(x=>x.id===id);if(!a)return;
  irAComprobantes();
  fijarAF(id,a.movs.map(m=>({...m})));
  const f=document.getElementById('as-form');f.style.display='block';f.classList.add('editing');
  document.getElementById('af-title').textContent='Editando Asiento';
  document.getElementById('af-folio-badge').textContent='N° '+(a.n||'?');
  document.getElementById('af-fecha').value=a.fecha;
  document.getElementById('af-glosa').value=a.glosa;
  document.getElementById('af-last-saved').textContent='';
  renderLineas();
  f.scrollIntoView({behavior:'smooth',block:'start'});
}

function cerrarForm(){
  const f=document.getElementById('as-form');
  if(f)f.style.display='none';
  const ls=document.getElementById('af-last-saved');
  if(ls)ls.textContent='';
  fijarAF(null,[]);
  // Volver a dibujar la lista: si se acaba de guardar, el comprobante nuevo
  // tiene que aparecer sin que el usuario tenga que navegar de nuevo.
  try{ if(window.renderComprobantes)window.renderComprobantes(); }catch(e){}
}

// Duplicar un asiento como plantilla: clona líneas (sin DTE), crea como NUEVO
function duplicarAsiento(id){
  const a=S.asientos.find(x=>x.id===id);if(!a)return;
  // Clonar movs quitando DTE (los DTE son únicos por documento) pero conservando cuenta/glosa/RUT
  const lineas=a.movs.map(m=>{
    const l={cd:m.cd,nm:m.nm||'',desc:m.desc||'',debe:m.debe||0,haber:m.haber||0};
    if(esAux(m.cd)){l.rutCodigo=m.rutCodigo;l.rutDV=m.rutDV;l.razonSocial=m.razonSocial;}
    return l; // sin l.dte
  });
  irAComprobantes();
  fijarAF(null,lineas);
  const f=document.getElementById('as-form');f.style.display='block';f.classList.remove('editing');
  document.getElementById('af-title').textContent='Nuevo Asiento (duplicado)';
  document.getElementById('af-folio-badge').textContent='N° '+proxFolioAsiento()+' (siguiente)';
  document.getElementById('af-fecha').value=today();
  document.getElementById('af-glosa').value=a.glosa||'';
  document.getElementById('af-last-saved').textContent='';
  renderLineas();
  f.scrollIntoView({behavior:'smooth',block:'start'});
  toast('📋 Asiento duplicado — ajusta fecha y monto según necesites');
}

// Anular / reactivar un asiento: no borra el N°, excluye sus efectos de los cómputos
function anularAsiento(id){
  const a=S.asientos.find(x=>x.id===id);if(!a)return;
  if(a.anulado){
    if(!confirm(`¿Reactivar asiento N°${a.n||''} — "${a.glosa}"?\nVolverá a afectar Mayor, Balance y auxiliares.`))return;
    a.anulado=false;
    window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
    rerender();toast('↩️ Asiento N°'+(a.n||'')+' reactivado');logAccion('Reactivó asiento',`N°${a.n} — ${a.glosa}`);
  }else{
    if(!confirm(`¿Anular asiento N°${a.n||''} — "${a.glosa}"?\n\nNo borra el número de correlativo, pero excluye sus efectos de Libro Mayor, Balance, Estado de Resultados y auxiliares.\n\nPodrás reactivarlo después.`))return;
    a.anulado=true;
    window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
    rerender();toast('🚫 Asiento N°'+(a.n||'')+' anulado');logAccion('Anuló asiento',`N°${a.n} — ${a.glosa}`);
  }
}

// Navegar desde libro al asiento manual que contiene el DTE
function abrirAsientoDesde(asientoId){
  nav('asientos');
  setTimeout(()=>editarAsiento(asientoId),120);
}

// Firma de un asiento para detectar duplicados exactos (fecha + líneas)
function sigAsiento(fecha,movs){
  return fecha+'|'+movs.map(m=>`${m.cd}:${Math.round(m.debe||0)}:${Math.round(m.haber||0)}`).sort().join('|');
}

function limpiarFormAsiento(folioGuardado){
  // Conservar la fecha actual (útil para ingresar varios del mismo día)
  const fechaActual=document.getElementById('af-fecha').value||today();

  // Reset estado JS
  fijarAF(null,lineasEnBlanco());

  // Reset DOM explícito (por si algún input quedó con valor residual)
  const glEl=document.getElementById('af-glosa');if(glEl){glEl.value='';glEl.blur();}
  const fcEl=document.getElementById('af-fecha');if(fcEl)fcEl.value=fechaActual;

  // Badge + título
  document.getElementById('af-title').textContent='Nuevo Asiento Contable';
  document.getElementById('af-folio-badge').textContent='N° '+proxFolioAsiento()+' (siguiente)';
  if(folioGuardado!=null){
    document.getElementById('af-last-saved').innerHTML=`✓ Último guardado: Asiento N°${folioGuardado}`;
  }

  // Reset indicador de cuadre
  const cb=document.getElementById('af-cuadre');if(cb)cb.className='as-cuadre err';
  const ci=document.getElementById('af-cuadre-ico');if(ci)ci.textContent='⚠️';
  const cm=document.getElementById('af-cuadre-msg');if(cm)cm.textContent='Ingresa montos para verificar el cuadre';
  const cd=document.getElementById('af-cuadre-det');if(cd)cd.innerHTML='';

  // Re-renderizar líneas (destruye inputs viejos y crea nuevos vacíos)
  renderLineas();

  // Feedback visual: flash verde en el form + scroll al tope
  const f=document.getElementById('as-form');
  if(f){
    f.style.transition='box-shadow .35s, border-color .35s';
    f.style.boxShadow='0 0 0 3px rgba(46,160,67,.35)';
    f.style.borderColor='var(--ach)';
    setTimeout(()=>{f.style.boxShadow='';f.style.borderColor='';},700);
    f.scrollIntoView({behavior:'smooth',block:'start'});
  }

  // Foco en glosa después del scroll
  setTimeout(()=>{const g=document.getElementById('af-glosa');if(g)g.focus();},380);
}

function guardarAsiento(){
  const fecha=document.getElementById('af-fecha').value;
  const glosa=document.getElementById('af-glosa').value.trim();
  if(!fecha){toast('⚠️ Ingresa una fecha','e');return;}
  if(!glosa){toast('⚠️ Ingresa una descripción / glosa','e');return;}
  const lineas=AF.lineas.filter(l=>l.cd&&(l.debe||l.haber));
  if(lineas.length<2){toast('⚠️ Agrega al menos 2 líneas con cuenta y monto','e');return;}
  const tD=lineas.reduce((s,l)=>s+(l.debe||0),0);
  const tH=lineas.reduce((s,l)=>s+(l.haber||0),0);
  if(tD!==tH){toast(`⚠️ El asiento no cuadra: Debe ${fmtC(tD)} ≠ Haber ${fmtC(tH)}`,'e');return;}
  if(tD===0){toast('⚠️ El asiento no tiene montos','e');return;}

  // Validar auxiliares: toda línea de cuenta auxiliable debe tener RUT válido + razón social
  for(let i=0;i<lineas.length;i++){
    const l=lineas[i];
    if(esAux(l.cd)){
      const tipo=CUENTAS_AUX[l.cd];
      if(l.dte){l.rutCodigo=l.dte.rutCodigo;l.rutDV=l.dte.rutDV;l.razonSocial=l.dte.razonSocial;}
      const idxHumano=i+1;
      if(!l.rutCodigo||!l.rutDV){toast(`⚠️ Línea ${idxHumano} (${pdcNm(l.cd)}): falta el RUT del ${tipo}. Usa el botón "📄 DTE" o ingresa RUT manualmente.`,'e');return;}
      if(rutDV(l.rutCodigo)!==String(l.rutDV).toUpperCase()){toast(`⚠️ Línea ${idxHumano}: RUT inválido (DV no coincide)`,'e');return;}
      if(!l.razonSocial||!String(l.razonSocial).trim()){toast(`⚠️ Línea ${idxHumano} (${pdcNm(l.cd)}): falta la razón social del ${tipo}`,'e');return;}
    }
  }

  const movsClean=lineas.map(l=>{
    const m={cd:l.cd,nm:l.nm||pdcNm(l.cd),desc:l.desc||'',debe:l.debe||0,haber:l.haber||0};
    if(l.cc&&aceptaCentroCosto(l.cd))m.cc=l.cc; // centro de costo (predio/cuartel)
    if(esAux(l.cd)){
      m.rutCodigo=l.rutCodigo;m.rutDV=l.rutDV;m.razonSocial=String(l.razonSocial||'').trim();
      if(l.dte)m.dte={...l.dte};
    }
    return m;
  });

  // ── Validación de DUPLICADOS ──
  // 1) Asiento idéntico (misma fecha + mismas cuentas + mismos montos)
  const sig=sigAsiento(fecha,movsClean);
  const dupAs=S.asientos.find(a=>a.id!==AF.editId&&sigAsiento(a.fecha,a.movs)===sig);
  if(dupAs){
    if(!confirm(`⚠️ POSIBLE DUPLICADO\n\nYa existe el Asiento N°${dupAs.n} con la misma fecha, cuentas y montos:\n  "${dupAs.glosa}"\n\n¿Deseas crear este asiento de todas formas?`)){
      return;
    }
  }
  // 2) DTE duplicado: si alguna línea trae DTE, validar que no exista ya
  for(let i=0;i<movsClean.length;i++){
    const m=movsClean[i];
    if(!m.dte)continue;
    const esCompra=m.cd==='2102001';
    const docs=esCompra?todosDocsCompras():todosDocsVentas();
    const dup=docs.find(d=>d.rutCodigo===m.dte.rutCodigo&&+d.tipoDTE===+m.dte.tipoDTE&&d.numero===m.dte.numero
      &&!(d.origen==='asiento'&&d.asientoId===AF.editId&&d.lineaIdx===i));
    if(dup){
      const folios=foliosMensuales(docs);
      const f=folios[dup.id]||'?';
      const mesSl=dup.fecha.slice(5,7);
      toast(`⚠️ Línea ${i+1}: DTE duplicado — ya existe Folio ${mesSl}-${String(f).padStart(3,'0')} (${fmtC(dup.total)})`,'e');
      return;
    }
  }

  // Guardar
  let folioGuardado;
  if(AF.editId){
    const idx=S.asientos.findIndex(x=>x.id===AF.editId);
    if(idx>=0){S.asientos[idx]={...S.asientos[idx],fecha,glosa,movs:movsClean};folioGuardado=S.asientos[idx].n;}
    toast('✅ Asiento N°'+folioGuardado+' actualizado');
    window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>toast('❌ Error al guardar en storage','e'));
    // Tras editar, cerrar el form (el usuario no suele editar en cadena)
    cerrarForm();rerender();
    return;
  }

  // Asiento nuevo
  folioGuardado=proxFolioComprobante();
  S.asientos.push({id:'as_'+Date.now(),n:folioGuardado,folioComp:folioGuardado,fecha,glosa,movs:movsClean});
  logAccion('Creó asiento',`N°${folioGuardado} — ${glosa}`);
  toast('✅ Asiento N°'+folioGuardado+' registrado');
  window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>toast('❌ Error al guardar en storage','e'));

  // Limpiar form y dejarlo listo para el siguiente asiento
  limpiarFormAsiento(folioGuardado);
  updateHdr();
  // Actualizar listado abajo (sin cerrar form)
  const listEl=document.getElementById('as-list');
  if(listEl)renderAsientos();
}

function eliminarAsiento(id){
  const a=S.asientos.find(x=>x.id===id);if(!a)return;
  if(!confirm(`¿Eliminar asiento N°${a.n||''} — "${a.glosa}"?\nEsta acción no se puede deshacer.`))return;
  S.asientos=S.asientos.filter(x=>x.id!==id);
  window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});
  renderAsientos();toast('🗑 Asiento eliminado');logAccion('Eliminó asiento',`N°${a.n} — ${a.glosa}`);
}


export {lAuxElegido, CUENTAS_AUX, esAux, renderAsientos, toggleAs, cuentasOpts, renderLineas, lCd, lRut, lVal, lValFmt, lValFmtBlur, quitarDte, delLinea, addLinea, updCuadre, todosDocsVentas, todosDocsCompras, todosDocsComprasConBorrador, todosDocsVentasConBorrador, folioPreviewDte, DM, abrirDteModal, cerrarDteModal, dtmRutInput, dtmCalcTotals, dtmRefresh, dtmCheckDup, dtmRenderDist, dtmAddDist, dtmDelDist, dtmUpdDistCheck, dtmGuardar, dtmRemover, proxFolioAsiento, proxFolioComprobante, migrarFoliosComprobante, abrirForm, editarAsiento, cerrarForm, duplicarAsiento, anularAsiento, abrirAsientoDesde, sigAsiento, limpiarFormAsiento, guardarAsiento, eliminarAsiento, AF};
