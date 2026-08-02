// apertura.js — Balance de Apertura (Asiento N°0) + importador Excel
import {toast, fmtC, fmt, pn, today, pdcNm, PDC, CUENTAS_SEL, rutParse, rutFmt, rutDV} from './core.js';
import {CUENTAS_AUX, esAux, cuentasOpts} from './asientos.js';
import {inputCuenta} from './buscadorcuentas.js';
import {S} from './state.js';
import {rerender} from './ui.js';
import './storage.js';

// ═══ BALANCE DE APERTURA (Asiento N°0) ═══
let APF={lineas:[]}; // estado del formulario

function renderApertura(){
  const cont=document.getElementById('ap-content');
  const btnElim=document.getElementById('btn-eliminar-ap');
  const btnAbrir=document.getElementById('btn-abrir-ap');

  if(!S.apertura){
    btnElim.style.display='none';
    btnAbrir.textContent='+ Configurar Apertura';
    document.getElementById('ap-sub').textContent='Sin balance de apertura configurado';
    cont.innerHTML=`<div class="empty"><div class="ei">🔰</div>
      No hay Balance de Apertura para el año ${S.empresa.anio}.<br><br>
      Usa <strong>"+ Configurar Apertura"</strong> para cargar los saldos iniciales.</div>`;
    return;
  }

  btnElim.style.display='';
  btnAbrir.textContent='✏️ Editar Apertura';
  const a=S.apertura;
  const tD=a.movs.reduce((s,m)=>s+(m.debe||0),0);
  const tH=a.movs.reduce((s,m)=>s+(m.haber||0),0);
  const ok=tD===tH&&tD>0;
  document.getElementById('ap-sub').textContent=`Asiento N°0 · ${a.fecha} · ${a.movs.length} líneas · ${ok?'✓ Cuadrado':'⚠️ No cuadra'}`;

  cont.innerHTML=`<div class="asiento-item" style="border-left:4px solid var(--ach)">
    <div class="asiento-hdr" style="display:flex;gap:16px;padding:14px 16px;align-items:center">
      <span style="background:var(--ach);color:var(--bg);font-weight:700;padding:4px 12px;border-radius:6px;font-family:var(--mono);font-size:12px">N° 0</span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${a.glosa}</div>
        <div style="color:var(--mt);font-size:11px;margin-top:2px">${a.fecha} · Balance de Apertura · ${a.movs.length} líneas</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:13px;font-weight:700">${fmtC(tD)}</div>
        <div style="font-size:10px;color:${ok?'var(--ach)':'var(--err)'}">${ok?'✓ Cuadrado':'⚠️ D≠H'}</div>
      </div>
    </div>
    <div class="asiento-body" style="display:block;padding:0 16px 14px">
      ${a.movs.map((m,li)=>`<div style="display:grid;grid-template-columns:36px 1fr 110px 110px;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(48,54,61,.4)">
        <div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--mt)">${li+1}</div>
        <div style="${m.haber>0?'padding-left:20px;color:var(--mt)':'padding-left:8px'}">
          <span style="font-family:var(--mono);font-size:10px;color:var(--mt)">${m.cd}</span>
          <span style="margin-left:6px">${m.nm||pdcNm(m.cd)}</span>
          ${m.desc?`<span style="color:var(--mt);font-size:11px"> — ${m.desc}</span>`:''}
          ${m.rutCodigo?`<div style="font-size:10px;color:var(--info);margin-top:2px"><span style="font-family:var(--mono)">${rutFmt(m.rutCodigo,m.rutDV)}</span>${m.razonSocial?' · '+m.razonSocial:''}</div>`:''}
        </div>
        <div style="text-align:right;font-family:var(--mono);color:${m.debe?'var(--tx)':'var(--bd)'}">${m.debe?fmtC(m.debe):'–'}</div>
        <div style="text-align:right;font-family:var(--mono);color:${m.haber?'var(--mt)':'var(--bd)'}">${m.haber?fmtC(m.haber):'–'}</div>
      </div>`).join('')}
      <div style="display:grid;grid-template-columns:36px 1fr 110px 110px;padding:8px 0;font-size:12px;font-weight:700;border-top:2px solid var(--bd);margin-top:6px">
        <div></div>
        <div>TOTALES</div>
        <div style="text-align:right;font-family:var(--mono)">${fmtC(tD)}</div>
        <div style="text-align:right;font-family:var(--mono)">${fmtC(tH)}</div>
      </div>
    </div>
  </div>`;
}

function abrirApertura(){
  // Cargar líneas existentes o inicializar vacías
  if(S.apertura){
    APF.lineas=S.apertura.movs.map(m=>({...m}));
    document.getElementById('ap-form-title').textContent='Editar Balance de Apertura';
    document.getElementById('ap-fecha').value=S.apertura.fecha;
    document.getElementById('ap-glosa').value=S.apertura.glosa;
  }else{
    APF.lineas=[{cd:'',nm:'',desc:'',debe:0,haber:0},{cd:'',nm:'',desc:'',debe:0,haber:0}];
    document.getElementById('ap-form-title').textContent='Nuevo Balance de Apertura';
    // Por defecto: 31 de diciembre del año anterior (momento del cierre que origina la apertura)
    document.getElementById('ap-fecha').value=(S.empresa.anio-1)+'-12-31';
    document.getElementById('ap-glosa').value=`Balance de apertura al 01-01-${S.empresa.anio}`;
  }
  const f=document.getElementById('ap-form');f.style.display='block';
  apRenderLineas();
  f.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>document.getElementById('ap-glosa').focus(),200);
}

function cerrarApertura(){document.getElementById('ap-form').style.display='none';APF.lineas=[];}

function apRenderLineas(){
  const box=document.getElementById('ap-lineas');
  if(!APF.lineas.length){box.innerHTML='<div style="padding:14px;text-align:center;color:var(--mt);font-size:12px">Agrega al menos 1 línea</div>';return;}
  box.innerHTML=APF.lineas.map((l,i)=>{
    const aux=esAux(l.cd);
    const tipoAux=CUENTAS_AUX[l.cd]||'';
    let auxHtml='';
    if(aux){
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
          <input type="text" class="linea-inp" placeholder="Sin puntos ni guión" value="${rutVal}" oninput="apLRut(${i},this.value)">
          <span class="${dvCls}" id="ap-ln-dv-${i}">${dvHtml}</span>
        </div>
        <div><input type="text" class="linea-inp" placeholder="Razón social" value="${l.razonSocial||''}" oninput="APF.lineas[${i}].razonSocial=this.value"></div>
      </div>`;
    }
    return `<div class="linea-row">
      <div class="linea-num">${i+1}</div>
      <div>${inputCuenta({id:`ap-cd-${i}`,value:l.cd,onPick:`apLCd(${i},'%CD%')`,placeholder:'Código o nombre…'})}</div>
      <div><input type="text" class="linea-inp" placeholder="Observación" value="${l.desc||''}" oninput="APF.lineas[${i}].desc=this.value"></div>
      <div><input type="number" class="linea-num-inp" min="0" placeholder="0" value="${l.debe||''}" oninput="apLVal(${i},'debe',this.value)"></div>
      <div><input type="number" class="linea-num-inp" min="0" placeholder="0" value="${l.haber||''}" oninput="apLVal(${i},'haber',this.value)"></div>
      <div style="text-align:center"><button class="btn btn-d" onclick="apDelLinea(${i})">✕</button></div>
    </div>${auxHtml}`;
  }).join('');
  apUpdCuadre();
}

function apLCd(i,cd){
  APF.lineas[i].cd=cd;APF.lineas[i].nm=pdcNm(cd);
  if(!esAux(cd)){delete APF.lineas[i].rutCodigo;delete APF.lineas[i].rutDV;delete APF.lineas[i].razonSocial;}
  apRenderLineas();
}
function apLRut(i,val){
  const r=rutParse(val);
  APF.lineas[i].rutCodigo=r.codigo||'';
  APF.lineas[i].rutDV=r.dv||'';
  const el=document.getElementById('ap-ln-dv-'+i);
  if(el){
    if(!r.raw){el.textContent='';el.className='rut-dv-ln';}
    else if(r.codigo&&r.valido){el.textContent='✓ '+r.dv;el.className='rut-dv-ln ok';}
    else if(r.codigo){el.textContent='✗';el.className='rut-dv-ln bad';}
  }
}
function apLVal(i,side,val){
  const v=pn(val);
  APF.lineas[i][side]=v;
  if(side==='debe'&&v>0)APF.lineas[i].haber=0;
  if(side==='haber'&&v>0)APF.lineas[i].debe=0;
  apUpdCuadre();
}
function apDelLinea(i){APF.lineas.splice(i,1);apRenderLineas();}
function apAddLinea(){APF.lineas.push({cd:'',nm:'',desc:'',debe:0,haber:0});apRenderLineas();}
function apPrellenar(){
  // Pre-llenar con cuentas operativas típicas (excluye subtítulos/títulos)
  const tipicas=['1101101','1101201','1104001','1104001','1201001','1201002','1201003','2102001','2301001'];
  tipicas.forEach(cd=>{
    const c=PDC.find(x=>x.cd===cd);
    if(c&&!APF.lineas.find(l=>l.cd===cd)){
      APF.lineas.push({cd,nm:c.nm,desc:'',debe:0,haber:0});
    }
  });
  apRenderLineas();
  toast('📋 Cuentas principales agregadas — ingresa los saldos');
}
function apUpdCuadre(){
  const tD=APF.lineas.reduce((s,l)=>s+(l.debe||0),0);
  const tH=APF.lineas.reduce((s,l)=>s+(l.haber||0),0);
  const diff=tD-tH,ok=tD>0&&tH>0&&diff===0;
  const box=document.getElementById('ap-cuadre');if(!box)return;
  box.className='as-cuadre '+(ok?'ok':'err');
  document.getElementById('ap-cuadre-ico').textContent=ok?'✅':'⚠️';
  document.getElementById('ap-cuadre-msg').textContent=ok?'Balance cuadrado — listo para guardar':
    tD===0&&tH===0?'Ingresa los saldos iniciales':
    diff>0?`Falta ${fmtC(diff)} en Pasivos/Patrimonio (HABER)`:
    `Falta ${fmtC(-diff)} en Activos (DEBE)`;
  document.getElementById('ap-cuadre-det').innerHTML=(tD||tH)?`<span>Activos: ${fmtC(tD)}</span><span>Pas.+Patr.: ${fmtC(tH)}</span>`:'';
}

async function guardarApertura(){
  const fecha=document.getElementById('ap-fecha').value;
  const glosa=document.getElementById('ap-glosa').value.trim();
  if(!fecha){toast('⚠️ Ingresa la fecha de apertura','e');return;}
  if(!glosa){toast('⚠️ Ingresa una descripción','e');return;}
  const lineas=APF.lineas.filter(l=>l.cd&&(l.debe||l.haber));
  if(!lineas.length){toast('⚠️ Agrega al menos 1 línea con cuenta y saldo','e');return;}
  const tD=lineas.reduce((s,l)=>s+(l.debe||0),0);
  const tH=lineas.reduce((s,l)=>s+(l.haber||0),0);
  if(tD!==tH){toast(`⚠️ No cuadra: Activos ${fmtC(tD)} ≠ Pas.+Patr. ${fmtC(tH)}`,'e');return;}
  if(tD===0){toast('⚠️ Sin montos','e');return;}

  // Validar auxiliares
  for(let i=0;i<lineas.length;i++){
    const l=lineas[i];
    if(esAux(l.cd)){
      const tipo=CUENTAS_AUX[l.cd];
      if(!l.rutCodigo||!l.rutDV){toast(`⚠️ Línea ${i+1} (${pdcNm(l.cd)}): falta RUT del ${tipo}`,'e');return;}
      if(rutDV(l.rutCodigo)!==String(l.rutDV).toUpperCase()){toast(`⚠️ Línea ${i+1}: RUT inválido`,'e');return;}
      if(!l.razonSocial||!String(l.razonSocial).trim()){toast(`⚠️ Línea ${i+1}: falta razón social`,'e');return;}
    }
  }

  const movsClean=lineas.map(l=>{
    const m={cd:l.cd,nm:l.nm||pdcNm(l.cd),desc:l.desc||'',debe:l.debe||0,haber:l.haber||0};
    if(esAux(l.cd)){m.rutCodigo=l.rutCodigo;m.rutDV=l.rutDV;m.razonSocial=String(l.razonSocial||'').trim();}
    return m;
  });

  S.apertura={fecha,glosa,movs:movsClean};
  try{await window.storage.set('apertura-'+S.empresa.anio,JSON.stringify(S.apertura));}
  catch(e){toast('❌ Error guardando: '+e.message,'e');return;}
  cerrarApertura();
  toast('✅ Balance de Apertura guardado');
  rerender();
}

async function eliminarApertura(){
  if(!confirm('¿Eliminar el Balance de Apertura del año '+S.empresa.anio+'?\n\nEsta acción no se puede deshacer. Las transacciones del año se mantienen.'))return;
  S.apertura=null;
  try{await window.storage.delete('apertura-'+S.empresa.anio);}catch(e){}
  toast('🗑 Balance de Apertura eliminado');
  rerender();
}

// ═══ IMPORTADOR DE BALANCE (para Asiento de Apertura) ═══
let IMB={lineas:[]};

function initBalanceImportListener(){
  const inp=document.getElementById('imp-balance-file');
  if(inp&&!inp._listenerAttached){
    inp.addEventListener('change',async(e)=>{
      const f=e.target.files[0];if(!f)return;
      try{
        const buf=await f.arrayBuffer();
        const wb=XLSX.read(buf,{type:'array'});
        const sheet=wb.Sheets[wb.SheetNames[0]];
        const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null});
        procesarBalanceXLSX(rows);
      }catch(err){toast('❌ Error al leer archivo: '+err.message,'e');console.error(err);}
      e.target.value='';
    });
    inp._listenerAttached=true;
  }
}

// Procesa matriz de filas: detecta cuentas analíticas (código de 7 dígitos)
// Formato esperado: columnas de Activo (cod/nom/saldo) y columnas de Pasivo (cod/nom/saldo) en la misma fila
function procesarBalanceXLSX(rows){
  const cuentas=[];
  const esAnalitico=(v)=>{const s=String(v||'').trim();return /^\d{7}$/.test(s);};

  rows.forEach(row=>{
    if(!Array.isArray(row))return;
    for(let i=0;i<row.length-1;i++){
      const v=row[i];
      if(esAnalitico(v)){
        const cd=String(v).trim();
        const nm=String(row[i+1]||'').trim();
        let saldo=null;
        for(let j=i+2;j<Math.min(i+5,row.length);j++){
          const c=row[j];
          if(typeof c==='number'&&!isNaN(c)){saldo=Math.round(c);break;}
          if(typeof c==='string'&&c.trim()&&!isNaN(+c.replace(/[.,\s]/g,''))){saldo=Math.round(+c.replace(/[.,\s]/g,''));break;}
        }
        if(saldo===null||saldo===0)continue;
        // Determinar en qué LADO del balance aparece la cuenta según la columna donde está el código.
        // Si aparece en la primera mitad de columnas → lado Activo, segunda mitad → lado Pasivo.
        // Esto es más confiable que deducir solo del código, porque algunos balances mezclan signos.
        const lado=i<row.length/2?'A':'P';
        cuentas.push({cd,nm,saldo,lado,grupo:cd[0]});
      }
    }
  });

  if(!cuentas.length){
    toast('⚠️ No se detectaron cuentas. Verifica que el archivo tenga códigos numéricos de 7 dígitos.','e');
    return;
  }

  // Construir líneas respetando el lado del balance:
  // - Lado A (Activo): saldo positivo → Debe | saldo negativo → Haber (cuenta "en rojo")
  // - Lado P (Pasivo+Patrimonio): saldo positivo → Haber | saldo negativo → Debe (cuenta "en rojo")
  const lineas=cuentas.map(c=>{
    let debe=0,haber=0;
    if(c.lado==='A'){
      if(c.saldo>=0)debe=c.saldo;else haber=-c.saldo;
    }else{
      if(c.saldo>=0)haber=c.saldo;else debe=-c.saldo;
    }
    // Descartar cuentas de grupo 3 (Gastos) y 4 (Ingresos) — no corresponden a apertura
    if(c.grupo==='3'||c.grupo==='4')return null;
    return {cd:c.cd,nm:c.nm,desc:'',debe,haber,_lado:c.lado,_saldoOrig:c.saldo};
  }).filter(x=>x&&(x.debe>0||x.haber>0));

  if(!lineas.length){toast('⚠️ No hay líneas con saldo válido','e');return;}
  IMB={lineas};
  abrirImpBalModal();
}

function abrirImpBalModal(){
  renderImpBalModal();
  document.getElementById('impbal-modal').classList.add('open');
}

function cerrarImpBalModal(){
  document.getElementById('impbal-modal').classList.remove('open');
  IMB={lineas:[]};
}

function renderImpBalModal(){
  const n=IMB.lineas.length;
  const incl=IMB.lineas.filter(l=>l.incluir!==false);
  const tD=incl.reduce((s,l)=>s+l.debe,0);
  const tH=incl.reduce((s,l)=>s+l.haber,0);
  const diff=tD-tH;
  const cuadra=tD===tH&&tD>0;

  document.getElementById('impbal-summary').innerHTML=
    `📊 <strong>${n}</strong> cuentas detectadas · <strong>${incl.length}</strong> incluidas · ` +
    `Activos (Debe): <strong>${fmtC(tD)}</strong> · Pasivos+Patrimonio (Haber): <strong>${fmtC(tH)}</strong>` +
    (cuadra?' · <span style="color:var(--ach)">✓ CUADRA</span>':
     ` · <span style="color:var(--err)">⚠️ ${diff>0?'falta Haber':'falta Debe'}: ${fmtC(Math.abs(diff))}</span>`);

  const btn=document.getElementById('impbal-btn-ok');
  btn.disabled=!cuadra||incl.length===0;
  btn.textContent=cuadra?`💾 Cargar ${incl.length} líneas como Apertura`:'⚠️ Balance no cuadra';

  document.getElementById('impbal-all').checked=incl.length===n;

  const rowsEl=document.getElementById('impbal-rows');
  rowsEl.innerHTML=IMB.lineas.map((l,i)=>{
    const cExiste=PDC.find(c=>c.cd===l.cd);
    const nombreFinal=cExiste?cExiste.nm:l.nm;
    const sinPDC=!cExiste?'<div style="font-size:9px;color:var(--err);margin-top:2px">⚠️ No existe en PDC</div>':'';
    return `<div style="display:grid;grid-template-columns:26px 90px 1fr 110px 110px;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(48,54,61,.4);align-items:center;font-size:11px${l.incluir===false?';opacity:.4':''}">
      <div style="text-align:center"><input type="checkbox" ${l.incluir!==false?'checked':''} onchange="IMB.lineas[${i}].incluir=this.checked;renderImpBalModal()"></div>
      <div style="font-family:var(--mono);font-size:10px">${l.cd}</div>
      <div>${nombreFinal}${sinPDC}</div>
      <div style="text-align:right;font-family:var(--mono);color:${l.debe?'var(--tx)':'var(--mt)'}">${l.debe?fmt(l.debe):'–'}</div>
      <div style="text-align:right;font-family:var(--mono);color:${l.haber?'var(--tx)':'var(--mt)'}">${l.haber?fmt(l.haber):'–'}</div>
    </div>`;
  }).join('');

  document.getElementById('impbal-total').innerHTML=
    `<div></div><div></div><div style="text-align:right">TOTALES</div>`+
    `<div style="text-align:right;font-family:var(--mono)">${fmtC(tD)}</div>`+
    `<div style="text-align:right;font-family:var(--mono)">${fmtC(tH)}</div>`;
}

function toggleAllBal(checked){
  IMB.lineas.forEach(l=>l.incluir=checked);
  renderImpBalModal();
}

async function confirmarImportBalance(){
  const lineas=IMB.lineas.filter(l=>l.incluir!==false).map(l=>{
    const cPDC=PDC.find(c=>c.cd===l.cd);
    return {cd:l.cd,nm:cPDC?cPDC.nm:l.nm,desc:'',debe:l.debe,haber:l.haber};
  });
  if(!lineas.length){toast('⚠️ No hay líneas para importar','e');return;}
  const tD=lineas.reduce((s,l)=>s+l.debe,0);
  const tH=lineas.reduce((s,l)=>s+l.haber,0);
  if(tD!==tH){toast('⚠️ No cuadra','e');return;}

  // Si ya existe apertura, preguntar
  if(S.apertura){
    if(!confirm('Ya existe un Balance de Apertura. Será REEMPLAZADO por estas líneas.\n\n¿Continuar?'))return;
  }

  const anioApertura=S.empresa.anio-1;
  S.apertura={
    fecha:`${anioApertura}-12-31`,
    glosa:`Balance de apertura al 01-01-${S.empresa.anio}`,
    movs:lineas
  };
  try{await window.storage.set('apertura-'+S.empresa.anio,JSON.stringify(S.apertura));}
  catch(e){toast('❌ Error al guardar: '+e.message,'e');return;}
  cerrarImpBalModal();
  toast(`✅ Balance de Apertura cargado: ${lineas.length} líneas · ${fmtC(tD)}`);
  rerender();
}


export {APF, renderApertura, abrirApertura, cerrarApertura, apRenderLineas, apLCd, apLRut, apLVal, apDelLinea, apAddLinea, apPrellenar, apUpdCuadre, guardarApertura, eliminarApertura, IMB, initBalanceImportListener, procesarBalanceXLSX, abrirImpBalModal, cerrarImpBalModal, renderImpBalModal, toggleAllBal, confirmarImportBalance};
