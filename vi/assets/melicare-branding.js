/* One renderer for product names in page headers, menus, cards and dialogs. */
(() => {
 'use strict';
 const definitions=[
  ['melior','OR'],['meliocr','OCR'],['melivoice','Voice'],['meliguide','Guide'],
  ['melivlm','VLM'],['melicdss','CDSS'],['melidx','Dx'],['melipos','Pos'],
  ['melimind','Mind'],['melistroke','Stroke'],['melicardio','Cardio'],
  ['melialz','Alz'],['melidiabetes','Diabetes']
 ];
 const products=new Map(definitions.map(([id,suffix])=>[id,{id,suffix,name:'MELI'+suffix}]));
 const aliases=new Map([['melipostop','melipos'],['meliposopt','melipos']]);
 function product(value){const id=String(value).replace(/\s+/g,'').toLowerCase();return products.get(aliases.get(id)||id);}
 function parts(p){return '<span class="meli-prefix mc-product-prefix">MELI</span><span class="tool-suffix mc-product-suffix">'+p.suffix+'</span>';}
 function productHTML(name,extra=''){
  const p=product(name);if(!p)return '';
  const safeClass=String(extra).replace(/[^a-zA-Z0-9_ -]/g,'');
  return '<span class="mc-product-name '+safeClass+'" data-mc-product="'+p.id+'">'+parts(p)+'</span>';
 }
 window.MELICARE_BRAND=Object.freeze({productHTML});
 const selector='.wordmark,.tool-wordmark,.suite-word,.hub-name,.mc-switch-name,.brandText,.meliProductText';
 const ignored='script,style,title,textarea,option,svg,code,pre,kbd,iframe,[contenteditable]:not([contenteditable="false"]),.mc-product-name';
 const pattern=/\bMELI(?:Diabetes|PostOp|PosOpt|Stroke|Cardio|Voice|Guide|Mind|CDSS|VLM|OCR|Alz|Pos|Dx|OR)\b/gi;
 function normalizeLabel(el){
  if(el.classList.contains('mc-product-name')||el.closest('svg'))return;
  const p=product(el.textContent);if(!p)return;
  el.classList.add('mc-product-name');el.dataset.mcProduct=p.id;el.innerHTML=parts(p);
 }
 function normalize(root){
  if(root.nodeType===3){wrap(root);return;}
  if(root.nodeType!==1||root.closest(ignored))return;
  if(root.matches(selector))normalizeLabel(root);
  root.querySelectorAll(selector).forEach(normalizeLabel);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const texts=[];let n;while((n=walker.nextNode()))texts.push(n);
  texts.forEach(wrap);
 }
 function wrap(text){
  const parent=text.parentElement;if(!parent||parent.closest(ignored))return;
  pattern.lastIndex=0;const matches=[...text.data.matchAll(pattern)];if(!matches.length)return;
  const fragment=document.createDocumentFragment();let cursor=0;
  for(const match of matches){
   const p=product(match[0]);if(!p)continue;
   fragment.append(document.createTextNode(text.data.slice(cursor,match.index)));
   const span=document.createElement('span');span.className='mc-product-name';span.dataset.mcProduct=p.id;span.innerHTML=parts(p);fragment.append(span);
   cursor=match.index+match[0].length;
  }
  fragment.append(document.createTextNode(text.data.slice(cursor)));text.replaceWith(fragment);
 }
 function ready(){
  normalize(document.body);
  let scheduled=false;const pending=new Set();
  const observer=new MutationObserver(records=>{
   for(const record of records){
    if(record.type==='characterData')pending.add(record.target);
    else for(const node of record.addedNodes)pending.add(node);
   }
   if(scheduled||!pending.size)return;scheduled=true;
   queueMicrotask(()=>{scheduled=false;const roots=[...pending];pending.clear();roots.forEach(n=>{if(n.isConnected)normalize(n);});});
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
