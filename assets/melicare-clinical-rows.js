/* Presentation adapter for MELIDx clinical pages.
   Reuses existing labels, values, scores and bar positions; no risk calculation is changed.
   Adds an accessible detail dialog for explanation/threshold rows. */
(() => {
 'use strict';
 const DX_PAGES=new Set(['MELIStroke.html','MELIAlz.html','MELICardio.html','MELIDiabetes.html','MELIMind.html']);
 const page=(location.pathname.split('/').pop()||'').split('?')[0];
 if(!DX_PAGES.has(page)) return;
 document.documentElement.classList.add('mc-dx-enhanced');

 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const text=n=>(n?.textContent||'').trim();
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 const EXPLAIN=[
  [/huyết áp|hatt|sbp/i,"Blood pressure is shown alongside a reference threshold to illustrate differences and trends across measurements."],
  [/glucose|đường huyết/i,"Glucose reflects blood sugar at the time of measurement. The marker compares the current value with the interface threshold."],
  [/hba1c/i,"HbA1c reflects average blood glucose over a longer period than a single glucose measurement."],
  [/ldl/i,"LDL-C is a blood lipid. The interface compares its current value with a reference threshold to highlight levels needing attention."],
  [/hdl/i,"HDL-C is compared with a reference range; for some indicators, lower values warrant attention."],
  [/triglyceride|tg/i,"Triglycerides are blood lipids. The comparison bar shows the current value relative to the prototype threshold."],
  [/egfr/i,"eGFR estimates kidney filtration function. The interface uses it as an input to the combined assessment."],
  [/tuổi/i,"Age is a baseline factor in the illustrative model and can affect the combined risk level."],
  [/rung nhĩ|afib/i,"Atrial fibrillation is included in the prototype risk assessment when present."],
  [/tia|đột quỵ trước|tiền sử.*đột quỵ/i,"A history of TIA or stroke is considered an important risk factor in the prototype assessment."],
  [/hút thuốc/i,"Smoking status is used as a behavioral factor in the result explanation."],
  [/bmi|khối cơ thể/i,"BMI describes relative weight status and is an input to the combined assessment."],
  [/mmse/i,"MMSE is a cognitive assessment scale. This page tracks it over time and against an illustrative threshold."],
  [/moca/i,"MoCA is a cognitive screening scale. The chart shows changes between assessments in this prototype."],
  [/adl/i,"ADL describes independence in daily activities. Its value is compared with a threshold to help track changes."],
  [/phq-?9/i,"PHQ-9 is a depression symptom questionnaire. Scores are used as illustrative data for trend monitoring."],
  [/gad-?7/i,"GAD-7 is an anxiety symptom questionnaire. Scores are shown as trends and compared with interface thresholds."],
  [/giấc ngủ|sleep/i,"Sleep information is a monitoring indicator in this prototype, displayed alongside other mental health indicators."],
  [/spo2|oxy/i,"SpO₂ represents peripheral oxygen saturation. The interface compares the current value with an illustrative threshold to flag levels needing attention."],
  [/hemoglobin|hgb|hb\b/i,"Hemoglobin is tracked as a laboratory indicator and compared with a reference threshold in this prototype."]
 ];
 const explainFor=title=>EXPLAIN.find(([re])=>re.test(title))?.[1] || "This row shows a factor used to compare the current value with a threshold or explain its contribution to the combined result.";

 function ensureDialog(){
   let dlg=document.getElementById('mcClinicalDetailDialog');
   if(dlg) return dlg;
   dlg=document.createElement('dialog');
   dlg.id='mcClinicalDetailDialog';
   dlg.className='mc-detail-dialog';
   dlg.innerHTML=`<div class="mc-detail-shell">
     <div class="mc-detail-head"><div><span class="mc-detail-kicker">DETAILED EXPLANATION</span><h3 id="mcDetailTitle">Indicator details</h3></div><button type="button" class="mc-detail-close" aria-label="Close">×</button></div>
     <div class="mc-detail-body" id="mcDetailBody"></div>
     <div class="mc-detail-foot"><span>Data and thresholds on this page are illustrative prototype content.</span><button type="button" class="mc-detail-done">Close</button></div>
   </div>`;
   document.body.append(dlg);
   const close=()=>dlg.close();
   dlg.querySelector('.mc-detail-close').addEventListener('click',close);
   dlg.querySelector('.mc-detail-done').addEventListener('click',close);
   dlg.addEventListener('click',e=>{if(e.target===dlg)close();});
   return dlg;
 }

 function openDetail(card){
   const dlg=ensureDialog();
   const kind=card.dataset.mcRow;
   const title=clean(card.querySelector('.mc-row-title')?.textContent)||"Indicator details";
   const value=clean(card.querySelector('.mc-row-measurement,.mc-row-value-small')?.textContent);
   const badge=clean(card.querySelector('.mc-row-badge')?.textContent);
   const detail=clean(card.querySelector('.mc-row-detail')?.textContent);
   const titleEl=dlg.querySelector('#mcDetailTitle');
   const body=dlg.querySelector('#mcDetailBody');
   titleEl.textContent=title;
   const icon=kind==='attention'?'↔':'✦';
   const reading=kind==='attention'
     ? "The colored marker shows the current value on the comparison bar. The thin line marks the interface threshold; the distance between them indicates the deviation."
     : "This row represents a factor contributing to the combined result. The bar illustrates its position relative to a reference; the score on the right indicates its contribution within the prototype logic.";
   body.innerHTML=`
     <div class="mc-detail-summary"><span class="mc-detail-icon">${icon}</span><div><b>${esc(kind==='attention'?"Levels relative to thresholds":"Explanatory factor")}</b><span>${esc(explainFor(title))}</span></div></div>
     <div class="mc-detail-grid">
       ${value?`<div><span>Current value</span><strong>${esc(value)}</strong></div>`:''}
       ${badge?`<div><span>${kind==='attention'?"Status":"Contribution"}</span><strong>${esc(badge)}</strong></div>`:''}
       ${detail?`<div class="wide"><span>Comparison</span><strong>${esc(detail)}</strong></div>`:''}
     </div>
     <div class="mc-detail-note"><b>How to read</b><p>${esc(reading)}</p></div>
     <div class="mc-detail-note soft"><b>Note</b><p>This popup explains the interface and displayed data; it is not an independent diagnostic conclusion.</p></div>`;
   if(!dlg.open) dlg.showModal();
   setTimeout(()=>dlg.querySelector('.mc-detail-close')?.focus(),20);
 }

 function normalize(card,isReason){
  if(card.classList.contains('mc-clinical-row'))return;
  const header=card.querySelector(isReason?'.reasonHeader':'.attentionTop');
  const track=card.querySelector(isReason?'.compareTrack':'.rangeBar');
  if(!header||!track)return;
  const title=text(header.querySelector('b'));
  let score,value='',detail='',statusClass='';
  if(isReason){
   score=text(header.lastElementChild);
   detail=text(card.querySelector('.reasonDetailInline,.reasonValueInline,.reasonText'));
  }else{
   value=text(header.querySelector('small'));
   const status=header.querySelector('.statusAndDelta')?.firstElementChild||header.querySelector(':scope > strong,:scope > span');
   score=text(status);statusClass=status?.className||'';
   detail=text(card.querySelector('.deltaInline,.indicatorDeltaInline,.deltaText'));
  }
  const top=el('div','mc-row-top');
  const titleGroup=el('div','mc-row-heading');titleGroup.append(el('b','mc-row-title',title));
  if(value)titleGroup.append(el('span','mc-row-measurement',value));
  top.append(titleGroup);
  const badge=el('span','mc-row-badge'+(isReason?' mc-row-points':'')+(statusClass?' '+statusClass:''),score);top.append(badge);
  const meta=el('div','mc-row-meta');
  if(value)meta.append(el('span','mc-row-value-small',value));
  if(detail)meta.append(el('span','mc-row-detail',detail));
  const shell=el('div','mc-row-track-shell');shell.append(track);
  const labels=card.querySelector('.rangeLabels');if(labels)shell.append(labels);
  card.replaceChildren(top,meta,shell);card.classList.add('mc-clinical-row');
  card.dataset.mcRow=isReason?'reason':'attention';
  card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${title}. Click for a detailed explanation.`);
  card.title="View detailed explanation";
 }
 function start(){
  ensureDialog();
  for(const [id,reason] of [['reasonList',true],['attentionList',false]]){
   const list=document.getElementById(id);if(!list)continue;
   list.closest('.panel')?.classList.add('mc-indicator-panel');
   const update=()=>Array.from(list.children).forEach(card=>normalize(card,reason));
   update();new MutationObserver(update).observe(list,{childList:true});
   list.addEventListener('click',e=>{const card=e.target.closest('.mc-clinical-row');if(card&&list.contains(card))openDetail(card);});
   list.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.mc-clinical-row');if(card&&list.contains(card)){e.preventDefault();openDetail(card);}});
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
