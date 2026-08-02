// previsional-ui.js — Configuración editable de instituciones previsionales.
// Vive dentro de la sección Indicadores.

import {toast, fmtC} from './core.js';
import {S} from './state.js';
import {getPrevisional, AFP_DEFAULT, ISAPRES_DEFAULT, MUTUALES_DEFAULT,
        CAJAS_DEFAULT, PATRONAL_DEFAULT} from './previsional.js';
import {logAccion} from './firebase.js';

export function renderPrevisional(){
  const el=document.getElementById('previsional-content');
  if(!el)return;
  const P=getPrevisional();
  const p=P.patronal;

  const filasAFP=P.afps.map((a,i)=>`<tr>
    <td class="tl" style="font-size:12px">${a.nm}</td>
    <td style="text-align:right"><input type="number" step="0.01" id="afp-com-${i}" value="${a.comision}" style="width:80px;text-align:right"> %</td>
  </tr>`).join('');

  el.innerHTML=`
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🏦 Comisiones AFP</div>
    <div class="info-tip" style="font-size:11px;margin-bottom:10px">
      Comisión que cobra cada AFP sobre la renta imponible, <strong>adicional al 10% obligatorio</strong>.
      Las publica la Superintendencia de Pensiones y cambian ocasionalmente.
      <a href="https://www.spensiones.cl/" target="_blank" rel="noopener" style="color:var(--ac);margin-left:6px">↗ spensiones.cl</a>
    </div>
    <div class="tw"><table>
      <thead><tr><th class="tl">ADMINISTRADORA</th><th style="text-align:right">COMISIÓN</th></tr></thead>
      <tbody>${filasAFP}</tbody>
    </table></div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-title">👔 Aporte del empleador</div>
    <div class="info-tip" style="font-size:11px;margin-bottom:12px">
      Cargas que paga la <strong>empresa</strong> por cada trabajador, además del sueldo bruto. No se descuentan de la liquidación.
    </div>
    <div class="fg">
      <div class="grp">
        <label>SIS — Invalidez y sobrevivencia (%)</label>
        <input type="number" id="pat-sis" step="0.01" value="${p.sis}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Se paga a la AFP del trabajador. Vigente desde abril 2026: 1,62%</div>
      </div>
      <div class="grp">
        <label>Mutual — cotización básica (%)</label>
        <input type="number" id="pat-mutual-base" step="0.01" value="${p.mutualBase}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Ley 16.744, base general: 0,90%</div>
      </div>
      <div class="grp">
        <label>Mutual — adicional por riesgo (%)</label>
        <input type="number" id="pat-mutual-adic" step="0.01" value="${p.mutualAdicional}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Según el riesgo de tu actividad (0% a 3,4%). Lo notifica tu mutual.</div>
      </div>
      <div class="grp">
        <label>Mutual — institución</label>
        <select id="pat-mutual-inst">
          ${P.mutuales.map(m=>`<option value="${m.k}" ${m.k===p.mutualInstitucion?'selected':''}>${m.nm}</option>`).join('')}
        </select>
      </div>
      <div class="grp">
        <label>AFC — contrato indefinido (%)</label>
        <input type="number" id="pat-afc-ind" step="0.01" value="${p.afcIndefinido}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Seguro de cesantía, aporte empleador: 2,4%</div>
      </div>
      <div class="grp">
        <label>AFC — plazo fijo (%)</label>
        <input type="number" id="pat-afc-plazo" step="0.01" value="${p.afcPlazoFijo}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">En plazo fijo el trabajador no aporta: empleador 3%</div>
      </div>
      <div class="grp">
        <label>Caja de compensación (%)</label>
        <input type="number" id="pat-caja" step="0.01" value="${p.cajaCompensacion}">
        <div style="font-size:10px;color:var(--mt);margin-top:2px">Solo si la empresa está afiliada (habitual 0,6%)</div>
      </div>
      <div class="grp">
        <label>Caja — institución</label>
        <select id="pat-caja-inst">
          ${P.cajas.map(cj=>`<option value="${cj.k}" ${cj.k===p.cajaInstitucion?'selected':''}>${cj.nm}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="info-tip" style="font-size:11px;margin-top:10px">
      💡 Costo empresa aproximado por trabajador: <strong>${(p.sis+p.mutualBase+p.mutualAdicional+p.afcIndefinido+p.cajaCompensacion).toFixed(2)}%</strong> sobre la renta imponible (contrato indefinido).
    </div>
  </div>

  <div class="save-row" style="display:flex;gap:8px">
    <button class="btn btn-p" onclick="guardarPrevisional()">💾 Guardar configuración previsional</button>
    <button class="btn btn-g" onclick="restaurarPrevisional()">↺ Valores oficiales 2026</button>
  </div>`;
}

export function guardarPrevisional(){
  const num=id=>{const e=document.getElementById(id);return e?(+e.value||0):0;};
  const P=getPrevisional();
  const afps=P.afps.map((a,i)=>({...a,comision:num('afp-com-'+i)}));
  const patronal={
    sis:num('pat-sis'),
    mutualBase:num('pat-mutual-base'),
    mutualAdicional:num('pat-mutual-adic'),
    afcIndefinido:num('pat-afc-ind'),
    afcPlazoFijo:num('pat-afc-plazo'),
    cajaCompensacion:num('pat-caja'),
    mutualInstitucion:document.getElementById('pat-mutual-inst').value,
    cajaInstitucion:document.getElementById('pat-caja-inst').value,
  };
  S.empresa.previsional={afps,isapres:P.isapres,mutuales:P.mutuales,cajas:P.cajas,patronal};
  window.storage.set('empresa',JSON.stringify(S.empresa)).catch(()=>toast('❌ Error al guardar','e'));
  toast('✅ Configuración previsional guardada');
  logAccion('Actualizó tasas previsionales',`SIS ${patronal.sis}% · Mutual ${(patronal.mutualBase+patronal.mutualAdicional).toFixed(2)}%`);
  renderPrevisional();
}

export function restaurarPrevisional(){
  if(!confirm('¿Restaurar las tasas oficiales de referencia 2026?\n\nSe sobrescriben las comisiones AFP y el aporte patronal que hayas configurado.'))return;
  S.empresa.previsional={
    afps:AFP_DEFAULT,isapres:ISAPRES_DEFAULT,mutuales:MUTUALES_DEFAULT,
    cajas:CAJAS_DEFAULT,patronal:{...PATRONAL_DEFAULT}
  };
  window.storage.set('empresa',JSON.stringify(S.empresa)).catch(()=>{});
  renderPrevisional();
  toast('↺ Tasas oficiales 2026 restauradas');
}
