// xmlsii.js
import {toast, fmtC, MESES, dteV, dteC} from './core.js';
import {S} from './state.js';
import {todosDocsVentas, todosDocsCompras} from './asientos.js';
import {logAccion} from './firebase.js';

// ═══ FASE 6: EXPORTAR XML SII (IECV) ═══
// Genera el XML de Información Electrónica de Compras y Ventas según esquema LibroCV_v10 del SII.
function escXml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function rutSii(cod,dv){ // formato SII sin puntos: 12345678-9
  if(!cod)return '0-0';
  return String(cod)+'-'+String(dv||'0').toUpperCase();
}
function renderXmlSii(){
  const sel=document.getElementById('xml-mes');
  if(sel&&sel.options.length===0){
    sel.innerHTML=MESES.map((nm,i)=>`<option value="${i+1}">${nm} ${S.empresa.anio}</option>`).join('');
    const hoyMes=new Date().getMonth()+1;sel.value=(S.empresa.anio===new Date().getFullYear())?hoyMes:1;
  }
  const tipo=document.getElementById('xml-tipo').value;
  const mes=+sel.value||1;
  const el=document.getElementById('xml-content');
  // Filtrar documentos del período
  const docs=(tipo==='VENTA'?todosDocsVentas():todosDocsCompras()).filter(d=>{
    const m=+(d.fecha||'').slice(5,7);return m===mes;
  });
  if(!docs.length){
    el.innerHTML=`<div class="empty"><div class="ei">📭</div>No hay documentos de ${tipo==='VENTA'?'venta':'compra'} en ${MESES[mes-1]} ${S.empresa.anio}.</div>`;return;
  }
  // Resumen por tipo de documento
  const resumen={};
  let totalGeneral={docs:0,exe:0,neto:0,iva:0,total:0};
  docs.forEach(d=>{
    const cod=d.tipoDTE;
    if(!resumen[cod])resumen[cod]={docs:0,exe:0,neto:0,iva:0,total:0};
    const signo=(tipo==='VENTA'?(dteV(cod)?.signo):(dteC(cod)?.signo))||1;
    const neto=(d.neto||0)*signo, exento=(d.exento||d.exe||0)*signo, iva=(d.iva||0)*signo, total=(d.total||0)*signo;
    resumen[cod].docs++;resumen[cod].neto+=neto;resumen[cod].exe+=exento;resumen[cod].iva+=iva;resumen[cod].total+=total;
    totalGeneral.docs++;totalGeneral.neto+=neto;totalGeneral.exe+=exento;totalGeneral.iva+=iva;totalGeneral.total+=total;
  });
  // Tabla resumen
  const filasRes=Object.keys(resumen).map(cod=>{
    const r=resumen[cod];
    const nm=(tipo==='VENTA'?dteV(cod)?.nm:dteC(cod)?.nm)||('DTE '+cod);
    return `<tr><td class="tl" style="font-size:12px">${cod} — ${nm}</td><td style="text-align:right">${r.docs}</td><td style="font-family:var(--mono);text-align:right">${fmtC(r.neto)}</td><td style="font-family:var(--mono);text-align:right">${fmtC(r.iva)}</td><td style="font-family:var(--mono);text-align:right">${fmtC(r.total)}</td></tr>`;
  }).join('');
  el.innerHTML=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-lbl">Documentos</div><div class="kpi-val">${totalGeneral.docs}</div></div>
    <div class="kpi"><div class="kpi-lbl">Neto</div><div class="kpi-val">${fmtC(totalGeneral.neto)}</div></div>
    <div class="kpi"><div class="kpi-lbl">IVA</div><div class="kpi-val">${fmtC(totalGeneral.iva)}</div></div>
    <div class="kpi"><div class="kpi-lbl">Total</div><div class="kpi-val">${fmtC(totalGeneral.total)}</div></div>
  </div>
  <div class="card-np" style="margin-bottom:14px"><div class="tw"><table>
    <thead><tr><th class="tl">TIPO DOCUMENTO</th><th style="text-align:right">N°</th><th style="text-align:right">NETO</th><th style="text-align:right">IVA</th><th style="text-align:right">TOTAL</th></tr></thead>
    <tbody>${filasRes}</tbody>
  </table></div></div>
  <div class="info-tip" style="margin-bottom:14px">📤 El archivo XML se generará según el formato IECV del SII para <strong>${tipo==='VENTA'?'Ventas':'Compras'}</strong> de ${MESES[mes-1]} ${S.empresa.anio}. Verifica que los datos de empresa (RUT) estén completos.</div>
  <button class="btn btn-p" onclick="generarXmlSii()">📥 Descargar XML SII</button>
  <div style="margin-top:10px;font-size:10px;color:var(--mt)">Importante: este archivo cumple el formato de datos, pero para presentarlo al SII debe firmarse digitalmente con tu certificado. Puedes usarlo para revisión o cargarlo en software que agregue la firma.</div>`;
}
function generarXmlSii(){
  const tipo=document.getElementById('xml-tipo').value;
  const mes=+document.getElementById('xml-mes').value||1;
  const anio=S.empresa.anio;
  const e=S.empresa;
  if(!e.rut){toast('⚠️ Configura el RUT de la empresa primero','e');return;}
  const rutParse2=rutParse(e.rut);
  const rutEmisor=rutSii(rutParse2.codigo,rutParse2.dv);
  const periodo=`${anio}-${String(mes).padStart(2,'0')}`;
  const docs=(tipo==='VENTA'?todosDocsVentas():todosDocsCompras()).filter(d=>+(d.fecha||'').slice(5,7)===mes);
  if(!docs.length){toast('⚠️ No hay documentos en el período','e');return;}
  // Resumen por tipo
  const resumen={};
  docs.forEach(d=>{
    const cod=d.tipoDTE;
    if(!resumen[cod])resumen[cod]={docs:0,exe:0,neto:0,iva:0,total:0};
    const signo=(tipo==='VENTA'?(dteV(cod)?.signo):(dteC(cod)?.signo))||1;
    resumen[cod].docs++;
    resumen[cod].neto+=(d.neto||0)*signo;resumen[cod].exe+=(d.exento||d.exe||0)*signo;
    resumen[cod].iva+=(d.iva||0)*signo;resumen[cod].total+=(d.total||0)*signo;
  });
  const R=n=>Math.round(n||0);
  // Construir XML
  let xml='<?xml version="1.0" encoding="ISO-8859-1"?>\n';
  xml+='<LibroCompraVenta xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte LibroCV_v10.xsd" version="1.0">\n';
  xml+='  <EnvioLibro ID="LIBRO'+periodo.replace('-','')+'">\n';
  xml+='    <Caratula>\n';
  xml+='      <RutEmisorLibro>'+escXml(rutEmisor)+'</RutEmisorLibro>\n';
  xml+='      <RutEnvia>'+escXml(rutEmisor)+'</RutEnvia>\n';
  xml+='      <PeriodoTributario>'+periodo+'</PeriodoTributario>\n';
  xml+='      <FchResol>'+anio+'-01-01</FchResol>\n';
  xml+='      <NroResol>0</NroResol>\n';
  xml+='      <TipoOperacion>'+tipo+'</TipoOperacion>\n';
  xml+='      <TipoLibro>MENSUAL</TipoLibro>\n';
  xml+='      <TipoEnvio>TOTAL</TipoEnvio>\n';
  xml+='    </Caratula>\n';
  // ResumenPeriodo
  xml+='    <ResumenPeriodo>\n';
  Object.keys(resumen).forEach(cod=>{
    const r=resumen[cod];
    xml+='      <TotalesPeriodo>\n';
    xml+='        <TpoDoc>'+cod+'</TpoDoc>\n';
    xml+='        <TotDoc>'+r.docs+'</TotDoc>\n';
    if(R(r.exe))xml+='        <TotMntExe>'+R(r.exe)+'</TotMntExe>\n';
    else xml+='        <TotMntExe>0</TotMntExe>\n';
    xml+='        <TotMntNeto>'+R(r.neto)+'</TotMntNeto>\n';
    xml+='        <TotMntIVA>'+R(r.iva)+'</TotMntIVA>\n';
    xml+='        <TotMntTotal>'+R(r.total)+'</TotMntTotal>\n';
    xml+='      </TotalesPeriodo>\n';
  });
  xml+='    </ResumenPeriodo>\n';
  // Detalle por documento
  docs.forEach(d=>{
    const cod=d.tipoDTE;
    const rp=(d.rutCodigo)?rutSii(d.rutCodigo,d.rutDV):'0-0';
    const signo=(tipo==='VENTA'?(dteV(cod)?.signo):(dteC(cod)?.signo))||1;
    xml+='    <Detalle>\n';
    xml+='      <TpoDoc>'+cod+'</TpoDoc>\n';
    xml+='      <NroDoc>'+(d.numero||0)+'</NroDoc>\n';
    if(R(d.iva))xml+='      <TasaImp>19</TasaImp>\n';
    xml+='      <FchDoc>'+(d.fecha||periodo+'-01')+'</FchDoc>\n';
    xml+='      <RUTDoc>'+escXml(rp)+'</RUTDoc>\n';
    xml+='      <RznSoc>'+escXml((d.razonSocial||'').slice(0,50))+'</RznSoc>\n';
    const exe=R((d.exento||d.exe||0)*signo);
    if(exe)xml+='      <MntExe>'+exe+'</MntExe>\n';
    xml+='      <MntNeto>'+R((d.neto||0)*signo)+'</MntNeto>\n';
    if(R(d.iva))xml+='      <MntIVA>'+R((d.iva||0)*signo)+'</MntIVA>\n';
    xml+='      <MntTotal>'+R((d.total||0)*signo)+'</MntTotal>\n';
    xml+='    </Detalle>\n';
  });
  xml+='  </EnvioLibro>\n';
  xml+='</LibroCompraVenta>\n';
  // Descargar
  const blob=new Blob([xml],{type:'application/xml;charset=ISO-8859-1'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`IECV_${tipo}_${periodo}.xml`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('✅ XML generado: '+docs.length+' documentos');
  logAccion('Exportó XML SII',`${tipo} · ${periodo} · ${docs.length} docs`);
}


export {escXml, rutSii, renderXmlSii, generarXmlSii};
