// centroscosto-ui.js — Vista de centros de costo y capitalización de gastos.
import {toast, fmtC, today, pdcNm, PDC} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import {rerender} from './ui.js';
import {CC_ESTADOS, centros, predios, cuarteles, ccInfo, ccNombre, guardarCentros,
        crearCentro, actualizarCentro, eliminarCentro, costoAcumulado,
        resumenCentros, contarMovimientos, CURVAS_DEFAULT, curvaInfo, costoPorAnio,
        pctCapitalizacion, anioFormacion, costosDelMes, estaCerrado, registrarCierre,
        revertirCierre, guardarCierresCC, cierresCC, temporadaLbl, temporadaDe} from './centroscosto.js';
import {proxFolioAsiento} from './asientos.js';
import {esAdmin} from './auth.js';
import {MESES} from './core.js';

let CCF={editId:null,nivel:1};
let CC_DETALLE=null; // id del cuartel expandido

export function renderCentrosCosto(){
  const el=document.getElementById('cc-content');
  if(!el)return;
  const resumen=resumenCentros();
  const totalGeneral=resumen.reduce((s,r)=>s+r.cuarteles.reduce((t,c)=>t+c.costo,0),0);

  if(!centros().length){
    el.innerHTML=`<div class="empty"><div class="ei">📊</div>
      No hay centros de costo.<br><br>
      <button class="btn btn-p" onclick="abrirFormCC(1)">+ Crear primer centro</button>
      <div style="margin-top:14px;font-size:11px;color:var(--mt);max-width:420px;margin-left:auto;margin-right:auto">
        Organiza los costos en dos niveles: <strong>centro principal</strong> (ej. Administración, Área Maderas, Transporte, un predio)
        y <strong>subcentro</strong> (ej. Contabilidad, Aserradero, Camión 1, un cuartel).
        Los centros marcados como <strong>inversión en curso</strong> acumulan costos capitalizables a activo fijo.
      </div></div>
  <!-- Formulario -->
  <div class="card" id="cc-form" style="display:none;margin-top:14px">
    <div class="card-title" id="ccf-title">Nuevo centro de costo</div>
    <div class="fg">
      <div class="grp full"><label>Nombre</label><input type="text" id="ccf-nombre" placeholder="Ej: Administración · Transporte · Cuartel 3"></div>
      <div class="grp"><label>Código (opcional)</label><input type="text" id="ccf-codigo" placeholder="Ej: ADM · TRA · C03"></div>
      <div class="grp" id="ccf-padre-wrap"><label>Centro principal</label><select id="ccf-padre"></select></div>
      <div class="grp" id="ccf-estado-wrap"><label>Tipo de centro</label><select id="ccf-estado" onchange="onTipoCentroChange()">
        ${CC_ESTADOS.filter(e=>e.id!=='capitalizado').map(e=>`<option value="${e.id}" title="${e.desc}">${e.nm}</option>`).join('')}
      </select></div>
      <div class="grp" id="ccf-fecha-wrap"><label>Fecha de inicio</label><input type="date" id="ccf-fecha"><div style="font-size:10px;color:var(--mt);margin-top:2px">Define el año 1 de la curva de capitalización</div></div>
      <div class="grp" id="ccf-curva-wrap"><label>Curva de capitalización</label><select id="ccf-curva" onchange="onCurvaChange()">
        ${CURVAS_DEFAULT.map(cv=>`<option value="${cv.id}">${cv.nm} — ${cv.pcts.join('/')}%</option>`).join('')}
      </select></div>
      <div class="grp full" id="ccf-cuenta-wrap"><label>Cuenta de costo del período</label><select id="ccf-cuenta-costo">
        ${PDC.filter(x=>x.cd.length===7&&x.nat&&(x.cd.startsWith('31')||x.cd.startsWith('33'))).map(x=>`<option value="${x.cd}">${x.cd} — ${x.nm}</option>`).join('')}
      </select><div style="font-size:10px;color:var(--mt);margin-top:2px">Recibe la parte NO capitalizable de cada período</div></div>
      <div class="grp full" id="ccf-pcts-wrap">
        <label>% que se capitaliza cada año</label>
        <div id="ccf-pcts" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        <div style="font-size:10px;color:var(--mt);margin-top:4px">El resto de cada año va a <strong>costo del período</strong> (resultado). Ej. cerezos: años 1-3 100% activo, año 4 50/50, año 5 en adelante 100% costo.</div>
      </div>
    </div>
    <div class="save-row" style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="guardarCC()">💾 Guardar</button>
      <button class="btn btn-g" onclick="cerrarFormCC()">Cancelar</button>
    </div>
  </div>`;
    return;
  }

  const bloques=resumen.map(r=>{
    const totPredio=r.cuarteles.reduce((t,c)=>t+c.costo,0);
    const filas=r.cuarteles.map(({centro:c,costo,movimientos})=>{
      const est=CC_ESTADOS.find(e=>e.id===c.estado)||CC_ESTADOS[0];
      const rep=costoPorAnio(c.id);
      const pctActual=pctCapitalizacion(c,S.empresa.anio);
      const añoForm=anioFormacion(c,S.empresa.anio);
      const color=c.estado==='capitalizado'?'var(--ach)':(c.estado==='formacion'?'var(--warn)':'var(--info)');
      return `<tr>
        <td class="tl" style="font-size:12px;padding-left:22px">
          ${c.nombre}${c.codigo?` <span style="color:var(--mt);font-family:var(--mono);font-size:10px">${c.codigo}</span>`:''}
          <div style="font-size:10px;color:${color}">${est.nm}${c.fechaInicio?' · inicio '+c.fechaInicio:''}${añoForm>0?` · año ${añoForm}`:''}</div>
          ${c.estado==='formacion'&&añoForm>0?`<div style="font-size:10px;color:var(--mt)">${S.empresa.anio}: <strong style="color:var(--ach)">${pctActual}% activo</strong> / ${100-pctActual}% costo</div>`:''}
        </td>
        <td style="text-align:right;font-size:11px;color:var(--mt)">${movimientos}</td>
        <td style="font-family:var(--mono);text-align:right;font-weight:600">${fmtC(costo)}
          ${rep.totalActivo!==costo?`<div style="font-size:9px;color:var(--mt)">act. ${fmtC(rep.totalActivo)} · cto. ${fmtC(rep.totalCosto)}</div>`:''}
        </td>
        <td style="text-align:right;white-space:nowrap">
          ${costo>0?`<button class="btn btn-i" onclick="verDetalleCC('${c.id}')" title="Ver movimientos">📋</button>`:''}
          ${c.estado==='formacion'&&costo>0?`<button class="btn btn-p" onclick="abrirCapitalizar('${c.id}')" title="Capitalizar a activo fijo">📦 Capitalizar</button>`:''}
          <button class="btn btn-i" onclick="editarCC('${c.id}')">✏️</button>
          <button class="btn btn-d" onclick="borrarCC('${c.id}')">🗑</button>
        </td>
      </tr>
      ${CC_DETALLE===c.id?renderDetalleCC(c.id):''}`;
    }).join('');

    return `<div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr>
        <th class="tl">📁 ${r.predio.nombre}${r.predio.codigo?` <span style="font-family:var(--mono);font-size:10px;color:var(--mt)">${r.predio.codigo}</span>`:''}</th>
        <th style="text-align:right;width:60px">MOVS</th>
        <th style="text-align:right;width:120px">COSTO ACUM.</th>
        <th style="text-align:right;width:180px"></th>
      </tr></thead>
      <tbody>
        ${filas||'<tr><td colspan="4" style="text-align:center;color:var(--mt);padding:14px;font-size:12px">Sin subcentros. Agrega uno para acumular costos.</td></tr>'}
        <tr style="background:rgba(88,166,255,.06)">
          <td class="tl" style="font-weight:700;font-size:12px">Total ${r.predio.nombre}</td><td></td>
          <td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(totPredio)}</td>
          <td style="text-align:right">
            <button class="btn btn-i" onclick="abrirFormCC(2,'${r.predio.id}')">+ Subcentro</button>
            <button class="btn btn-i" onclick="editarCC('${r.predio.id}')">✏️</button>
            <button class="btn btn-d" onclick="borrarCC('${r.predio.id}')">🗑</button>
          </td>
        </tr>
      </tbody>
    </table></div></div>`;
  }).join('');

  el.innerHTML=`
  ${renderPanelCierre()}
  <div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Centros principales</div><div class="kpi-val">${predios().length}</div></div>
    <div class="kpi"><div class="kpi-lbl">Subcentros</div><div class="kpi-val">${cuarteles().length}</div></div>
    <div class="kpi"><div class="kpi-lbl">Inversión en curso</div><div class="kpi-val">${cuarteles().filter(c=>c.estado==='formacion').length}</div></div>
    <div class="kpi"><div class="kpi-lbl">Costo acumulado</div><div class="kpi-val">${fmtC(totalGeneral)}</div></div>
  </div>
  <div class="info-tip" style="margin-bottom:14px">📊 Asigna gastos a cualquier centro para analizarlos por área. Los centros marcados como <strong>inversión en curso</strong> acumulan costos capitalizables: cuando el proyecto termina, pulsa <strong>Capitalizar</strong> para traspasarlos a un activo fijo.</div>
  ${bloques}
  <div style="display:flex;gap:8px;margin-top:12px">
    <button class="btn btn-p" onclick="abrirFormCC(1)">+ Nuevo centro principal</button>
  </div>

  <!-- Formulario -->
  <div class="card" id="cc-form" style="display:none;margin-top:14px">
    <div class="card-title" id="ccf-title">Nuevo centro de costo</div>
    <div class="fg">
      <div class="grp full"><label>Nombre</label><input type="text" id="ccf-nombre" placeholder="Ej: Administración · Transporte · Cuartel 3"></div>
      <div class="grp"><label>Código (opcional)</label><input type="text" id="ccf-codigo" placeholder="Ej: ADM · TRA · C03"></div>
      <div class="grp" id="ccf-padre-wrap"><label>Centro principal</label><select id="ccf-padre"></select></div>
      <div class="grp" id="ccf-estado-wrap"><label>Tipo de centro</label><select id="ccf-estado" onchange="onTipoCentroChange()">
        ${CC_ESTADOS.filter(e=>e.id!=='capitalizado').map(e=>`<option value="${e.id}" title="${e.desc}">${e.nm}</option>`).join('')}
      </select></div>
      <div class="grp" id="ccf-fecha-wrap"><label>Fecha de inicio</label><input type="date" id="ccf-fecha"><div style="font-size:10px;color:var(--mt);margin-top:2px">Define el año 1 de la curva de capitalización</div></div>
      <div class="grp" id="ccf-curva-wrap"><label>Curva de capitalización</label><select id="ccf-curva" onchange="onCurvaChange()">
        ${CURVAS_DEFAULT.map(cv=>`<option value="${cv.id}">${cv.nm} — ${cv.pcts.join('/')}%</option>`).join('')}
      </select></div>
      <div class="grp full" id="ccf-cuenta-wrap"><label>Cuenta de costo del período</label><select id="ccf-cuenta-costo">
        ${PDC.filter(x=>x.cd.length===7&&x.nat&&(x.cd.startsWith('31')||x.cd.startsWith('33'))).map(x=>`<option value="${x.cd}">${x.cd} — ${x.nm}</option>`).join('')}
      </select><div style="font-size:10px;color:var(--mt);margin-top:2px">Recibe la parte NO capitalizable de cada período</div></div>
      <div class="grp full" id="ccf-pcts-wrap">
        <label>% que se capitaliza cada año</label>
        <div id="ccf-pcts" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        <div style="font-size:10px;color:var(--mt);margin-top:4px">El resto de cada año va a <strong>costo del período</strong> (resultado). Ej. cerezos: años 1-3 100% activo, año 4 50/50, año 5 en adelante 100% costo.</div>
      </div>
    </div>
    <div class="save-row" style="display:flex;gap:8px">
      <button class="btn btn-p" onclick="guardarCC()">💾 Guardar</button>
      <button class="btn btn-g" onclick="cerrarFormCC()">Cancelar</button>
    </div>
  </div>

  <!-- Modal capitalizar -->
  <div class="card" id="cc-capitalizar" style="display:none;margin-top:14px;border-color:var(--ac)">
    <div class="card-title">📦 Capitalizar costos a activo fijo</div>
    <div id="cap-content"></div>
  </div>`;
  renderPreviewCierre(); // dibujar la vista previa del cierre mensual
}

function renderDetalleCC(id){
  const centro=ccInfo(id);
  const {filas,totalGasto,totalActivo,totalCosto}=costoPorAnio(id);
  if(!filas.length)return '';
  const cuerpo=filas.map(f=>`<tr style="background:rgba(0,0,0,.12)">
    <td class="tl" style="font-size:11px;padding-left:34px">
      ${f.anio} <span style="color:var(--mt)">· año ${f.anioFormacion} de formación · ${f.movs} mov.</span>
      <div style="font-size:10px;color:var(--mt)">${f.pct}% activo / ${100-f.pct}% costo período</div>
    </td>
    <td style="font-family:var(--mono);text-align:right;font-size:11px">${fmtC(f.total)}</td>
    <td style="font-family:var(--mono);text-align:right;font-size:11px;color:var(--ach)">${fmtC(f.activo)}</td>
    <td style="font-family:var(--mono);text-align:right;font-size:11px;color:var(--warn)">${fmtC(f.costo)}</td>
  </tr>`).join('');
  return `<tr style="background:rgba(0,0,0,.12)">
      <td class="tl" style="padding-left:34px;font-size:10px;color:var(--mt);text-transform:uppercase">Ejercicio</td>
      <td style="text-align:right;font-size:10px;color:var(--mt)">GASTO</td>
      <td style="text-align:right;font-size:10px;color:var(--ach)">→ ACTIVO</td>
      <td style="text-align:right;font-size:10px;color:var(--warn)">→ COSTO</td>
    </tr>
    ${cuerpo}
    <tr style="background:rgba(0,0,0,.2)">
      <td class="tl" style="padding-left:34px;font-size:11px;font-weight:700">Totales</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:11px">${fmtC(totalGasto)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:11px;color:var(--ach)">${fmtC(totalActivo)}</td>
      <td style="font-family:var(--mono);text-align:right;font-weight:700;font-size:11px;color:var(--warn)">${fmtC(totalCosto)}</td>
    </tr>
    <tr style="background:rgba(0,0,0,.12)"><td colspan="4" style="text-align:right;padding:6px 10px"><button class="btn btn-g" onclick="verDetalleCC(null)">Cerrar detalle</button></td></tr>`;
}

export function verDetalleCC(id){CC_DETALLE=(CC_DETALLE===id)?null:id;renderCentrosCosto();}



// ── Panel de cierre mensual (solo administradores) ──
function renderPanelCierre(){
  if(!esAdmin())return '';
  const anio=S.empresa.anio;
  const mesActual=+String(today()).slice(5,7);
  const enFormacion=cuarteles().filter(c=>c.estado==='formacion');
  if(!enFormacion.length)return ''; // sin inversiones en curso no hay nada que traspasar

  const opciones=MESES.map((m,i)=>`<option value="${i+1}" ${i+1===mesActual?'selected':''}>${m} ${anio}</option>`).join('');
  return `<div class="card" style="margin-bottom:16px;border-color:var(--ac)">
    <div class="card-title">🔐 Cierre mensual de costos</div>
    <div class="info-tip" style="margin-bottom:12px;font-size:11px">
      Traspasa los gastos del mes de cada centro en <strong>inversión en curso</strong>: una parte se <strong>activa</strong>
      y el resto va a <strong>costo del período</strong>, según la curva configurada.
      Ejecútalo <strong>solo cuando el mes esté cerrado</strong>: es manual a propósito.
    </div>
    <div class="fg">
      <div class="grp"><label>Período a cerrar</label><select id="cierre-mes" onchange="renderCentrosCosto()">${opciones}</select></div>
    </div>
    <div id="cierre-preview"></div>
  </div>`;
}

// Vista previa del cierre del mes seleccionado
function renderPreviewCierre(){
  const cont=document.getElementById('cierre-preview');
  if(!cont)return;
  const anio=S.empresa.anio;
  const mes=+(document.getElementById('cierre-mes')||{}).value||1;
  const enFormacion=cuarteles().filter(c=>c.estado==='formacion');
  const filas=enFormacion.map(c=>{
    const m=costosDelMes(c.id,anio,mes);
    const cerrado=estaCerrado(c.id,anio,mes);
    return {centro:c,m,cerrado};
  });
  const conMovs=filas.filter(f=>f.m.total>0||f.cerrado);
  if(!conMovs.length){
    cont.innerHTML=`<div style="padding:12px;text-align:center;color:var(--mt);font-size:12px">Sin gastos registrados en ${MESES[mes-1]} ${anio} para centros en inversión.</div>`;
    return;
  }
  const totActivo=conMovs.filter(f=>!f.cerrado).reduce((s,f)=>s+f.m.activo,0);
  const totCosto=conMovs.filter(f=>!f.cerrado).reduce((s,f)=>s+f.m.costo,0);
  const pendientes=conMovs.filter(f=>!f.cerrado&&f.m.total>0);

  cont.innerHTML=`<div class="card-np" style="margin-bottom:10px"><div class="tw"><table>
    <thead><tr><th class="tl">CENTRO</th><th class="tl">TEMPORADA</th><th style="text-align:right">GASTO MES</th><th style="text-align:right">% ACT</th><th style="text-align:right">→ ACTIVO</th><th style="text-align:right">→ COSTO</th><th></th></tr></thead>
    <tbody>${conMovs.map(({centro,m,cerrado})=>`<tr${cerrado?' style="opacity:.5"':''}>
      <td class="tl" style="font-size:12px">${centro.nombre}</td>
      <td class="tl" style="font-size:11px;color:var(--mt)">${m.lblTemporada} · año ${m.anioFormacion}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtC(m.total)}</td>
      <td style="text-align:right">${m.pct}%</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--ach)">${fmtC(m.activo)}</td>
      <td style="font-family:var(--mono);text-align:right;color:var(--warn)">${fmtC(m.costo)}</td>
      <td style="text-align:right;font-size:11px">${cerrado?'<span style="color:var(--ach)">✓ cerrado</span>':''}</td>
    </tr>`).join('')}</tbody>
  </table></div></div>
  ${pendientes.length?`
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-p" onclick="ejecutarCierreMensual()">🔐 Cerrar ${MESES[mes-1]} ${anio} (${pendientes.length} centros)</button>
      <span style="font-size:11px;color:var(--mt)">Activo ${fmtC(totActivo)} · Costo período ${fmtC(totCosto)}</span>
    </div>`
   :`<div style="font-size:11px;color:var(--ach)">✓ ${MESES[mes-1]} ${anio} ya está cerrado para todos los centros con movimientos.</div>
     <div style="margin-top:8px"><button class="btn btn-g" onclick="revertirCierreMensual()">↩️ Revertir cierre del mes</button></div>`}`;
}

// Ejecuta el traspaso del mes: un asiento con todos los cuarteles
export async function ejecutarCierreMensual(){
  if(!esAdmin()){toast('⚠️ Solo un administrador puede cerrar el mes','e');return;}
  const anio=S.empresa.anio;
  const mes=+(document.getElementById('cierre-mes')||{}).value||1;
  const enFormacion=cuarteles().filter(c=>c.estado==='formacion');
  const pendientes=enFormacion
    .map(c=>({centro:c,m:costosDelMes(c.id,anio,mes)}))
    .filter(x=>x.m.total>0&&!estaCerrado(x.centro.id,anio,mes));
  if(!pendientes.length){toast('⚠️ No hay gastos pendientes de traspasar en el período','e');return;}

  const totActivo=pendientes.reduce((s,x)=>s+x.m.activo,0);
  const totCosto=pendientes.reduce((s,x)=>s+x.m.costo,0);
  const totGasto=pendientes.reduce((s,x)=>s+x.m.total,0);
  if(!confirm(`¿Cerrar ${MESES[mes-1]} ${anio}?\n\n${pendientes.length} cuarteles\nGasto del mes: ${fmtC(totGasto)}\n→ Activo (inversión): ${fmtC(totActivo)}\n→ Costo del período: ${fmtC(totCosto)}\n\nSe generará un asiento de traspaso. Podrás revertirlo si te equivocas.`))return;

  const movs=[];
  // Por cada cuartel: cargar su activo en curso y su costo de huerto
  pendientes.forEach(({centro,m})=>{
    if(m.activo>0){
      const cdAct=centro.cuentaActivoCurso||'1210001';
      movs.push({cd:cdAct,nm:pdcNm(cdAct),debe:m.activo,haber:0,desc:`Inversión ${centro.nombre} ${MESES[mes-1]}`,cc:centro.id});
    }
    if(m.costo>0){
      const cdCosto=centro.cuentaCosto||'3101003';
      movs.push({cd:cdCosto,nm:pdcNm(cdCosto),debe:m.costo,haber:0,desc:`Costo período ${centro.nombre} ${MESES[mes-1]}`,cc:centro.id});
    }
  });
  // Abonar las cuentas de gasto de origen
  const porCuenta={};
  pendientes.forEach(({m})=>{
    Object.entries(m.porCuenta).forEach(([cd,v])=>{if(cd!=='SIN')porCuenta[cd]=(porCuenta[cd]||0)+v;});
  });
  Object.entries(porCuenta).forEach(([cd,v])=>{
    if(v)movs.push({cd,nm:pdcNm(cd),debe:0,haber:v,desc:`Traspaso costos ${MESES[mes-1]} ${anio}`});
  });

  const totD=movs.reduce((s,m)=>s+(m.debe||0),0), totH=movs.reduce((s,m)=>s+(m.haber||0),0);
  if(Math.abs(totD-totH)>1){
    toast(`❌ El asiento no cuadra (D ${fmtC(totD)} / H ${fmtC(totH)}). No se guardó.`,'e');return;
  }

  // Último día del mes
  const ultimo=new Date(anio,mes,0).getDate();
  const fecha=`${anio}-${String(mes).padStart(2,'0')}-${ultimo}`;
  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha,
    glosa:`Cierre costos ${MESES[mes-1]} ${anio}`,movs,
    tipoCierreCC:true}); // marca: no volver a contarlo como gasto del centro
  await window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});

  pendientes.forEach(({centro,m})=>{
    registrarCierre({cc:centro.id,periodo:m.periodo,fecha,folio,activo:m.activo,costo:m.costo,total:m.total});
  });
  await guardarCierresCC();

  toast(`🔐 ${MESES[mes-1]} cerrado — asiento N°${folio}`);
  logAccion('Cerró mes de costos',`${MESES[mes-1]} ${anio} · activo ${fmtC(totActivo)} · costo ${fmtC(totCosto)}`);
  renderCentrosCosto();rerender();
}

export async function revertirCierreMensual(){
  if(!esAdmin()){toast('⚠️ Solo un administrador puede revertir','e');return;}
  const anio=S.empresa.anio;
  const mes=+(document.getElementById('cierre-mes')||{}).value||1;
  const per=`${anio}-${String(mes).padStart(2,'0')}`;
  const regs=cierresCC().filter(c=>c.periodo===per);
  if(!regs.length){toast('⚠️ No hay cierre registrado para ese mes','e');return;}
  const folios=[...new Set(regs.map(r=>r.folio))];
  if(!confirm(`¿Revertir el cierre de ${MESES[mes-1]} ${anio}?\n\nSe anulará el asiento N°${folios.join(', ')} y podrás volver a cerrarlo.`))return;
  // Anular los asientos generados (no se borran, se marcan)
  S.asientos.forEach(a=>{if(folios.includes(a.n))a.anulado=true;});
  await window.storage.set('asientos-'+anio,JSON.stringify(S.asientos)).catch(()=>{});
  regs.forEach(r=>revertirCierre(r.cc,per));
  await guardarCierresCC();
  toast('↩️ Cierre revertido; el asiento quedó anulado');
  logAccion('Revirtió cierre de costos',`${MESES[mes-1]} ${anio}`);
  renderCentrosCosto();rerender();
}


// Los campos de capitalización (curva, cuenta de costo, fecha) solo tienen
// sentido en centros de "inversión en curso". En los operativos se ocultan.
export function onTipoCentroChange(){
  const tipo=(document.getElementById('ccf-estado')||{}).value;
  const esInversion=tipo==='formacion'||tipo==='capitalizado';
  ['ccf-curva-wrap','ccf-pcts-wrap','ccf-cuenta-wrap','ccf-fecha-wrap'].forEach(id=>{
    const e=document.getElementById(id);
    if(e)e.style.display=esInversion?'':'none';
  });
}

// ── Curva de capitalización ──
let CCF_PCTS=[]; // porcentajes en edición

// Dibuja los inputs de % por año (editables)
function renderPcts(){
  const box=document.getElementById('ccf-pcts');
  if(!box)return;
  box.innerHTML=CCF_PCTS.map((p,i)=>`
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span style="font-size:10px;color:var(--mt)">Año ${i+1}</span>
      <input type="number" min="0" max="100" step="5" value="${p}" onchange="setPct(${i},this.value)"
             style="width:62px;text-align:center;padding:5px">
      <span style="font-size:9px;color:var(--mt)">${100-p}% costo</span>
    </div>`).join('')+`
    <div style="display:flex;flex-direction:column;justify-content:center;gap:4px;padding-left:4px">
      <button class="btn btn-i" style="padding:3px 8px" onclick="addPctAnio()" title="Agregar año">＋</button>
      ${CCF_PCTS.length>1?`<button class="btn btn-d" style="padding:3px 8px" onclick="delPctAnio()" title="Quitar último">−</button>`:''}
    </div>
    <div style="display:flex;align-items:center;padding-left:8px;font-size:11px;color:var(--mt)">
      Año ${CCF_PCTS.length+1} en adelante: <strong style="color:var(--tx);margin-left:4px">100% costo</strong>
    </div>`;
}

export function setPct(i,v){
  CCF_PCTS[i]=Math.max(0,Math.min(100,+v||0));
  renderPcts();
}
export function addPctAnio(){CCF_PCTS.push(0);renderPcts();}
export function delPctAnio(){if(CCF_PCTS.length>1)CCF_PCTS.pop();renderPcts();}

export function onCurvaChange(){
  const id=document.getElementById('ccf-curva').value;
  CCF_PCTS=[...curvaInfo(id).pcts];
  renderPcts();
}

// ── Formulario ──
export function abrirFormCC(nivel,padre){
  CCF={editId:null,nivel:+nivel};
  const f=document.getElementById('cc-form');f.style.display='block';
  document.getElementById('ccf-title').textContent=nivel===1?'Nuevo centro principal':'Nuevo subcentro';
  document.getElementById('ccf-nombre').value='';
  document.getElementById('ccf-codigo').value='';
  document.getElementById('ccf-fecha').value=today();
  const esN2=nivel===2;
  document.getElementById('ccf-padre-wrap').style.display=esN2?'':'none';
  document.getElementById('ccf-estado-wrap').style.display=esN2?'':'none';
  document.getElementById('ccf-fecha-wrap').style.display=esN2?'':'none';
  if(esN2){
    document.getElementById('ccf-padre').innerHTML=predios().map(p=>`<option value="${p.id}" ${p.id===padre?'selected':''}>${p.nombre}</option>`).join('');
    document.getElementById('ccf-estado').value='operativo';
    document.getElementById('ccf-curva').value='cerezo';
    document.getElementById('ccf-cuenta-costo').value='3101003';
    CCF_PCTS=[...curvaInfo('cerezo').pcts];
    renderPcts();
    onTipoCentroChange();
  }
  ['ccf-curva-wrap','ccf-pcts-wrap','ccf-cuenta-wrap'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display=esN2?'':'none';});
  f.scrollIntoView({behavior:'smooth',block:'nearest'});
}

export function editarCC(id){
  const c=ccInfo(id);if(!c)return;
  CCF={editId:id,nivel:c.nivel};
  const f=document.getElementById('cc-form');f.style.display='block';
  document.getElementById('ccf-title').textContent=c.nivel===1?'Editar centro principal':'Editar subcentro';
  document.getElementById('ccf-nombre').value=c.nombre;
  document.getElementById('ccf-codigo').value=c.codigo||'';
  document.getElementById('ccf-fecha').value=c.fechaInicio||'';
  const esN2=c.nivel===2;
  document.getElementById('ccf-padre-wrap').style.display=esN2?'':'none';
  document.getElementById('ccf-estado-wrap').style.display=esN2?'':'none';
  document.getElementById('ccf-fecha-wrap').style.display=esN2?'':'none';
  if(esN2){
    document.getElementById('ccf-padre').innerHTML=predios().map(p=>`<option value="${p.id}" ${p.id===c.padre?'selected':''}>${p.nombre}</option>`).join('');
    const sel=document.getElementById('ccf-estado');
    if(c.estado==='capitalizado'&&!sel.querySelector('[value="capitalizado"]'))
      sel.innerHTML+='<option value="capitalizado">Capitalizado</option>';
    sel.value=c.estado||'formacion';
    document.getElementById('ccf-curva').value=c.curva||'custom';
    document.getElementById('ccf-cuenta-costo').value=c.cuentaCosto||'3101003';
    CCF_PCTS=(c.pctsCapitalizacion&&c.pctsCapitalizacion.length)?[...c.pctsCapitalizacion]:[...curvaInfo(c.curva).pcts];
    renderPcts();
    onTipoCentroChange();
  }
  ['ccf-curva-wrap','ccf-pcts-wrap','ccf-cuenta-wrap'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display=esN2?'':'none';});
  f.scrollIntoView({behavior:'smooth',block:'nearest'});
}

export function cerrarFormCC(){
  const f=document.getElementById('cc-form');if(f)f.style.display='none';
  CCF={editId:null,nivel:1};
}

export async function guardarCC(){
  const nombre=document.getElementById('ccf-nombre').value.trim();
  if(!nombre){toast('⚠️ Ingresa el nombre','e');return;}
  const codigo=document.getElementById('ccf-codigo').value.trim();
  const nivel=CCF.nivel;
  const campos={nombre,codigo};
  if(nivel===2){
    campos.padre=document.getElementById('ccf-padre').value;
    campos.estado=document.getElementById('ccf-estado').value;
    campos.fechaInicio=document.getElementById('ccf-fecha').value;
    campos.curva=document.getElementById('ccf-curva').value;
    campos.pctsCapitalizacion=[...CCF_PCTS];
    campos.cuentaCosto=document.getElementById('ccf-cuenta-costo').value;
    if(!campos.padre){toast('⚠️ Selecciona el predio','e');return;}
  }
  if(CCF.editId)actualizarCentro(CCF.editId,campos);
  else crearCentro({nivel,...campos});
  await guardarCentros();
  toast(CCF.editId?'✅ Centro actualizado':'✅ Centro creado');
  cerrarFormCC();renderCentrosCosto();
}

export async function borrarCC(id){
  const c=ccInfo(id);if(!c)return;
  if(!confirm(`¿Eliminar "${c.nombre}"?`))return;
  const r=eliminarCentro(id);
  if(!r.ok){toast('⚠️ '+r.motivo,'e');return;}
  await guardarCentros();
  toast('🗑 Centro eliminado');renderCentrosCosto();
}

// ── CAPITALIZACIÓN ──
export function abrirCapitalizar(id){
  const c=ccInfo(id);if(!c)return;
  const rep=costoPorAnio(id);
  const total=rep.totalActivo; // solo se capitaliza la porción activable
  const box=document.getElementById('cc-capitalizar');
  const cont=document.getElementById('cap-content');
  box.style.display='block';
  // Cuentas de activo sugeridas (grupo 12, no correctoras)
  const cuentasActivo=PDC.filter(x=>x.cd.length===7&&x.nat&&x.cd.startsWith('12')&&x.cd[4]!=='2');
  cont.innerHTML=`
    <div class="info-tip" style="margin-bottom:12px">
      Se traspasará a activo fijo <strong>solo la porción activable</strong> de <strong>${ccNombre(id)}</strong>,
      según la curva de capitalización configurada. El resto ya es costo del huerto y permanece en resultado.
    </div>
    <div class="card-np" style="margin-bottom:12px"><div class="tw"><table>
      <thead><tr><th class="tl">TEMPORADA</th><th style="text-align:right">GASTO</th><th style="text-align:right">% ACT.</th><th style="text-align:right">A ACTIVO</th><th style="text-align:right">A COSTO</th></tr></thead>
      <tbody>${rep.filas.map(f=>`<tr>
        <td class="tl" style="font-size:12px">${f.lbl} <span style="color:var(--mt)">(año ${f.anioFormacion})</span></td>
        <td style="font-family:var(--mono);text-align:right">${fmtC(f.total)}</td>
        <td style="text-align:right">${f.pct}%</td>
        <td style="font-family:var(--mono);text-align:right;color:var(--ach)">${fmtC(f.activo)}</td>
        <td style="font-family:var(--mono);text-align:right;color:var(--warn)">${fmtC(f.costo)}</td>
      </tr>`).join('')}
      <tr style="background:rgba(88,166,255,.08)">
        <td class="tl" style="font-weight:700">Totales</td>
        <td style="font-family:var(--mono);text-align:right;font-weight:700">${fmtC(rep.totalGasto)}</td><td></td>
        <td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--ach)">${fmtC(rep.totalActivo)}</td>
        <td style="font-family:var(--mono);text-align:right;font-weight:700;color:var(--warn)">${fmtC(rep.totalCosto)}</td>
      </tr></tbody>
    </table></div></div>
    <div class="fg">
      <div class="grp"><label>Monto a capitalizar (porción activo)</label><input type="text" value="${fmtC(total)}" readonly style="color:var(--ach);font-weight:700"></div>
      <div class="grp"><label>Fecha del asiento</label><input type="date" id="cap-fecha" value="${today()}"></div>
      <div class="grp full"><label>Cuenta de activo destino</label><select id="cap-cuenta">
        ${cuentasActivo.map(x=>`<option value="${x.cd}">${x.cd} — ${x.nm}</option>`).join('')}
      </select></div>
      <div class="grp full"><label>Cuenta de costo del período</label><select id="cap-cuenta-costo">
        ${PDC.filter(x=>x.cd.length===7&&x.nat&&(x.cd.startsWith('31')||x.cd.startsWith('33'))).map(x=>`<option value="${x.cd}" ${x.cd===(c.cuentaCosto||'3101003')?'selected':''}>${x.cd} — ${x.nm}</option>`).join('')}
      </select><div style="font-size:10px;color:var(--mt);margin-top:2px">Recibe la parte NO capitalizable (${fmtC(rep.totalCosto)}), que va a resultado de la temporada.</div></div>
      <div class="grp full"><label>Descripción del activo</label><input type="text" id="cap-desc" value="${c.nombre}" placeholder="Ej: Plantación cuartel 3 · Galpón · Camión"></div>
    </div>
    <div class="info-tip" style="font-size:11px;margin:10px 0;background:rgba(210,153,34,.10);border-color:var(--warn)">
      ⚠️ Revisa con tu contador qué costos son capitalizables. En general se activan los <strong>costos directos del proyecto</strong> (materiales, mano de obra, preparación) y no los gastos generales de administración.
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="confirmarCapitalizar('${id}')">📦 Capitalizar y generar asiento</button>
      <button class="btn btn-g" onclick="document.getElementById('cc-capitalizar').style.display='none'">Cancelar</button>
    </div>`;
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

export async function confirmarCapitalizar(id){
  const c=ccInfo(id);if(!c)return;
  const rep=costoPorAnio(id);
  const {detalle}=costoAcumulado(id);
  const total=rep.totalActivo; // solo la porción activable según la curva
  if(total<=0){toast('⚠️ No hay monto activable según la curva de capitalización','e');return;}
  const cuentaActivo=document.getElementById('cap-cuenta').value;
  const fecha=document.getElementById('cap-fecha').value||today();
  const desc=document.getElementById('cap-desc').value.trim()||c.nombre;
  const cuentaCosto=(document.getElementById('cap-cuenta-costo')||{}).value||c.cuentaCosto||'3101003';
  if(!cuentaActivo){toast('⚠️ Selecciona la cuenta de activo','e');return;}
  if(rep.totalCosto>0&&!cuentaCosto){toast('⚠️ Selecciona la cuenta de costo del período','e');return;}
  if(!confirm(`¿Capitalizar ${fmtC(total)} de "${c.nombre}" a la cuenta ${cuentaActivo}?\n\nGasto total acumulado: ${fmtC(rep.totalGasto)}\nSe capitaliza (activo): ${fmtC(rep.totalActivo)}\nQueda como costo del período: ${fmtC(rep.totalCosto)}\n\nSe generará el asiento de traspaso y el cuartel quedará como capitalizado.`))return;

  // ── Construcción del asiento ──
  // Se abona el TOTAL de los gastos acumulados (por su cuenta de origen) y se
  // reparte entre:
  //   DEBE activo fijo        → porción capitalizable según la curva
  //   DEBE costo del huerto   → porción que va a resultado de la temporada
  // Así el gasto original queda saldado y el reparto queda explícito.
  const pctPorTemp={};
  rep.filas.forEach(f=>{pctPorTemp[f.temporada]=f.pct;});

  const porCuenta={};      // total a abonar por cuenta de origen
  detalle.forEach(d=>{
    const cd=d.cuenta||'SIN';
    porCuenta[cd]=(porCuenta[cd]||0)+d.monto;
  });

  const totalGasto=rep.totalGasto;
  const totalCosto=rep.totalCosto;
  const movs=[];

  // DEBE 1: activo fijo (porción capitalizada)
  if(total>0)
    movs.push({cd:cuentaActivo,nm:pdcNm(cuentaActivo),debe:total,haber:0,desc:'Capitalización '+desc,cc:id});

  // DEBE 2: costo del huerto (porción no capitalizable, va a resultado)
  if(totalCosto>0)
    movs.push({cd:cuentaCosto,nm:pdcNm(cuentaCosto),debe:totalCosto,haber:0,desc:'Costo del período — '+desc,cc:id});

  // HABER: se saldan las cuentas de gasto acumuladas
  let abonado=0;
  Object.entries(porCuenta).forEach(([cd,monto])=>{
    if(cd==='SIN'||!monto)return;
    movs.push({cd,nm:pdcNm(cd),debe:0,haber:monto,desc:'Traspaso costos — '+c.nombre,cc:id});
    abonado+=monto;
  });
  // Partidas sin cuenta de origen identificada: cuadrar contra una cuenta de gasto
  if(abonado<totalGasto){
    const dif=totalGasto-abonado;
    const cdFallback=Object.keys(porCuenta).find(x=>x!=='SIN')||'3301001';
    movs.push({cd:cdFallback,nm:pdcNm(cdFallback),debe:0,haber:dif,desc:'Traspaso costos (sin cuenta origen) — '+c.nombre,cc:id});
  }

  // Verificación de cuadre antes de guardar
  const totD=movs.reduce((s,m)=>s+(m.debe||0),0);
  const totH=movs.reduce((s,m)=>s+(m.haber||0),0);
  if(Math.abs(totD-totH)>1){
    toast(`❌ El asiento no cuadra (D ${fmtC(totD)} / H ${fmtC(totH)}). No se guardó.`,'e');
    return;
  }

  const folio=proxFolioAsiento();
  S.asientos.push({id:'as_'+Date.now(),n:folio,fecha,glosa:`Capitalización ${desc}`,movs,tipoCierreCC:true});
  await window.storage.set('asientos-'+S.empresa.anio,JSON.stringify(S.asientos)).catch(()=>{});

  // Registrar el activo fijo
  if(!S.activos)S.activos=[];
  S.activos.push({
    id:'af_'+Date.now(),desc,cat:'instalaciones',
    cuentaActivo,cuentaDeprAcum:'',cuentaGasto:'',
    fecha,valor:total,residual:0,vida:10,metodo:'lineal',cc:id,
  });
  await window.storage.set('activos',JSON.stringify(S.activos)).catch(()=>{});

  actualizarCentro(id,{estado:'capitalizado',capitalizadoEn:fecha});
  await guardarCentros();

  document.getElementById('cc-capitalizar').style.display='none';
  toast('📦 Capitalizado: asiento N°'+folio+' por '+fmtC(total));
  logAccion('Capitalizó centro de costo',`${c.nombre} · ${fmtC(total)} → ${cuentaActivo}`);
  renderCentrosCosto();rerender();
}
