/* One application-switcher implementation for every tool page.
   All icons are local inline vectors; no icon library, fonts or network is required. */
(() => {
 'use strict';
 const shapes={
  or:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-9 3v5m-2.5-2.5h5"/>',
  ocr:'<path d="M7 3H4v4m13-4h3v4M4 17v4h3m13-4v4h-3M8 7h8M8 11h7M8 15h4"/><circle cx="17" cy="16" r="3"/><path d="m19 18 3 3"/>',
  voice:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
  guide:'<path d="M12 5v16M3 3c4 0 7 .5 9 2 2-1.5 5-2 9-2v16c-4 0-7 .5-9 2-2-1.5-5-2-9-2V3Z"/><path d="M6 7h3m6 0h3M6 11h3m6 0h3"/>',
  vlm:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m5 16 4-4 4 4 3-3 5 5"/><circle cx="15.5" cy="8" r="1.5"/>',
  cdss:'<rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 2h6v4H9zM7 11h3m-3 4h3m3-1 2 2 4-5"/>',
  dx:'<path d="M4 3v5a5 5 0 0 0 10 0V3M4 3h2m6 0h2M9 13v3a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="3"/>',
  pos:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3 12h4l2-4 3 8 2-4h7"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>'
 };
 const apps=window.MELICARE_SITE.apps;
 const svg=key=>`<svg viewBox="0 0 24 24" aria-hidden="true">${shapes[key]}</svg>`;
 function init(){
  const host=document.querySelector('[data-mc-switch]');if(!host)return;
  const button=host.querySelector('button');if(!button)return;
  const panel=document.createElement('nav');panel.id='mc-switch-panel';panel.className='mc-switch-panel';panel.setAttribute('aria-label','Các ứng dụng MELICARE');panel.hidden=true;
  const title=document.createElement('div');title.className='mc-switch-title';title.textContent='Ứng dụng MELICARE';panel.append(title);
  const current=document.body.dataset.mcPage;
  for(const [group,label] of [['ops','Vận hành bệnh viện'],['care','Khám chữa bệnh']]){
   const section=document.createElement('div');section.className='mc-switch-group';
   const heading=document.createElement('p');heading.className='mc-switch-heading';heading.textContent=label;section.append(heading);
   for(const app of apps.filter(x=>x.group===group&&x.id!==current)){
    const a=document.createElement('a');a.href=app.href;a.dataset.mcApp=app.id;a.className='mc-switch-link';
    a.innerHTML=`<span class="mc-switch-icon" style="--app-tone:${app.tone}">${svg(app.icon)}</span><span class="mc-switch-name">${app.name}</span>`;
    if(app.href.startsWith('https:')){
     a.target='_blank';a.rel='noopener noreferrer';
     const ext=document.createElement('span');ext.className='mc-switch-external';ext.innerHTML=svg('external');a.append(ext);
     a.setAttribute('aria-label',app.name+' — mở trong thẻ mới');
     if(app.id==='meliguide'||app.id==='melicdss'){
      a.addEventListener('click',(e)=>{
       if(!window.MELI_AUTH?.openUrl)return;
       e.preventDefault();
       window.MELI_AUTH.openUrl(app.href,{newTab:true});
      });
     }
    }
    section.append(a);
   }panel.append(section);
  }
  document.body.append(panel);
  let open=false;
  function position(){
   const r=button.getBoundingClientRect(),w=Math.min(328,innerWidth-24);
   panel.style.width=w+'px';panel.style.left=Math.max(12,Math.min(innerWidth-w-12,r.right-w))+'px';
   panel.style.top=Math.max(12,Math.min(r.bottom+10,innerHeight-120))+'px';
   panel.style.maxHeight=Math.max(96,innerHeight-parseFloat(panel.style.top)-14)+'px';
  }
  function close(focus=false){open=false;panel.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus({preventScroll:true});}
  function show(focus=false){open=true;position();panel.hidden=false;button.setAttribute('aria-expanded','true');document.dispatchEvent(new Event('melicare:close-account-menu'));if(focus)panel.querySelector('a')?.focus({preventScroll:true});}
  button.addEventListener('click',e=>{e.preventDefault();open?close():show();});
  button.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();show(true);}});
  document.addEventListener('click',e=>{if(open&&!host.contains(e.target)&&!panel.contains(e.target))close();});
  panel.addEventListener('click',e=>{if(e.target.closest('a'))close();});
  document.addEventListener('keydown',e=>{if(open&&e.key==='Escape'){e.preventDefault();close(true);}});
  panel.addEventListener('keydown',e=>{
   const links=[...panel.querySelectorAll('a')],i=links.indexOf(document.activeElement);let next;
   if(e.key==='ArrowDown')next=(i+1)%links.length;if(e.key==='ArrowUp')next=(i-1+links.length)%links.length;
   if(e.key==='Home')next=0;if(e.key==='End')next=links.length-1;
   if(next!==undefined){e.preventDefault();links[next].focus();}
  });
  document.addEventListener('focusin',e=>{if(open&&!host.contains(e.target)&&!panel.contains(e.target))close();});
  window.addEventListener('resize',()=>{if(open)position();});
  window.addEventListener('scroll',()=>{if(open)position();},{passive:true});
  // Keep the local OR menu's current item visible without moving the document.
  document.querySelectorAll('.mc-or-local-nav button').forEach(btn=>btn.addEventListener('click',()=>{
   document.querySelectorAll('.mc-or-local-nav button').forEach(x=>x.setAttribute('aria-current',x===btn?'page':'false'));
  }));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
