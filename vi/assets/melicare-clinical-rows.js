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
  [/huyết áp|hatt|sbp/i,'Chỉ số huyết áp được đặt cạnh ngưỡng tham chiếu để cho thấy mức chênh lệch và xu hướng qua các lần đo.'],
  [/glucose|đường huyết/i,'Glucose phản ánh mức đường huyết tại thời điểm đo. Vị trí marker giúp đối chiếu giá trị hiện tại với ngưỡng đang dùng trong giao diện.'],
  [/hba1c/i,'HbA1c phản ánh mức đường huyết trung bình trong một khoảng thời gian dài hơn so với một lần đo glucose đơn lẻ.'],
  [/ldl/i,'LDL-C là một thành phần lipid máu. Giao diện dùng giá trị hiện tại và ngưỡng tham chiếu để thể hiện mức độ cần chú ý.'],
  [/hdl/i,'HDL-C được hiển thị theo hướng so sánh với vùng tham chiếu; với một số chỉ số, giá trị thấp mới là phía cần chú ý.'],
  [/triglyceride|tg/i,'Triglyceride là một thành phần lipid máu. Thanh so sánh cho biết vị trí tương đối của giá trị hiện tại so với ngưỡng trong prototype.'],
  [/egfr/i,'eGFR là chỉ số ước tính chức năng lọc của thận. Giao diện dùng nó như một yếu tố đầu vào trong phần đánh giá tổng hợp.'],
  [/tuổi/i,'Tuổi được dùng như một yếu tố nền trong mô hình minh họa và có thể làm thay đổi mức nguy cơ tổng hợp.'],
  [/rung nhĩ|afib/i,'Rung nhĩ là một yếu tố lâm sàng được đưa vào phần đánh giá nguy cơ của prototype khi trạng thái này hiện diện.'],
  [/tia|đột quỵ trước|tiền sử.*đột quỵ/i,'Tiền sử TIA hoặc đột quỵ được coi là một yếu tố nguy cơ quan trọng trong phần tổng hợp của prototype.'],
  [/hút thuốc/i,'Tình trạng hút thuốc được dùng như một yếu tố hành vi trong phần giải thích kết quả.'],
  [/bmi|khối cơ thể/i,'BMI được dùng để mô tả tình trạng cân nặng tương đối và là một yếu tố đầu vào của phần đánh giá tổng hợp.'],
  [/mmse/i,'MMSE là một thang đánh giá nhận thức. Trên trang này, giá trị được theo dõi theo thời gian và so với ngưỡng minh họa.'],
  [/moca/i,'MoCA là một thang sàng lọc nhận thức. Đồ thị giúp nhìn biến động giữa các lần đánh giá trong prototype.'],
  [/adl/i,'ADL mô tả mức độ độc lập trong hoạt động hằng ngày. Giá trị được đặt cạnh ngưỡng để hỗ trợ theo dõi thay đổi.'],
  [/phq-?9/i,'PHQ-9 là thang câu hỏi về triệu chứng trầm cảm. Trang dùng điểm số như dữ liệu minh họa cho việc theo dõi xu hướng.'],
  [/gad-?7/i,'GAD-7 là thang câu hỏi về triệu chứng lo âu. Điểm số được thể hiện theo xu hướng và ngưỡng của giao diện.'],
  [/giấc ngủ|sleep/i,'Thông tin giấc ngủ được dùng như một chỉ số theo dõi trong prototype và được đặt cạnh các chỉ số tâm lý khác.'],
  [/spo2|oxy/i,'SpO₂ thể hiện độ bão hòa oxy ngoại vi. Giao diện dùng giá trị hiện tại và ngưỡng minh họa để đánh dấu mức cần chú ý.'],
  [/hemoglobin|hgb|hb\b/i,'Hemoglobin được theo dõi như một chỉ số xét nghiệm và được so sánh với ngưỡng tham chiếu trong prototype.']
 ];
 const explainFor=title=>EXPLAIN.find(([re])=>re.test(title))?.[1] || 'Hàng này cho biết một yếu tố đang được dùng trong giao diện để đối chiếu giá trị hiện tại với ngưỡng hoặc để giải thích đóng góp vào kết quả tổng hợp.';

 function ensureDialog(){
   let dlg=document.getElementById('mcClinicalDetailDialog');
   if(dlg) return dlg;
   dlg=document.createElement('dialog');
   dlg.id='mcClinicalDetailDialog';
   dlg.className='mc-detail-dialog';
   dlg.innerHTML=`<div class="mc-detail-shell">
     <div class="mc-detail-head"><div><span class="mc-detail-kicker">GIẢI THÍCH CHI TIẾT</span><h3 id="mcDetailTitle">Chi tiết chỉ số</h3></div><button type="button" class="mc-detail-close" aria-label="Đóng">×</button></div>
     <div class="mc-detail-body" id="mcDetailBody"></div>
     <div class="mc-detail-foot"><span>Dữ liệu và ngưỡng trên trang là nội dung minh họa của prototype.</span><button type="button" class="mc-detail-done">Đóng</button></div>
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
   const title=clean(card.querySelector('.mc-row-title')?.textContent)||'Chi tiết chỉ số';
   const value=clean(card.querySelector('.mc-row-measurement,.mc-row-value-small')?.textContent);
   const badge=clean(card.querySelector('.mc-row-badge')?.textContent);
   const detail=clean(card.querySelector('.mc-row-detail')?.textContent);
   const titleEl=dlg.querySelector('#mcDetailTitle');
   const body=dlg.querySelector('#mcDetailBody');
   titleEl.textContent=title;
   const icon=kind==='attention'?'↔':'✦';
   const reading=kind==='attention'
     ? 'Marker màu biểu diễn vị trí của giá trị hiện tại trên thanh so sánh. Vạch mảnh là mốc ngưỡng đang dùng trong giao diện; khoảng cách giữa hai vị trí giúp nhìn nhanh mức lệch.'
     : 'Hàng này là một yếu tố đang góp phần giải thích kết quả tổng hợp. Thanh ngang minh họa vị trí của yếu tố so với mốc tham chiếu; điểm số bên phải thể hiện mức đóng góp trong logic prototype.';
   body.innerHTML=`
     <div class="mc-detail-summary"><span class="mc-detail-icon">${icon}</span><div><b>${esc(kind==='attention'?'Mức độ so với ngưỡng':'Yếu tố giải thích')}</b><span>${esc(explainFor(title))}</span></div></div>
     <div class="mc-detail-grid">
       ${value?`<div><span>Giá trị hiện tại</span><strong>${esc(value)}</strong></div>`:''}
       ${badge?`<div><span>${kind==='attention'?'Trạng thái':'Đóng góp'}</span><strong>${esc(badge)}</strong></div>`:''}
       ${detail?`<div class="wide"><span>Đối chiếu</span><strong>${esc(detail)}</strong></div>`:''}
     </div>
     <div class="mc-detail-note"><b>Cách đọc</b><p>${esc(reading)}</p></div>
     <div class="mc-detail-note soft"><b>Lưu ý</b><p>Popup này giải thích cách đọc giao diện và dữ liệu đang hiển thị; không phải kết luận chẩn đoán độc lập.</p></div>`;
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
  card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${title}. Nhấn để xem giải thích chi tiết.`);
  card.title='Xem giải thích chi tiết';
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
