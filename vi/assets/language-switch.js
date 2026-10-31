(()=>{
'use strict';
if(window.self!==window.top)return;
const vi=document.documentElement.lang==='vi';
const file=decodeURIComponent(location.pathname.split('/').pop()||'index.html');
const nav=document.createElement('nav');nav.className='mc-language-switch';nav.setAttribute('aria-label',vi?'Chọn ngôn ngữ':'Choose language');
for(const [lang,label] of [['en','English'],['vi','Tiếng Việt']]){
 const a=document.createElement('a');a.textContent=lang.toUpperCase();a.lang=lang;a.hreflang=lang;a.title=label;a.setAttribute('aria-label',label);
 const selected=(vi?'vi':'en')===lang;
 if(selected)a.setAttribute('aria-current','true');
 const target=selected?file:vi?'../'+file:'vi/'+file;
 const url=new URL(target,location.href);url.search=location.search;url.hash=location.hash;a.href=url.href;
 nav.append(a);
}
const host=document.querySelector('.header-actions')||document.querySelector('.topbar-right')||document.querySelector('.mc-login-nav');
if(host){host.prepend(nav);nav.classList.add('mc-language-inline');}else{document.body.append(nav);nav.classList.add('mc-language-floating');}
})();