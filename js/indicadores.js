// indicadores.js — UF, UTM, tasas previsionales configurables
import {toast, fmtC} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import './storage.js';

// ═══ INDICADORES CONFIGURABLES ═══
// Fuente única de valores económicos/previsionales. Se guardan en S.empresa.indicadores.
// Defaults: valores oficiales de referencia 2026 (Superintendencia de Pensiones / SII).
const INDICADORES_DEFAULT={
  uf:69751,             // valor UF
  utm:71506,            // valor UTM
  uta:858072,           // valor UTA (12 × UTM aprox)
  topeAFP_UF:90.0,      // tope imponible AFP/salud
  topeCesantia_UF:135.2,// tope imponible seguro cesantía
  ingresoMinimo:539000, // ingreso mínimo mensual
  tasaAFP:10.0,         // % cotización AFP (sin comisión)
  tasaSalud:7.0,        // % salud mínimo
  tasaCesantiaTrab:0.6, // % cesantía trabajador (indefinido)
  factorCM:3.4,         // % factor corrección monetaria anual (referencial)
};
// Devuelve los indicadores vigentes (mezcla defaults con lo guardado)
function getIndicadores(){
  const g=(S.empresa&&S.empresa.indicadores)||{};
  return {...INDICADORES_DEFAULT,...g};
}
// Helpers de acceso rápido
function IND(k){return getIndicadores()[k];}
function renderIndicadores(){
  const i=getIndicadores();
  const el=document.getElementById('ind-content');
  const campo=(id,lbl,val,step,sufijo,hint)=>`<div class="grp">
    <label>${lbl}${sufijo?' <span style="color:var(--mt)">('+sufijo+')</span>':''}</label>
    <input type="number" id="ind-${id}" value="${val}" step="${step||'1'}">
    ${hint?`<div style="font-size:10px;color:var(--mt);margin-top:2px">${hint}</div>`:''}
  </div>`;
  el.innerHTML=`<div class="card" style="margin-bottom:14px">
    <div class="card-title">💱 Valores monetarios del período</div>
    <div class="fg">
      ${campo('uf','Valor UF',i.uf,'0.01','pesos','Unidad de Fomento del día')}
      ${campo('utm','Valor UTM',i.utm,'1','pesos','Unidad Tributaria Mensual')}
      ${campo('uta','Valor UTA',i.uta,'1','pesos','Unidad Tributaria Anual (≈12×UTM)')}
    </div>
    <div style="font-size:11px;color:var(--mt);margin-top:4px">Actualiza estos valores mensualmente desde sii.cl o previred.com. Los usan Remuneraciones, Honorarios y Corrección Monetaria.</div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🏦 Topes imponibles y mínimos</div>
    <div class="fg">
      ${campo('topeAFP_UF','Tope imponible AFP / Salud',i.topeAFP_UF,'0.1','UF','Tope 2026: 90 UF')}
      ${campo('topeCesantia_UF','Tope imponible Cesantía',i.topeCesantia_UF,'0.1','UF','Tope 2026: 135,2 UF')}
      ${campo('ingresoMinimo','Ingreso mínimo mensual',i.ingresoMinimo,'1000','pesos','2026: $539.000')}
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">📊 Tasas previsionales y tributarias</div>
    <div class="fg">
      ${campo('tasaAFP','Cotización AFP',i.tasaAFP,'0.1','%','Obligatoria: 10% (sin comisión AFP)')}
      ${campo('tasaSalud','Cotización Salud',i.tasaSalud,'0.1','%','Mínimo legal: 7%')}
      ${campo('tasaCesantiaTrab','Cesantía trabajador',i.tasaCesantiaTrab,'0.1','%','Contrato indefinido: 0,6%')}
      ${campo('factorCM','Factor Corrección Monetaria',i.factorCM,'0.1','% anual','Referencial 2025: 3,4% (14D3 exento)')}
    </div>
    <div style="font-size:11px;color:var(--mt);margin-top:4px">Las comisiones de cada AFP se configuran por trabajador en Remuneraciones.</div>
  </div>
  <div class="save-row"><button class="btn btn-p" onclick="guardarIndicadores()">💾 Guardar Indicadores</button></div>`;
}
function guardarIndicadores(){
  const num=id=>+document.getElementById('ind-'+id).value||0;
  const ind={
    uf:num('uf'),utm:num('utm'),uta:num('uta'),
    topeAFP_UF:num('topeAFP_UF'),topeCesantia_UF:num('topeCesantia_UF'),
    ingresoMinimo:num('ingresoMinimo'),
    tasaAFP:num('tasaAFP'),tasaSalud:num('tasaSalud'),tasaCesantiaTrab:num('tasaCesantiaTrab'),
    factorCM:num('factorCM'),
  };
  // Validaciones básicas
  if(ind.uf<=0||ind.utm<=0){toast('⚠️ UF y UTM deben ser mayores a 0','e');return;}
  S.empresa.indicadores=ind;
  // Limpiar valores legacy que quedaban sueltos
  delete S.empresa.remUF;delete S.empresa.remUTM;delete S.empresa.factorCM;
  window.storage.set('empresa',JSON.stringify(S.empresa)).catch(()=>toast('❌ Error al guardar','e'));
  // Refrescar los inputs de UF/UTM del mes en Remuneraciones si están cargados
  const ufEl=document.getElementById('rem-uf'),utmEl=document.getElementById('rem-utm');
  if(ufEl)ufEl.value=ind.uf;if(utmEl)utmEl.value=ind.utm;
  toast('✅ Indicadores guardados');
  logAccion('Actualizó indicadores',`UF ${fmtC(ind.uf)} · UTM ${fmtC(ind.utm)}`);
}
function restaurarIndicadoresDefault(){
  if(!confirm('¿Restaurar los valores oficiales de referencia 2026? Se sobrescribirán los actuales.'))return;
  S.empresa.indicadores={...INDICADORES_DEFAULT};
  window.storage.set('empresa',JSON.stringify(S.empresa)).catch(()=>{});
  renderIndicadores();toast('↺ Valores 2026 restaurados');
}


export {INDICADORES_DEFAULT, getIndicadores, IND, renderIndicadores, guardarIndicadores, restaurarIndicadoresDefault};
