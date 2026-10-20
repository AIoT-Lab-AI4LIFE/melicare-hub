/* One scroll policy for list viewports and modal content, including dynamic lists.
   Inline important declarations isolate this policy from accumulated legacy CSS. */
(()=>{
 'use strict';
 const lists='.attentionList,.reasonList,.lifestyleList,.factorList,.task-list,.record-list,.progress-rows,.emergencyList,.assignCaseList,.deviceList,.roomSurgeryList,.statusStageList,.historyMini,.paneBody,.table-scroll,.od-table-scroll,.caseList,.od-case-list,.od-profile-week,.od-selected-staff,.historyBody,.history-list,.card.table,.card.history';
 const set=(el,key,value)=>{if(el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important')el.style.setProperty(key,value,'important');};
 function list(el){
  set(el,'max-height',window.innerWidth<=600?'480px':'560px');set(el,'min-height','0px');set(el,'overflow-y','auto');set(el,'overflow-x','auto');set(el,'overscroll-behavior','auto');set(el,'scrollbar-gutter','stable');set(el,'box-sizing','border-box');
  if(getComputedStyle(el).display==='flex')Array.from(el.children).forEach(c=>set(c,'flex-shrink','0'));
 }
 const modalSelector='.opsModal,.opsPageModal,.caseModal,.eqModal,.od-modal,#uploadModal .modal';
 const bodySelector='#opsBody,#opsPageBody,.caseModalBody,.eqModalBody,.od-dialog-body,.modal-body';
 function odDialog(el){
  if(!el.open){set(el,'display','none');return;}
  set(el,'height','fit-content');set(el,'max-height','calc(100dvh - 36px)');set(el,'min-height','0px');
  set(el,'overflow','hidden');set(el,'display','flex');set(el,'flex-direction','column');
  const body=el.querySelector('.od-dialog-body');
  Array.from(el.children).forEach(c=>{
   if(c===body){
    set(c,'display','block');set(c,'flex','0 1 auto');set(c,'height','auto');set(c,'min-height','0px');
    set(c,'max-height','min(60dvh, 560px)');set(c,'overflow-y','auto');set(c,'overflow-x','hidden');
   }else{
    set(c,'flex','0 0 auto');set(c,'height','auto');set(c,'min-height','0px');set(c,'flex-grow','0');
   }
  });
 }
 function modal(el){
  if(el.classList.contains('od-modal')||el.id==='odDialog'){odDialog(el);return;}
  if(el.tagName==='DIALOG'&&!el.open){set(el,'display','none');return;}
  set(el,'max-height','calc(100dvh - 32px)');set(el,'min-height','0px');set(el,'overflow-y','auto');set(el,'overscroll-behavior','auto');
  const body=el.querySelector(bodySelector);if(!body)return;
  set(el,'display','flex');set(el,'flex-direction','column');const compact=(el.classList.contains('opsPageModal')&&!el.classList.contains('roomScheduleMode')&&!el.classList.contains('doctorCaseMode'))||(el.classList.contains('opsModal')&&el.classList.contains('eventMode')); 
  set(el,'height',compact?'auto':'min(780px, calc(100dvh - 32px))');set(el,'overflow','hidden');
  set(body,'display','block');set(body,'min-height','0px');set(body,'max-height','none');set(body,'height','auto');set(body,'flex',compact?'0 1 auto':'1 1 0px');set(body,'overflow-y',event?'visible':'auto');set(body,'overflow-x',event?'visible':'auto');set(body,'overscroll-behavior','auto');set(body,'scrollbar-gutter',event?'auto':'stable');
  Array.from(el.children).filter(c=>c!==body).forEach(c=>{set(c,'flex','0 0 auto');set(c,'flex-shrink','0');set(c,'flex-grow','0');});
  if(compact){set(el,'height','auto');set(el,'max-height','calc(100dvh - 32px)');}
 }
 function apply(root){
  if(root.nodeType!==1&&root!==document)return;
  if(root.matches?.(lists))list(root);root.querySelectorAll(lists).forEach(list);
  if(root.matches?.(modalSelector))modal(root);root.querySelectorAll(modalSelector).forEach(modal);
 }
 function init(){
  apply(document);
  const observer=new MutationObserver(records=>{
   for(const record of records){if(record.type==='attributes'){if(record.target.matches(modalSelector))modal(record.target);}else {record.addedNodes.forEach(apply);if(record.target.matches?.(modalSelector))modal(record.target);}}
  });observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
  let frame;window.addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>apply(document));},{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
