/* MELIOR / Duty workspace
 * Six doctor names and specialties come from the supplied MELIOR prototype.
 * Rosters, assignments, staff IDs and surgical cases below are SYNTHETIC UI data.
 * No inference, real-time hospital connection, contact data or real medical records.
 * Replace the getDay() adapter with authorized backend data before production use.
 * Today, week, selected-day details and doctor profiles share this one data model.
 * Dates are civil dates in Asia/Ho_Chi_Minh; overnight shifts belong to their START date.
 */
(() => {
 'use strict';
 const CONFIG={timeZone:'Asia/Ho_Chi_Minh',minDate:'1900-01-01',maxDate:'2100-12-31'};
 const PATHS={
  left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon:'<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-9 3v5m-2.5-2.5h5"/>',
  surgery:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM12 10v6m-3-3h6"/>',
  room:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 9h8m-4 0v12m-4-7h8"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v6m0-9v.1"/>',
  empty:'<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2v4m8-4v4M4 10h16m-12 5h8"/>'
 };
 const icon=k=>`<svg class="od-icon" viewBox="0 0 24 24" aria-hidden="true">${PATHS[k]||PATHS.user}</svg>`;
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();
 const $=id=>document.getElementById(id);
 function civilToday(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:CONFIG.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=key=>parts.find(x=>x.type===key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
 }
 const civilDate=key=>new Date(key+'T12:00:00Z');
 const keyOf=d=>d.toISOString().slice(0,10);
 function addDays(key,n){const d=civilDate(key);d.setUTCDate(d.getUTCDate()+n);return keyOf(d);}
 function monday(key){const day=civilDate(key).getUTCDay();return addDays(key,-((day+6)%7));}
 const fmt=key=>new Intl.DateTimeFormat('vi-VN',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(civilDate(key));
 const fmtDM=key=>fmt(key).slice(0,5);
 const dow=key=>['Chủ nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'][civilDate(key).getUTCDay()];
 const fullDate=key=>`${dow(key)}, ${fmt(key)}`;
 const inBounds=key=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&key>=CONFIG.minDate&&key<=CONFIG.maxDate&&!Number.isNaN(+civilDate(key))&&keyOf(civilDate(key))===key;
 const safeDate=key=>key<CONFIG.minDate?CONFIG.minDate:key>CONFIG.maxDate?CONFIG.maxDate:key;
 let today=civilToday(),selected=today,week=monday(today),detailTab='staff',ready=false;
 const cache=new Map();
 const ASSIGN_KEY='melior-doctor-case-assignments-v1';
 let savedAssignments=[];
 try{const raw=JSON.parse(localStorage.getItem(ASSIGN_KEY)||'[]');if(Array.isArray(raw))savedAssignments=raw.filter(a=>a&&inBounds(a.date)&&typeof a.doctorId==='string'&&typeof a.caseId==='string');}catch(_){}

 // Reuse the doctor's name/specialty from the source; avoid inventing qualifications or contacts.
 const doctors=(typeof DUTY_DOCTORS!=='undefined'?DUTY_DOCTORS:[]).map((d,i)=>({
  id:`BS${String(i+1).padStart(3,'0')}`,name:d[0],specialty:d[1],
  role:d[1]==='Gây mê hồi sức'?'Bác sỹ gây mê':'Phẫu thuật viên',ana:d[1]==='Gây mê hồi sức',
  initials:d[0].replace(/^BS\.\s*/,'').split(/\s+/).slice(-2).map(w=>w[0]).join(''),
  short:d[0].replace(/^BS\.\s*/,'').split(/\s+/).slice(-2).join(' ')
 }));
 const doctorById=Object.fromEntries(doctors.map(d=>[d.id,d]));
 const surgeons=doctors.filter(d=>!d.ana),anesthetists=doctors.filter(d=>d.ana);
 const SHIFTS={day:{label:'Trực ngày',time:'07:00–19:00',long:'07:00–19:00',icon:'sun'},night:{label:'Trực đêm',time:'19:00–07:00',long:'19:00–07:00 hôm sau',icon:'moon'}};
 const procedures={
  'BS001':['Cắt túi mật nội soi','Cắt ruột thừa nội soi','Phẫu thuật nội soi TEP'],
  'BS003':['Thay khớp háng toàn phần','Kết hợp xương đùi','Cố định xương'],
  'BS005':['Cắt thùy tuyến giáp','Cắt túi mật nội soi','Phẫu thuật nội soi TEP'],
  'BS006':['Nội soi đại tràng can thiệp','Nội soi can thiệp','Cắt ruột thừa nội soi']
 };
 function getDay(key){
  if(cache.has(key))return cache.get(key);
  const serial=Math.floor(Date.parse(key+'T00:00:00Z')/86400000),mod=(a,b)=>(a%b+b)%b;
  const daySurgeon=surgeons[mod(serial,surgeons.length)],nightSurgeon=surgeons[mod(serial+2,surgeons.length)];
  const dayAna=anesthetists[mod(Math.floor(serial/2),anesthetists.length)],nightAna=anesthetists.find(d=>d.id!==dayAna.id);
  const assignments=[{doctorId:daySurgeon.id,shift:'day'},{doctorId:dayAna.id,shift:'day'},{doctorId:nightSurgeon.id,shift:'night'},{doctorId:nightAna.id,shift:'night'}];
  const slots=[['08:00','09:30','day',0],['10:15','11:45','day',1],['14:00','15:30','day',2],['20:00','21:30','night',0]];
  const cases=slots.map(([start,end,shift,pi],i)=>{
   const surgeon=shift==='day'?daySurgeon:nightSurgeon,ana=shift==='day'?dayAna:nightAna;
   return {id:`MH-${key.replaceAll('-','')}-${String(i+1).padStart(2,'0')}`,date:key,start,end,shift,
    procedure:(procedures[surgeon.id]||['Ca phẫu thuật minh họa'])[pi],patient:`Người bệnh mẫu ${String(i+1).padStart(2,'0')}`,
    room:`PM${String(1+mod(serial+(shift==='day'?0:1),4)).padStart(2,'0')}`,team:[surgeon.id,ana.id]};
  });
  savedAssignments.filter(a=>a.date===key).forEach(a=>{
   const c=cases.find(c=>c.id===a.caseId);if(!c||!doctorById[a.doctorId])return;
   if(!c.team.includes(a.doctorId))c.team.push(a.doctorId);
   if(!assignments.some(x=>x.doctorId===a.doctorId&&x.shift===c.shift))assignments.push({doctorId:a.doctorId,shift:c.shift});
  });
  const result={key,assignments,cases};cache.set(key,result);return result;
 }
 function casesOf(key,id){return getDay(key).cases.filter(c=>c.team.includes(id));}
 function assignmentOf(key,id){return getDay(key).assignments.find(a=>a.doctorId===id);}
 function avatar(d){return `<span class="od-avatar ${d.ana?'ana':''}" aria-hidden="true">${esc(d.initials)}</span>`;}
 function shiftTag(shift){if(!shift)return '<span class="od-shift-tag off">Không trực</span>';const s=SHIFTS[shift];return `<span class="od-shift-tag ${shift}">${icon(s.icon)}${s.label}</span>`;}
 function clockMinutes(){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:CONFIG.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  return Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value);
 }
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 function caseState(c){
  if(c.date<today)return ['done','Đã kết thúc'];
  if(c.date>today)return ['','Dự kiến'];
  const now=clockMinutes();if(now>=minutes(c.end))return ['done','Hoàn thành'];
  if(now>=minutes(c.start))return ['active','Đang mổ'];return ['','Chờ mổ'];
 }
 function caseItem(c,doctorId=null){
  const [state,label]=caseState(c),doctor=doctorById[doctorId];
  return `<article class="od-case-item"><div class="od-case-time">${c.start}<small>đến ${c.end}</small></div><div class="od-case-content"><strong>${esc(c.procedure)}</strong><p>${esc(c.id)} · ${esc(c.patient)}</p><div class="od-case-tags"><span>${icon('room')}${c.room}</span><span>${icon('clock')}90 phút</span>${doctor?`<span>${icon('user')}${doctor.ana?'Gây mê':'Phẫu thuật viên'}</span>`:''}</div>${!doctor?`<div class="od-case-doctors">${c.team.map(id=>`<button type="button" class="od-doctor-link" data-od-doctor-cases="${id}" data-od-date="${c.date}" aria-label="Xem ca mổ của ${esc(doctorById[id].name)} ngày ${fmt(c.date)}">${esc(doctorById[id].name)}</button>`).join('')}</div>`:''}</div><span class="od-case-state ${state}">${label}</span></article>`;
 }
 let todayPage=0,todayPageSize=4;
 function renderToday(){
  const data=getDay(today);
  $('odTodayDate').textContent=fullDate(today);
  $('odTodaySummary').innerHTML=`<span><b>${data.assignments.length}</b>bác sỹ</span><span><b>${data.cases.length}</b>ca mổ</span>`;
  const pageCount=Math.max(1,Math.ceil(data.assignments.length/todayPageSize));todayPage=Math.min(todayPage,pageCount-1);
  const start=todayPage*todayPageSize;
  $('odTodayDoctors').style.setProperty('--od-page-size',todayPageSize);
  $('odTodayPageLabel').textContent=`${data.assignments.length?start+1:0}–${Math.min(start+todayPageSize,data.assignments.length)} / ${data.assignments.length} bác sỹ`;
  $('odTodayPrev').disabled=todayPage===0;$('odTodayNext').disabled=todayPage>=pageCount-1;
  $('odTodayDoctors').innerHTML=data.assignments.slice(start,start+todayPageSize).map(a=>{
   const d=doctorById[a.doctorId],n=casesOf(today,d.id).length;
   return `<button type="button" class="od-today-card" data-od-doctor-cases="${d.id}" data-od-date="${today}" aria-label="${esc(d.name)}, ${SHIFTS[a.shift].label.toLowerCase()}, ${n} ca mổ ngày ${fmt(today)}"><span class="od-today-card-top">${avatar(d)}${shiftTag(a.shift)}</span><strong class="od-today-name">${esc(d.name)}</strong><span class="od-today-specialty">${esc(d.specialty)}</span><span class="od-today-card-foot">${icon('clock')}<span>${SHIFTS[a.shift].time}${a.shift==='night'?' (+1)':''}</span><span class="od-case-link">${n} ca mổ ${icon('right')}</span></span></button>`;
  }).join('');
 }
 function renderWeek(scroll=false,focus=false){
  $('odWeekRange').textContent=`${fmt(addDays(week,0))} – ${fmt(addDays(week,6))}`;
  $('odDatePicker').value=selected;
  $('odPrevWeek').disabled=addDays(week,-7)<CONFIG.minDate;
  $('odNextWeek').disabled=addDays(week,7)>CONFIG.maxDate;
  $('odWeekGrid').innerHTML=Array.from({length:7},(_,i)=>{
   const key=addDays(week,i),data=getDay(key),isToday=key===today,active=key===selected;
   return `<button type="button" class="od-day-button ${isToday?'is-today':''}" data-od-day="${key}" aria-pressed="${active}" ${isToday?'aria-current="date"':''} tabindex="${active?0:-1}" ${inBounds(key)?'':'disabled'} aria-label="${fullDate(key)}${isToday?', hôm nay':''}, ${data.assignments.length} bác sỹ trực, ${data.cases.length} ca mổ"><span class="od-day-heading"><span>${['Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ nhật'][i]}</span><strong class="od-day-date">${Number(key.slice(-2))}</strong></span>${['day','night'].map(shift=>`<span class="od-calendar-shift ${shift}"><span class="od-calendar-shift-label">${icon(SHIFTS[shift].icon)}${shift==='day'?'Ca ngày':'Ca đêm'}</span>${data.assignments.filter(a=>a.shift===shift).map(a=>`<span class="od-calendar-shift-name">${esc(doctorById[a.doctorId].short)}</span>`).join('')}</span>`).join('')}<span class="od-day-count"><span>${isToday?'Hôm nay':fmtDM(key)} · ${data.cases.length} ca mổ</span>${icon('right')}</span></button>`;
  }).join('');
  renderSelected();
  if(scroll||focus){
   const b=$('odWeekGrid').querySelector(`[data-od-day="${selected}"]`),scroller=b?.closest('.od-week-scroll');
   if(b&&scroller){const r=b.getBoundingClientRect(),s=scroller.getBoundingClientRect();if(r.left<s.left+16||r.right>s.right-16)scroller.scrollTo({left:scroller.scrollLeft+r.left-s.left-scroller.clientWidth/2+r.width/2,behavior:'auto'});if(focus)b.focus({preventScroll:true});}
  }
 }
 function renderSelected(){
  const data=getDay(selected);
  $('odSelectedTitle').textContent=`${fullDate(selected)}${selected===today?' · Hôm nay':''}`;
  $('odSelectedSummary').textContent=`${data.assignments.length} bác sỹ · 2 kíp trực · ${data.cases.length} ca mổ dự kiến`;
  $('odSelectedCaseCount').textContent=data.cases.length;
  $('odSelectedStaff').innerHTML=['day','night'].map(shift=>`<div class="od-shift-card ${shift}"><div class="od-shift-card-head">${icon(SHIFTS[shift].icon)}<strong>${SHIFTS[shift].label}</strong><span>${SHIFTS[shift].long}</span></div><div class="od-shift-staff">${data.assignments.filter(a=>a.shift===shift).map(a=>{
   const d=doctorById[a.doctorId];return `<button type="button" class="od-person-row" data-od-doctor-cases="${d.id}" data-od-date="${selected}" aria-label="Xem ca mổ của ${esc(d.name)} ngày ${fmt(selected)}">${avatar(d)}<span class="od-person-info"><strong class="od-person-name">${esc(d.name)}</strong><small>${esc(d.specialty)} · ${d.ana?'Gây mê':'Mổ chính'}</small></span><span class="od-person-count">${casesOf(selected,d.id).length} ca mổ</span>${icon('right')}</button>`;
  }).join('')}</div></div>`).join('');
  $('odSelectedCases').innerHTML=`<div class="od-case-list">${data.cases.map(c=>caseItem(c)).join('')}</div>`;
  selectDetailTab(detailTab);
 }
 function selectDetailTab(tab,focus=false){
  detailTab=tab;
  for(const [key,b,p] of [['staff','odStaffTab','odSelectedStaff'],['cases','odCasesTab','odSelectedCases']]){
   const active=tab===key;$(b).setAttribute('aria-selected',String(active));$(b).tabIndex=active?0:-1;$(p).hidden=!active;
   if(active&&focus)$(b).focus({preventScroll:true});
  }
 }
 function renderDirectory(){
  const q=norm($('odDoctorSearch').value),specialty=$('odSpecialtyFilter').value;
  const list=doctors.filter(d=>(!specialty||d.specialty===specialty)&&norm(`${d.name} ${d.id} ${d.specialty} ${d.role}`).includes(q));
  $('odDirectoryTotal').textContent=doctors.length;
  $('odFilterCount').textContent=`${list.length} / ${doctors.length} bác sỹ`;
  $('odDirectoryEmpty').hidden=list.length>0;
  $('odDoctorRows').closest('.od-table-scroll').hidden=list.length===0;
  $('odDoctorRows').innerHTML=list.map(d=>{
   const a=assignmentOf(today,d.id);return `<tr><td><div class="od-table-person">${avatar(d)}<div><strong>${esc(d.name)}</strong><small>${d.id} · Khoa mổ</small></div></div></td><td>${esc(d.specialty)}</td><td class="od-table-role">${esc(d.role)}</td><td><div class="od-table-shift">${shiftTag(a?.shift)}<small>${a?SHIFTS[a.shift].long:'Không có ca trực bắt đầu hôm nay'}</small></div></td><td><button type="button" class="od-btn" data-od-profile="${d.id}" aria-label="Xem chi tiết bác sỹ ${esc(d.name)}">${icon('eye')}<span>Xem chi tiết</span></button><button type="button" class="od-btn od-primary od-assign-button" data-od-assign="${d.id}" aria-label="Phân công bác sỹ ${esc(d.name)}">${icon('surgery')}<span>Phân công</span></button></td></tr>`;
  }).join('');
 }
 let dialog=null,dialogTrigger=null,previousOverflow='';
 function showModal(title,body,actions){
  if(!dialog.open){dialogTrigger=document.activeElement;previousOverflow=document.body.style.overflow;}
  dialog.innerHTML=`<div class="od-dialog-head"><div><h2 id="odDialogTitle">${esc(title)}</h2><p id="odDialogDescription">MELIOR · Khoa mổ · Thông tin minh họa</p></div><button type="button" class="od-btn od-icon-button" data-od-close aria-label="Đóng cửa sổ">${icon('close')}</button></div><div class="od-dialog-body">${body}</div><div class="od-dialog-footer"><span>Dữ liệu mô phỏng · Chưa kết nối bệnh viện</span><div class="od-modal-actions">${actions}<button type="button" class="od-btn od-primary" data-od-close>Đóng</button></div></div>`;
  document.body.style.overflow='hidden';if(!dialog.open)dialog.showModal();
  dialog.querySelector('.od-dialog-body').scrollTop=0;dialog.querySelector('[data-od-close]').focus({preventScroll:true});
 }
 function doctorCases(id,key){
  const d=doctorById[id];if(!d||!inBounds(key))return;
  const a=assignmentOf(key,id),cases=casesOf(key,id);
  const body=`<div class="od-profile-hero">${avatar(d)}<div><strong>${esc(d.name)}</strong><p>${esc(d.specialty)} · ${esc(d.role)}</p></div>${shiftTag(a?.shift)}</div><div class="od-modal-section-head"><h3>${key===today?'Ca mổ hôm nay':'Ca mổ trong ngày'} · ${fmt(key)}</h3><span>${cases.length} ca được phân công</span></div>${a?`<div class="od-modal-date">${icon('clock')}${SHIFTS[a.shift].long}${a.shift==='night'?` (${fmt(addDays(key,1))})`:''}</div>`:''}${cases.length?`<div class="od-case-list">${cases.map(c=>caseItem(c,id)).join('')}</div>`:`<div class="od-empty-case">${icon('empty')}<h3>Chưa có ca mổ được phân công</h3><p>${a?'Bác sỹ có lịch trực nhưng chưa được phân công ca mổ.':'Bác sỹ không có ca trực bắt đầu trong ngày này.'}</p></div>`}`;
  showModal('Ca mổ của bác sỹ',body,`<button type="button" class="od-btn" data-od-profile="${d.id}">${icon('user')}Xem hồ sơ</button>`);
 }
 function doctorProfile(id){
  const d=doctorById[id];if(!d)return;
  const a=assignmentOf(today,id),weekDays=Array.from({length:7},(_,i)=>addDays(week,i));
  const weekCount=weekDays.filter(k=>assignmentOf(k,id)).length;
  const body=`<div class="od-profile-hero">${avatar(d)}<div><strong>${esc(d.name)}</strong><p>${d.id} · Khoa mổ</p></div>${shiftTag(a?.shift)}</div><div class="od-profile-grid">${[['Chuyên khoa',d.specialty],['Vai trò',d.role],['Lịch hôm nay',a?SHIFTS[a.shift].long:'Không trực'],['Trong tuần đang xem',`${weekCount} ca trực · ${weekDays.reduce((sum,k)=>sum+casesOf(k,id).length,0)} ca mổ`]].map(([key,val])=>`<dl class="od-profile-field"><dt>${esc(key)}</dt><dd>${esc(val)}</dd></dl>`).join('')}</div><div class="od-modal-section-head"><h3>Lịch trực trong tuần đang xem</h3><span>${fmtDM(week)} – ${fmt(addDays(week,6))}</span></div><div class="od-profile-week">${weekDays.map(k=>{
   const as=assignmentOf(k,id),n=casesOf(k,id).length;
   return `<div class="od-profile-week-row ${k===today?'today':''}"><strong>${dow(k)} · ${fmtDM(k)}${k===today?' · Hôm nay':''}</strong><span>${as?SHIFTS[as.shift].long:'Không trực'}</span>${as?`<button type="button" class="od-btn" data-od-doctor-cases="${id}" data-od-date="${k}" aria-label="Xem ${n} ca mổ của ${esc(d.name)} ngày ${fmt(k)}">${n} ca mổ ${icon('right')}</button>`:'<span>—</span>'}</div>`;
  }).join('')}</div>`;
  showModal('Hồ sơ bác sỹ',body,`<button type="button" class="od-btn" data-od-doctor-cases="${id}" data-od-date="${today}">${icon('surgery')}Ca mổ hôm nay</button>`);
 }
 
 function eligibleCases(key){return getDay(key).cases.filter(c=>key>civilToday()||(key===civilToday()&&minutes(c.start)>clockMinutes()));}
 function assignmentProblem(d,key,c){
  if(!inBounds(key)||key<civilToday())return 'Vui lòng chọn hôm nay hoặc một ngày trong tương lai.';
  if(!c||!eligibleCases(key).some(x=>x.id===c.id))return 'Ca mổ này đã bắt đầu hoặc không còn khả dụng. Hãy chọn ca khác.';
  if(c.team.includes(d.id))return 'Bác sỹ đã được phân công vào ca mổ này.';
  if(casesOf(key,d.id).some(x=>minutes(x.start)<minutes(c.end)&&minutes(c.start)<minutes(x.end)))return 'Bác sỹ đã có ca mổ trùng thời gian. Hãy chọn ca khác.';
  return '';
 }
 function assignDoctor(id){
  const d=doctorById[id];if(!d)return;
  const now=civilToday(),initial=selected>=now?selected:now;
  showModal('Phân công bác sỹ vào ca mổ',`<div class="od-profile-hero">${avatar(d)}<div><strong>${esc(d.name)}</strong><p>${esc(d.specialty)} · ${esc(d.role)}</p></div></div><form id="odAssignForm" class="od-assign-form"><label for="odAssignDate">Ngày phẫu thuật</label><input id="odAssignDate" type="date" min="${now}" max="${CONFIG.maxDate}" value="${initial}" required><label for="odAssignCase">Ca mổ</label><select id="odAssignCase" required></select><div id="odAssignPreview" class="od-assign-preview"></div><p id="odAssignError" role="alert"></p><p>Chọn ca chưa bắt đầu. Bác sỹ sẽ được bổ sung vào kíp mổ theo vai trò ${d.ana?'gây mê':'phẫu thuật viên'}.</p></form>`,`<button type="submit" form="odAssignForm" id="odAssignSave" class="od-btn od-primary">Lưu phân công</button>`);
  const date=$('odAssignDate'),select=$('odAssignCase'),error=$('odAssignError'),save=$('odAssignSave');
  function preview(){
   const key=date.value,c=inBounds(key)?getDay(key).cases.find(x=>x.id===select.value):null;
   $('odAssignPreview').innerHTML=c?`<strong>${esc(c.procedure)}</strong><p>${esc(c.id)} · ${esc(c.room)} · ${c.start}–${c.end}</p><p>Kíp hiện tại: ${c.team.map(id=>esc(doctorById[id].name)).join(', ')}</p>`:'';
   const problem=assignmentProblem(d,key,c);error.textContent=problem;save.disabled=!!problem;
  }
  function update(){
   const key=date.value,valid=inBounds(key)&&key>=civilToday();
   const list=valid?eligibleCases(key):[];
   select.innerHTML=list.length?list.map(c=>`<option value="${esc(c.id)}">${c.start}–${c.end} · ${esc(c.room)} · ${esc(c.procedure)}</option>`).join(''):'<option value="">Không có ca mổ chưa bắt đầu trong ngày này</option>';
   select.disabled=!list.length;preview();
  }
  date.addEventListener('change',update);select.addEventListener('change',preview);
  $('odAssignForm').addEventListener('submit',e=>{
   e.preventDefault();const key=date.value,c=inBounds(key)?getDay(key).cases.find(x=>x.id===select.value):null,problem=assignmentProblem(d,key,c);
   if(problem){error.textContent=problem;save.disabled=true;return;}
   const record={date:key,doctorId:id,caseId:c.id};
   try{localStorage.setItem(ASSIGN_KEY,JSON.stringify([...savedAssignments,record]));}catch(_){error.textContent='Không lưu được phân công trên trình duyệt. Vui lòng thử lại.';return;}
   savedAssignments.push(record);cache.delete(key);selected=key;week=monday(key);refresh();
   showModal('Đã lưu phân công',`<div class="od-profile-hero">${avatar(d)}<div><strong>${esc(d.name)}</strong><p>Đã được phân công ngày ${fmt(key)}</p></div></div>${caseItem(getDay(key).cases.find(x=>x.id===c.id),id)}`,`<button type="button" class="od-btn" data-od-doctor-cases="${id}" data-od-date="${key}">Xem ca mổ của bác sỹ</button>`);
  });update();
 }

 function selectDate(key,{scroll=true,focus=false}={}){if(!inBounds(key))return;selected=key;week=monday(key);renderWeek(scroll,focus);}
 function refresh(){
  if(!ready)return;
  const nextToday=civilToday();if(nextToday!==today){const wasToday=selected===today;today=nextToday;if(wasToday){selected=today;week=monday(today);}}
  renderToday();renderWeek(true);renderDirectory();
 }
 function init(){
  if(ready||!$('dutyPage'))return;
  ready=true;
  document.querySelectorAll('[data-od-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.odIcon);});
  if(surgeons.length<2||anesthetists.length<2){$('odTodayDoctors').textContent='Chưa có đủ dữ liệu kíp trực để hiển thị.';return;}
  [...new Set(doctors.map(d=>d.specialty))].sort((a,b)=>a.localeCompare(b,'vi')).forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;$('odSpecialtyFilter').append(o);});
  dialog=document.createElement('dialog');dialog.id='odDialog';dialog.className='od-modal';dialog.setAttribute('aria-labelledby','odDialogTitle');dialog.setAttribute('aria-describedby','odDialogDescription');document.body.append(dialog);
  dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;if(dialogTrigger?.isConnected)dialogTrigger.focus({preventScroll:true});});
  dialog.addEventListener('keydown',e=>{
   if(e.key!=='Tab')return;
   const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
   const first=controls[0],last=controls[controls.length-1];
   if(!first){e.preventDefault();return;}
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  document.addEventListener('click',e=>{
   const trigger=e.target.closest('[data-od-close],[data-od-profile],[data-od-doctor-cases],[data-od-assign]');if(!trigger)return;
   if(trigger.dataset.odAssign)assignDoctor(trigger.dataset.odAssign);
   else if(trigger.hasAttribute('data-od-close'))dialog.close();
   else if(trigger.dataset.odProfile)doctorProfile(trigger.dataset.odProfile);
   else if(trigger.dataset.odDoctorCases)doctorCases(trigger.dataset.odDoctorCases,trigger.dataset.odDate||today);
  });
  $('odTodayPrev').addEventListener('click',()=>{if(todayPage>0){todayPage--;renderToday();}});
  $('odTodayNext').addEventListener('click',()=>{if((todayPage+1)*todayPageSize<getDay(today).assignments.length){todayPage++;renderToday();}});
  $('odTodayPageSize').addEventListener('change',e=>{todayPageSize=Number(e.target.value);todayPage=0;renderToday();});
  $('odWeekGrid').addEventListener('click',e=>{const b=e.target.closest('[data-od-day]');if(b)selectDate(b.dataset.odDay,{focus:true});});
  $('odWeekGrid').addEventListener('keydown',e=>{
   const b=e.target.closest('[data-od-day]');if(!b)return;let key;
   if(e.key==='ArrowLeft')key=addDays(b.dataset.odDay,-1);if(e.key==='ArrowRight')key=addDays(b.dataset.odDay,1);
   if(e.key==='ArrowUp')key=addDays(b.dataset.odDay,-7);if(e.key==='ArrowDown')key=addDays(b.dataset.odDay,7);
   if(e.key==='Home')key=monday(b.dataset.odDay);if(e.key==='End')key=addDays(monday(b.dataset.odDay),6);
   if(key){e.preventDefault();selectDate(key,{focus:true});}
  });
  $('odPrevWeek').addEventListener('click',()=>selectDate(safeDate(addDays(selected,-7))));
  $('odNextWeek').addEventListener('click',()=>selectDate(safeDate(addDays(selected,7))));
  $('odGoToday').addEventListener('click',()=>{today=civilToday();renderToday();selectDate(today,{focus:true});renderDirectory();});
  $('odDatePicker').addEventListener('change',e=>{if(inBounds(e.target.value))selectDate(e.target.value);else e.target.value=selected;});
  $('odDoctorSearch').addEventListener('input',renderDirectory);$('odSpecialtyFilter').addEventListener('change',renderDirectory);
  $('odClearFilters').addEventListener('click',()=>{$('odDoctorSearch').value='';$('odSpecialtyFilter').value='';renderDirectory();$('odDoctorSearch').focus();});
  $('odStaffTab').addEventListener('click',()=>selectDetailTab('staff'));$('odCasesTab').addEventListener('click',()=>selectDetailTab('cases'));
  document.querySelector('.od-detail-tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();selectDetailTab(e.key==='Home'?'staff':e.key==='End'?'cases':detailTab==='staff'?'cases':'staff',true);}});
  refresh();
  // A hash is a view identifier, not another HTML file; keep the cleaned bundle canonical.
  const pages=['dashboard','rooms','cases','equipment','duty'];
  document.querySelectorAll('.mc-or-local-nav button[data-page]').forEach(b=>b.addEventListener('click',()=>{
   try{history.replaceState(null,'','#'+b.dataset.page);}catch(_){}
  }));
  function applyHash(){const name=location.hash.slice(1);if(pages.includes(name))document.querySelector(`.mc-or-local-nav button[data-page="${name}"]`)?.click();}
  window.addEventListener('hashchange',applyHash);applyHash();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&civilToday()!==today)refresh();});
 }
 window.MELIOR_DUTY=Object.freeze({refresh,getState:()=>({today,selected,week,detailTab,doctors:doctors.length})});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
