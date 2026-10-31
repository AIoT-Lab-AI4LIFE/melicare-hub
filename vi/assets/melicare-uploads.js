/* Drag/drop and selection feedback, retaining each app's original file-change handler.
   File selection is not represented as model inference or clinical file parsing. */
(() => {
 'use strict';
 function ready(){
  document.querySelectorAll('.mc-upload-zone').forEach(zone=>{
   const declared=zone.dataset.mcDrop;
   const input=(declared&&document.getElementById(declared))||zone.querySelector('input[type=file]')||zone.parentElement.querySelector('input[type=file]');
   if(!input)return;
   const error=document.createElement('span');error.className='mc-upload-error';error.setAttribute('role','alert');error.hidden=true;zone.after(error);
   const match=f=>{const accepts=(input.accept||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return !accepts.length||accepts.some(a=>a[0]==='.'?f.name.toLowerCase().endsWith(a):a.endsWith('/*')?f.type.startsWith(a.slice(0,-1)):f.type===a);};
   zone.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();zone.classList.add('is-dragover');});
   zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('is-dragover');});
   zone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('is-dragover');const files=[...e.dataTransfer.files];if(!files.length)return;error.hidden=true;if(files.some(f=>!match(f))){error.hidden=false;error.textContent='Định dạng chưa được hỗ trợ. Chọn tệp: '+input.accept;return;}if(!input.multiple&&files.length>1){error.hidden=false;error.textContent='Vui lòng chọn một tệp mỗi lần.';return;}try{const transfer=new DataTransfer();files.forEach(f=>transfer.items.add(f));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){error.hidden=false;error.textContent='Trình duyệt chưa hỗ trợ kéo thả tại đây. Hãy dùng nút Chọn tệp.';}});
   input.addEventListener('change',()=>{error.hidden=true;zone.classList.toggle('has-file',input.files.length>0);});
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
