// indicadores.js — UF, UTM, tasas previsionales configurables
import {toast, fmtC} from './core.js';
import {S} from './state.js';
import {logAccion} from './firebase.js';
import './storage.js';

// ═══ INDICADORES CONFIGURABLES ═══
// Fuente única de valores económicos/previsionales. Se guardan en S.empresa.indicadores.
// Defaults: valores oficiales de referencia 2026 (Superintendencia de Pensiones / SII).
// Valores de referencia — Banco Central de Chile / SII (julio-agosto 2026).
// La UF cambia a diario, la UTM cada mes: actualízalos en la sección Indicadores.
const INDICADORES_DEFAULT={
  uf:40844.79,          // UF (BCCh, 21-jul-2026)
  utm:71649,            // UTM (SII, jul/ago 2026)
  uta:859788,           // UTA = 12 × UTM
  dolar:933.0,          // Dólar observado (BCCh)
  euro:1065.07,         // Euro (BCCh)
  topeAFP_UF:90.0,      // tope imponible AFP/salud
  topeCesantia_UF:135.2,// tope imponible seguro cesantía
  ingresoMinimo:539000, // ingreso mínimo mensual
  gratifPct:25.0,       // % de gratificación legal (Art. 50 Código del Trabajo)
  gratifTopeIMM:4.75,   // tope: 4,75 ingresos mínimos mensuales AL AÑO (Art. 50)
  tasaAFP:10.0,         // % cotización AFP (sin comisión)
  tasaSalud:7.0,        // % salud mínimo
  tasaCesantiaTrab:0.6, // % cesantía trabajador (indefinido)
  factorCM:3.4,         // % factor corrección monetaria anual (referencial)
  retHonorarios:15.25,  // % retención honorarios (2026; se ajusta por año)
  retHonorariosManual:false, // true = usar el valor fijo de arriba en vez de la tabla por año
};
// Devuelve los indicadores vigentes (mezcla defaults con lo guardado)
function getIndicadores(){
  const g=(S.empresa&&S.empresa.indicadores)||{};
  return {...INDICADORES_DEFAULT,...g};
}

// ═══ IMPUESTO ÚNICO DE SEGUNDA CATEGORÍA (Art. 43 N°1 LIR) ═══
// La tabla se expresa en UTM, así que los tramos en pesos se recalculan solos
// cada mes al actualizar la UTM: lo único que cambia por ley son los factores
// y las cantidades a rebajar.
// El último tramo (sobre 310 UTM, 40%) lo incorporó la Ley 21.210 de 2020.
// Verificada contra la tabla publicada por el SII.
export const IUSC_TABLA_OFICIAL=[
  {desde:0,    hasta:13.5, factor:0,     rebajaUTM:0},
  {desde:13.5, hasta:30,   factor:0.04,  rebajaUTM:0.54},
  {desde:30,   hasta:50,   factor:0.08,  rebajaUTM:1.74},
  {desde:50,   hasta:70,   factor:0.135, rebajaUTM:4.49},
  {desde:70,   hasta:90,   factor:0.23,  rebajaUTM:11.14},
  {desde:90,   hasta:120,  factor:0.304, rebajaUTM:17.80},
  {desde:120,  hasta:310,  factor:0.35,  rebajaUTM:23.32},
  {desde:310,  hasta:1e9,  factor:0.40,  rebajaUTM:38.82},
];
// Tabla vigente: la editada por el usuario si existe, si no la oficial
export function getIUSCTabla(){
  const g=S.empresa&&S.empresa.indicadores&&S.empresa.indicadores.iuscTabla;
  if(Array.isArray(g)&&g.length)return g.map(t=>({...t}));
  return IUSC_TABLA_OFICIAL.map(t=>({...t}));
}
// ¿La tabla guardada difiere de la oficial?
export function iuscTablaModificada(){
  const t=getIUSCTabla(),o=IUSC_TABLA_OFICIAL;
  if(t.length!==o.length)return true;
  return t.some((x,i)=>x.desde!==o[i].desde||x.hasta!==o[i].hasta||x.factor!==o[i].factor||x.rebajaUTM!==o[i].rebajaUTM);
}
// Impuesto único de un mes. Devuelve el detalle para poder mostrarlo en la liquidación.
export function calcularIUSCDetalle(baseTributable,utm,tabla){
  const tb=Array.isArray(tabla)&&tabla.length?tabla:getIUSCTabla();
  const base=+baseTributable||0;
  if(!utm||utm<=0||base<=0)return {impuesto:0,tramo:null,idx:-1,baseUTM:0,factor:0,rebaja:0};
  const baseUTM=base/utm;
  let idx=tb.findIndex(x=>baseUTM>x.desde&&baseUTM<=x.hasta);
  if(idx<0)idx=baseUTM<=(tb[0]?.hasta??0)?0:tb.length-1;
  const t=tb[idx];
  const rebaja=(+t.rebajaUTM||0)*utm;
  const impuesto=Math.max(0,Math.round(base*(+t.factor||0)-rebaja));
  return {impuesto,tramo:t,idx,baseUTM,factor:+t.factor||0,rebaja};
}

// ═══ GRATIFICACIÓN LEGAL (Art. 50 Código del Trabajo) ═══
// El empleador puede optar por pagar el 25% de las remuneraciones mensuales
// devengadas, con un tope de 4,75 ingresos mínimos mensuales AL AÑO. Como las
// liquidaciones son mensuales, el tope se prorratea: 4,75 × IMM ÷ 12.
// Ambos parámetros son configurables en Indicadores por si cambia la norma o
// la empresa pacta un porcentaje mayor.
export function topeGratificacionMensual(){
  const i=getIndicadores();
  return Math.round(((+i.gratifTopeIMM||0)*(+i.ingresoMinimo||0))/12);
}
export function topeGratificacionAnual(){
  const i=getIndicadores();
  return Math.round((+i.gratifTopeIMM||0)*(+i.ingresoMinimo||0));
}
// Calcula la gratificación mensual de una base imponible.
// `pct` opcional: si no viene, usa el porcentaje configurado.
export function calcularGratificacion(baseImponible,pct){
  const i=getIndicadores();
  const p=(pct===''||pct==null||isNaN(+pct))?(+i.gratifPct||0):+pct;
  const bruta=Math.round(Math.max(0,+baseImponible||0)*p/100);
  const tope=topeGratificacionMensual();
  const monto=tope>0?Math.min(bruta,tope):bruta;
  return {pct:p,bruta,tope,monto,topeAplicado:tope>0&&bruta>tope};
}

// Tasa de retención de honorarios (2ª categoría, Art. 74 N°2 LIR).
// Sube gradualmente por Ley 21.133 hasta 17% en 2028. La tasa aplicable es
// la del AÑO EN QUE SE EMITE la boleta.
export const RETENCION_POR_ANIO={
  2020:10.75, 2021:11.5, 2022:12.25, 2023:13.0, 2024:13.75,
  2025:14.5,  2026:15.25, 2027:16.0, 2028:17.0,
};
// Tasa para un año dado: usa la configurada por el usuario si existe,
// si no la tabla oficial, y si el año es posterior a la tabla, el último valor (17%).
export function retencionHonorarios(anio){
  const ind=getIndicadores();
  const y=+anio||new Date().getFullYear();
  // Si el usuario fijó una tasa manual para este año, respetarla
  if(ind.retHonorariosManual&&ind.retHonorarios>0)return ind.retHonorarios/100;
  if(RETENCION_POR_ANIO[y]!=null)return RETENCION_POR_ANIO[y]/100;
  const años=Object.keys(RETENCION_POR_ANIO).map(Number);
  if(y>Math.max(...años))return RETENCION_POR_ANIO[Math.max(...años)]/100;
  return RETENCION_POR_ANIO[Math.min(...años)]/100;
}


// ── Actualización automática desde mindicador.cl (datos del Banco Central) ──
// API pública y gratuita, sin API key. Si falla (sin internet o CORS),
// se avisa y los valores se pueden seguir editando a mano.
export async function actualizarDesdeBancoCentral(){
  const btn=document.getElementById('btn-bcch');
  if(btn){btn.disabled=true;btn.textContent='⏳ Consultando…';}
  try{
    const r=await fetch('https://mindicador.cl/api');
    if(!r.ok)throw new Error('HTTP '+r.status);
    const d=await r.json();
    const set=(id,v)=>{const e=document.getElementById('ind-'+id);if(e&&v!=null)e.value=v;};
    if(d.uf&&d.uf.valor)set('uf',d.uf.valor);
    if(d.utm&&d.utm.valor){
      set('utm',d.utm.valor);
      set('uta',Math.round(d.utm.valor*12)); // UTA = 12 UTM
    }
    if(d.dolar&&d.dolar.valor)set('dolar',d.dolar.valor);
    if(d.euro&&d.euro.valor)set('euro',d.euro.valor);
    const fecha=d.uf&&d.uf.fecha?new Date(d.uf.fecha).toLocaleDateString('es-CL'):'';
    toast('✅ Valores actualizados desde el Banco Central'+(fecha?' ('+fecha+')':''));
    const info=document.getElementById('bcch-info');
    if(info)info.textContent='Última consulta: '+new Date().toLocaleString('es-CL')+'. Recuerda guardar.';
  }catch(e){
    toast('⚠️ No se pudo consultar el servicio. Ingresa los valores a mano.','e');
    const info=document.getElementById('bcch-info');
    if(info)info.innerHTML='No se pudo conectar ('+e.message+'). El servicio puede estar caído; '+
      'consulta <a href="https://www.bcentral.cl/" target="_blank" rel="noopener" style="color:var(--ac)">bcentral.cl</a> e ingresa los valores manualmente.';
  }finally{
    if(btn){btn.disabled=false;btn.textContent='🔄 Traer valores del Banco Central';}
  }
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
      ${campo('uta','Valor UTA',i.uta,'1','pesos','Unidad Tributaria Anual (12×UTM)')}
      ${campo('dolar','Dólar observado',i.dolar,'0.01','pesos','Publicado por el Banco Central')}
      ${campo('euro','Euro',i.euro,'0.01','pesos','Publicado por el Banco Central')}
    </div>
    <div class="info-tip" style="font-size:11px;margin-top:8px">
      📊 <strong>Fuente oficial:</strong> Banco Central de Chile (UF, dólar, euro) y SII (UTM/UTA).
      La <strong>UF cambia todos los días</strong> y la <strong>UTM cada mes</strong>, así que conviene actualizarlas antes de calcular liquidaciones o cerrar el mes.
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
        <a href="https://www.bcentral.cl/" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:none;font-size:11px">↗ bcentral.cl</a>
        <a href="https://www.sii.cl/valores_y_fechas/" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:none;font-size:11px">↗ sii.cl valores y fechas</a>
        <a href="https://mindicador.cl/" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:none;font-size:11px">↗ mindicador.cl</a>
      </div>
      <div style="margin-top:6px;color:var(--mt);font-size:10px">Valores precargados: julio-agosto 2026. Verifica antes de usarlos en cálculos definitivos.</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-p" id="btn-bcch" onclick="actualizarDesdeBancoCentral()">🔄 Traer valores del Banco Central</button>
      <span style="font-size:10px;color:var(--mt)" id="bcch-info">Consulta mindicador.cl y rellena UF, UTM, UTA, dólar y euro. Luego pulsa Guardar.</span>
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🏦 Topes imponibles y mínimos</div>
    <div class="fg">
      ${campo('topeAFP_UF','Tope imponible AFP / Salud',i.topeAFP_UF,'0.1','UF','Tope 2026: 90 UF')}
      ${campo('topeCesantia_UF','Tope imponible Cesantía',i.topeCesantia_UF,'0.1','UF','Tope 2026: 135,2 UF')}
      ${campo('ingresoMinimo','Ingreso mínimo mensual',i.ingresoMinimo,'1000','pesos','2026: $539.000')}
    </div>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)">
      <div class="card-title" style="margin-bottom:10px">Gratificación legal (Art. 50 Código del Trabajo)</div>
      <div class="info-tip" style="font-size:11px;margin-bottom:10px">
        El empleador puede optar por pagar el <strong>25% de las remuneraciones mensuales devengadas</strong>,
        con un tope de <strong>4,75 ingresos mínimos mensuales al año</strong>. Como las liquidaciones son mensuales,
        el sistema prorratea el tope: <strong>4,75 × IMM ÷ 12</strong>.
        <div style="margin-top:6px;font-family:var(--mono);font-size:11px">
          Tope anual: <strong>${fmtC(topeGratificacionAnual())}</strong> ·
          Tope mensual: <strong style="color:var(--ac)">${fmtC(topeGratificacionMensual())}</strong>
        </div>
      </div>
      <div class="fg">
        ${campo('gratifPct','Porcentaje de gratificación',i.gratifPct,'0.5','%','Legal: 25% de la remuneración imponible')}
        ${campo('gratifTopeIMM','Tope en ingresos mínimos (anual)',i.gratifTopeIMM,'0.05','IMM','Legal: 4,75 IMM al año')}
      </div>
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
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)">
      <div class="card-title" style="margin-bottom:10px">Retención de honorarios (2ª categoría)</div>
      <div class="info-tip" style="font-size:11px;margin-bottom:10px">
        Por Ley 21.133 la tasa sube cada año hasta 17% en 2028. Se aplica la tasa del <strong>año en que se emite la boleta</strong>, así que el sistema la ajusta automáticamente según el año contable.
        <div style="margin-top:6px;font-family:var(--mono);font-size:10px">
          ${Object.entries(RETENCION_POR_ANIO).map(([y,t])=>`<span style="display:inline-block;margin-right:10px${+y===S.empresa.anio?';color:var(--ac);font-weight:700':''}">${y}: ${t}%</span>`).join('')}
        </div>
      </div>
      <div class="fg">
        <div class="grp">
          <label>Tasa aplicada en ${S.empresa.anio}</label>
          <input type="number" id="ind-retHonorarios" step="0.05" value="${(retencionHonorarios(S.empresa.anio)*100).toFixed(2)}">
          <div style="font-size:10px;color:var(--mt);margin-top:2px">Oficial ${S.empresa.anio}: ${RETENCION_POR_ANIO[S.empresa.anio]!=null?RETENCION_POR_ANIO[S.empresa.anio]+'%':'—'}</div>
        </div>
        <div class="grp">
          <label>Modo</label>
          <select id="ind-retHonorariosManual">
            <option value="false" ${!i.retHonorariosManual?'selected':''}>Automático por año (recomendado)</option>
            <option value="true" ${i.retHonorariosManual?'selected':''}>Manual (usar la tasa de arriba)</option>
          </select>
        </div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--mt);margin-top:4px">Las comisiones de cada AFP se configuran por trabajador en Remuneraciones.</div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="card-title">🧮 Impuesto Único de Segunda Categoría (Art. 43 N°1 LIR)</div>
    <div id="iusc-tabla-box"></div>
  </div>
  <div class="save-row"><button class="btn btn-p" onclick="guardarIndicadores()">💾 Guardar Indicadores</button></div>`;
  IUSC_WORK=getIUSCTabla();
  renderIUSCTabla();
  // La configuración previsional vive en la misma sección: dibujarla también.
  if(window.renderPrevisional)window.renderPrevisional();
}
// ── Editor de la tabla IUSC ──
// Copia de trabajo: se edita en memoria y sólo se persiste al pulsar Guardar,
// igual que el resto de los campos de esta sección.
let IUSC_WORK=null;
let IUSC_PRUEBA=0;

function setIUSC(i,campo,valor){
  if(!IUSC_WORK||!IUSC_WORK[i])return;
  let v=+valor||0;
  if(campo==='factor')v=v/100;              // se edita en %, se guarda en fracción
  if(campo==='hasta'&&(valor===''||v<=0))v=1e9;
  IUSC_WORK[i][campo]=v;
  renderIUSCTabla();
}
function addIUSCTramo(){
  if(!IUSC_WORK)IUSC_WORK=getIUSCTabla();
  const ult=IUSC_WORK[IUSC_WORK.length-1];
  const desde=ult?(ult.hasta>=1e9?ult.desde:ult.hasta):0;
  IUSC_WORK.push({desde,hasta:1e9,factor:ult?ult.factor:0,rebajaUTM:ult?ult.rebajaUTM:0});
  renderIUSCTabla();
}
function delIUSCTramo(i){
  if(!IUSC_WORK||IUSC_WORK.length<=1)return;
  IUSC_WORK.splice(i,1);
  renderIUSCTabla();
}
function restaurarIUSCTabla(){
  IUSC_WORK=IUSC_TABLA_OFICIAL.map(t=>({...t}));
  renderIUSCTabla();
  toast('↺ Tabla oficial restaurada — recuerda Guardar');
}
function setIUSCPrueba(v){IUSC_PRUEBA=+v||0;renderIUSCTabla();}

function renderIUSCTabla(){
  const box=document.getElementById('iusc-tabla-box');if(!box)return;
  if(!IUSC_WORK)IUSC_WORK=getIUSCTabla();
  const utm=+document.getElementById('ind-utm')?.value||getIndicadores().utm||0;
  const inf=t=>t.hasta>=1e9;
  // Los tramos deben ser contiguos y crecientes: si no, el impuesto salta o se solapa
  const avisos=[];
  IUSC_WORK.forEach((t,i)=>{
    if(i>0&&Math.abs(IUSC_WORK[i-1].hasta-t.desde)>0.0001)
      avisos.push(`El tramo ${i+1} parte en ${t.desde} UTM pero el anterior termina en ${IUSC_WORK[i-1].hasta} UTM`);
    if(!inf(t)&&t.hasta<=t.desde)avisos.push(`El tramo ${i+1} tiene "hasta" menor o igual que "desde"`);
  });

  const filas=IUSC_WORK.map((t,i)=>`<tr>
    <td class="tl" style="font-family:var(--mono);font-size:11px;color:var(--mt);width:30px">${i+1}</td>
    <td style="width:110px"><input type="number" step="0.01" value="${t.desde}" onchange="setIUSC(${i},'desde',this.value)" style="text-align:right;font-family:var(--mono)"></td>
    <td style="width:110px">${inf(t)
      ? `<span style="font-family:var(--mono);color:var(--mt)">y más</span>`
      : `<input type="number" step="0.01" value="${t.hasta}" onchange="setIUSC(${i},'hasta',this.value)" style="text-align:right;font-family:var(--mono)">`}</td>
    <td style="width:100px"><input type="number" step="0.001" value="${+(t.factor*100).toFixed(3)}" onchange="setIUSC(${i},'factor',this.value)" style="text-align:right;font-family:var(--mono)"></td>
    <td style="width:110px"><input type="number" step="0.01" value="${t.rebajaUTM}" onchange="setIUSC(${i},'rebajaUTM',this.value)" style="text-align:right;font-family:var(--mono)"></td>
    <td style="font-family:var(--mono);font-size:11px;color:var(--mt);text-align:right">
      ${fmtC(Math.round(t.desde*utm))} ${inf(t)?'y más':'– '+fmtC(Math.round(t.hasta*utm))}
      <div style="font-size:10px">rebaja ${fmtC(Math.round(t.rebajaUTM*utm))}</div>
    </td>
    <td style="width:34px;text-align:center">${IUSC_WORK.length>1?`<button class="btn btn-d" style="padding:2px 7px;font-size:10px" onclick="delIUSCTramo(${i})">✕</button>`:''}</td>
  </tr>`).join('');

  // Calculadora de prueba: valida la tabla con una base concreta
  const d=IUSC_PRUEBA>0?calcularIUSCDetalle(IUSC_PRUEBA,utm,IUSC_WORK):null;

  box.innerHTML=`
    <div class="info-tip" style="font-size:11px;margin-bottom:12px;line-height:1.6">
      🧮 El impuesto único se calcula sobre la <strong>renta imponible menos las cotizaciones previsionales</strong>:
      se ubica el tramo según cuántas UTM representa esa base, se multiplica por el <strong>factor</strong> y se resta la
      <strong>cantidad a rebajar</strong> (también en UTM). Por eso la tabla se expresa en UTM y los tramos en pesos se
      actualizan solos cada mes: lo único que cambia por ley son los factores y las rebajas.
      <div style="margin-top:6px;color:var(--mt);font-size:10px">
        Tramos en pesos calculados con UTM = ${fmtC(utm)}. El último tramo (sobre 310 UTM, 40%) lo incorporó la Ley 21.210 de 2020.
        ${iuscTablaModificada()?'<br><strong style="color:var(--warn)">⚠️ La tabla guardada difiere de la oficial.</strong>':''}
      </div>
    </div>
    ${avisos.length?`<div style="background:rgba(210,153,34,.10);border:1px solid rgba(210,153,34,.35);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px">
      ⚠️ ${avisos.map(a=>`<div>${a}</div>`).join('')}
    </div>`:''}
    <div class="card-np" style="margin-bottom:10px"><div class="tw"><table>
      <thead><tr>
        <th class="tl">#</th><th style="text-align:right">DESDE (UTM)</th><th style="text-align:right">HASTA (UTM)</th>
        <th style="text-align:right">FACTOR (%)</th><th style="text-align:right">REBAJA (UTM)</th>
        <th style="text-align:right">EQUIVALENTE EN PESOS</th><th></th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
      <button class="btn btn-s" style="font-size:11px" onclick="addIUSCTramo()">+ Agregar tramo</button>
      <button class="btn btn-g" style="font-size:11px" onclick="restaurarIUSCTabla()">↺ Restaurar tabla oficial</button>
      <span style="font-size:10px;color:var(--mt)">Los cambios se aplican al pulsar «Guardar Indicadores»</span>
    </div>
    <div style="border-top:1px solid var(--bd);padding-top:12px">
      <div style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Probar el cálculo</div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div class="grp" style="max-width:220px">
          <label>Base tributable (pesos)</label>
          <input type="number" step="10000" value="${IUSC_PRUEBA||''}" placeholder="Ej: 1.500.000" onchange="setIUSCPrueba(this.value)">
        </div>
        ${d?`<div style="font-size:12px;line-height:1.7">
          Base: <strong style="font-family:var(--mono)">${fmtC(IUSC_PRUEBA)}</strong> = <strong>${d.baseUTM.toFixed(2)} UTM</strong> → tramo <strong>${d.idx+1}</strong>
          (factor ${(d.factor*100).toFixed(3)}%, rebaja ${fmtC(Math.round(d.rebaja))})<br>
          ${fmtC(IUSC_PRUEBA)} × ${(d.factor*100).toFixed(3)}% − ${fmtC(Math.round(d.rebaja))} =
          <strong style="color:${d.impuesto>0?'var(--err)':'var(--ach)'};font-family:var(--mono)">${fmtC(d.impuesto)}</strong>
          ${d.impuesto===0?' <span style="color:var(--ach)">(tramo exento)</span>':''}
        </div>`:'<div style="font-size:11px;color:var(--mt)">Ingresa una base para ver en qué tramo cae y cómo se calcula.</div>'}
      </div>
    </div>`;
}

function guardarIndicadores(){
  const num=id=>+document.getElementById('ind-'+id).value||0;
  const ind={
    uf:num('uf'),utm:num('utm'),uta:num('uta'),dolar:num('dolar'),euro:num('euro'),
    topeAFP_UF:num('topeAFP_UF'),topeCesantia_UF:num('topeCesantia_UF'),
    ingresoMinimo:num('ingresoMinimo'),
    gratifPct:num('gratifPct'),gratifTopeIMM:num('gratifTopeIMM'),
    tasaAFP:num('tasaAFP'),tasaSalud:num('tasaSalud'),tasaCesantiaTrab:num('tasaCesantiaTrab'),
    factorCM:num('factorCM'),
    retHonorarios:num('retHonorarios'),
    retHonorariosManual:document.getElementById('ind-retHonorariosManual').value==='true',
    // Tabla del impuesto único: sólo se persiste si difiere de la oficial,
    // así una instalación limpia sigue tomando la tabla vigente por defecto.
    iuscTabla:(()=>{
      const t=(IUSC_WORK||getIUSCTabla()).map(x=>({desde:+x.desde||0,hasta:+x.hasta||1e9,factor:+x.factor||0,rebajaUTM:+x.rebajaUTM||0}));
      const o=IUSC_TABLA_OFICIAL;
      const igual=t.length===o.length&&t.every((x,i)=>x.desde===o[i].desde&&x.hasta===o[i].hasta&&x.factor===o[i].factor&&x.rebajaUTM===o[i].rebajaUTM);
      return igual?undefined:t;
    })(),
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


export {INDICADORES_DEFAULT, getIndicadores, IND, renderIndicadores, guardarIndicadores, restaurarIndicadoresDefault,
        renderIUSCTabla, setIUSC, addIUSCTramo, delIUSCTramo, restaurarIUSCTabla, setIUSCPrueba};
