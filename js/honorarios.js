// honorarios.js — Libro de honorarios (retención 10,75%)
import {toast, pn, RET_H, fmtC, MESES} from './core.js';
import {S} from './state.js';
import './storage.js';

// ═══ HONORARIOS ═══
function renderHon(){
  const tbody=document.getElementById('h-tbody');
  if(!S.honorarios.length){tbody.innerHTML=`<tr><td colspan="7" class="empty"><div class="ei">📝</div>No hay honorarios.</td></tr>`;document.getElementById('h-tfoot').innerHTML='';return;}
  let tB=0,h='';
  S.honorarios.forEach((hn,i)=>{
    const ret=Math.round((hn.bruto||0)*RET_H),net=(hn.bruto||0)-ret;tB+=hn.bruto||0;
    h+=`<tr><td><select onchange="S.honorarios[${i}].mes=+this.value">${MESES.map((m,mi)=>`<option value="${mi+1}"${hn.mes===mi+1?' selected':''}>${m}</option>`).join('')}</select></td><td><input type="text" value="${hn.nombre||''}" oninput="S.honorarios[${i}].nombre=this.value" style="min-width:140px"></td><td><input type="text" value="${hn.rut||''}" oninput="S.honorarios[${i}].rut=this.value" style="min-width:100px"></td><td><input type="number" min="0" value="${hn.bruto||''}" placeholder="0" oninput="uhon(${i},this.value)"></td><td class="ac" id="hr${i}">${fmt(ret)}</td><td class="ac" id="hn${i}">${fmt(net)}</td><td><button class="btn btn-d" onclick="delHon(${i})">✕</button></td></tr>`;
  });
  tbody.innerHTML=h;
  const tR=Math.round(tB*RET_H);
  document.getElementById('h-tfoot').innerHTML=`<tr><td class="tl" colspan="3">TOTAL</td><td>${fmt(tB)}</td><td>${fmt(tR)}</td><td>${fmt(tB-tR)}</td><td></td></tr>`;
}
function uhon(i,val){S.honorarios[i].bruto=pn(val);renderHon();}
function addHon(){S.honorarios.push({mes:1,nombre:'',rut:'',bruto:0});renderHon();}
function delHon(i){if(confirm('¿Eliminar?')){S.honorarios.splice(i,1);renderHon();}}
async function saveHon(){try{await window.storage.set('honorarios-'+S.empresa.anio,JSON.stringify(S.honorarios));toast('✅ Honorarios guardados');}catch(e){toast('❌ Error','e');}}


export {renderHon, uhon, addHon, delHon, saveHon};
