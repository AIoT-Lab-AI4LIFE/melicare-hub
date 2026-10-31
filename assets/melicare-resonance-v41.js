/* Brand-aligned hero palette; preserve the three blinking labels and clinical effects. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MeliResonance=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const cycle=18,BLUE='#327fac',GOLD='#f7af3e',INK='#123a58';
function paletteFilter(){return `<filter id="mi-brand-palette" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feColorMatrix in="SourceGraphic" type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0" result="mi-brand-luma"/>
<feComponentTransfer in="mi-brand-luma" result="mi-brand-blue"><feFuncR type="table" tableValues="0.0 0.105882 0.258824 0.54902 0.776471 1.0"/><feFuncG type="table" tableValues="0.0 0.294118 0.560784 0.721569 0.87451 1.0"/><feFuncB type="table" tableValues="0.0 0.439216 0.713725 0.811765 0.921569 1.0"/></feComponentTransfer>
<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -4 0 4 0 -.05" result="mi-blue-mask"/>
<feComposite in="mi-brand-blue" in2="mi-blue-mask" operator="in" result="mi-blue-tinted"/>
<feComposite in="SourceGraphic" in2="mi-blue-mask" operator="out" result="mi-blue-base"/>
<feComposite in="mi-blue-tinted" in2="mi-blue-base" operator="arithmetic" k2="1" k3="1" result="mi-blue-applied"/>
<feComponentTransfer in="mi-brand-luma" result="mi-brand-gold"><feFuncR type="table" tableValues="0.0 0.541176 0.803922 0.968627 1.0"/><feFuncG type="table" tableValues="0.0 0.356863 0.545098 0.686275 1.0"/><feFuncB type="table" tableValues="0.0 0.086275 0.184314 0.243137 1.0"/></feComponentTransfer>
<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.25 5 -2.75 0 -.05" result="mi-gold-hue"/>
<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 0 -5 0 0" result="mi-gold-warm"/>
<feComposite in="mi-gold-hue" in2="mi-gold-warm" operator="in" result="mi-gold-mask"/>
<feComposite in="mi-brand-gold" in2="mi-gold-mask" operator="in" result="mi-gold-tinted"/>
<feComposite in="mi-blue-applied" in2="mi-gold-mask" operator="out" result="mi-gold-base"/>
<feComposite in="mi-gold-tinted" in2="mi-gold-base" operator="arithmetic" k2="1" k3="1"/>
</filter>`;}
const f=x=>Number(x.toFixed(3));
const timeAt=t=>((t%cycle)+cycle)%cycle;
function path(d,fill='none',stroke='none',width=2,extra=''){return`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`}
function voiceAt(seconds,reduced=false){const t=timeAt(seconds);return Array.from({length:9},(_,i)=>{const envelope=.32+.68*Math.sin(Math.PI*(i+1)/10),pulse=reduced?.55:.22+.78*(.5+.5*Math.sin(2*Math.PI*(t/1.5+i*.13))),height=3+17*envelope*pulse;return{index:i,x:1316+i*4.8,y:574-height/2,height,opacity:.85}})}
function voiceMarkup(q){return`<rect data-voice-bar="${q.index}" x="${f(q.x)}" y="${f(q.y)}" width="2.8" height="${f(q.height)}" rx="1.2" fill="${q.index===4?GOLD:BLUE}" opacity="${q.opacity}"/>`}
const scheduleRows=[
 {d:'M324 456L407 468',color:BLUE},{d:'M324 467L407 479',color:GOLD},
 {d:'M324 478L407 490',color:BLUE},{d:'M324 489L407 501',color:GOLD}
];
function scheduleAt(seconds,reduced=false){const t=timeAt(seconds);return scheduleRows.map((r,i)=>({index:i,opacity:reduced?.55:.18+.72*Math.pow(.5+.5*Math.sin(2*Math.PI*(t/3-i*.18)),2)}))}
function scheduleMarkup(q){const r=scheduleRows[q.index];return path(r.d,'none',r.color,2.8,`data-schedule-row="${q.index}" opacity="${f(q.opacity)}" stroke-dasharray="12 5"`)}
const lesionRegions=[
 {id:'brain',center:[764,452],phase:0,clip:'M754 428C741 430 733 446 733 461C733 479 741 491 754 493C769 493 778 478 779 462C779 446 771 431 754 428Z',shape:'M761 443C767 440 772 446 770 453C768 459 762 461 758 456C753 452 755 446 761 443Z'},
 {id:'lung',center:[838,479],phase:1.1,clip:'M819 440C809 441 802 453 800 467C798 478 801 486 810 487C816 483 818 472 819 460Z M826 441C836 444 844 457 847 471C850 485 844 490 835 488C828 483 826 470 825 457Z',shape:'M836 470C842 468 847 473 845 481C844 487 839 490 835 485C831 481 832 474 836 470Z'}
];
function lesionAt(seconds,reduced=false){const t=timeAt(seconds);return lesionRegions.map((r,i)=>({id:r.id,index:i,opacity:reduced?.62:.32+.62*(.5-.5*Math.cos(2*Math.PI*(t+r.phase)/3))}))}
function lesionMarkup(q){const r=lesionRegions[q.index],[x,y]=r.center;return`<g data-lesion-zone="${r.id}" clip-path="url(#mi-lesion-${r.id})" opacity="${f(q.opacity)}">${path(r.shape,GOLD,'none',0,'filter="url(#mi-lesion-halo)"')}${path(r.shape,GOLD,'#fff0ad',.8,'opacity=".78"')}${path(r.shape,'#fff5c2','none',0,`opacity=".85" transform="translate(${x} ${y}) scale(.48) translate(${-x} ${-y})" filter="url(#mi-lesion-soft)"`)}</g>`}
const zoneLabels=[
 {id:'operations',lead:"operations ",accent:"optimized",curve:'M65 879C210 1009 496 1092 744 1030'},
 {id:'clinical',x:800,y:700,lead:"diagnosis ",accent:"accurate",stacked:true},
 {id:'aftercare',lead:"care ",accent:"intelligent",curve:'M1015 982C1232 1063 1461 1049 1530 914'}
];
function labelAt(seconds,reduced=false){const t=timeAt(seconds);return zoneLabels.map((r,i)=>({id:r.id,index:i,opacity:reduced?1:.64+.36*Math.cos(2*Math.PI*(t-i)/3)}))}
function zoneLabelMarkup(seconds=0,reduced=false){const labels=labelAt(seconds,reduced);return'<g class="mi-zone-labels" aria-hidden="true">'+zoneLabels.map((r,i)=>{
 if(r.curve)return`<g data-zone-label="${r.id}" opacity="${f(labels[i].opacity)}"><text text-anchor="middle" fill="${INK}" font-family="Plus Jakarta Sans,Poppins,Arial,sans-serif" font-size="34" font-weight="500" letter-spacing="-.9"><textPath xlink:href="#mi-label-${r.id}" href="#mi-label-${r.id}" startOffset="50%">${r.lead}<tspan fill="${GOLD}">${r.accent}</tspan></textPath></text></g>`;
 const text=r.stacked?`<tspan x="0">${r.lead.trim()}</tspan><tspan x="0" dy="41" fill="${GOLD}">${r.accent}</tspan>`:`${r.lead}<tspan fill="${GOLD}">${r.accent}</tspan>`;
 return`<g data-zone-label="${r.id}" opacity="${f(labels[i].opacity)}" transform="translate(${r.x} ${r.y})"><text x="0" y="0" text-anchor="middle" fill="${INK}" font-family="Plus Jakarta Sans,Poppins,Arial,sans-serif" font-size="34" font-weight="500" letter-spacing="-.9">${text}</text></g>`;
}).join('')+'</g>'}
function render(seconds=0,options={}){
 const reduced=!!options.reduced,t=timeAt(seconds),art=options.art||'assets/illustrations/melicare-hospital-v38.png';
 const clips=lesionRegions.map(r=>`<clipPath id="mi-lesion-${r.id}">${path(r.clip,'white')}</clipPath>`).join('')+zoneLabels.filter(r=>r.curve).map(r=>path(r.curve,'none','none',0,`id="mi-label-${r.id}"`)).join('');
 const defs=`<defs>${paletteFilter()}<filter id="mi-lesion-halo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.2"/></filter><filter id="mi-lesion-soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation=".8"/></filter>${clips}<image id="mi-art" width="1536" height="1024" preserveAspectRatio="xMidYMid meet" style="image-rendering:auto" xlink:href="${art}"/></defs>`;
 const overlays=`<g aria-hidden="true">${voiceAt(t,reduced).map(voiceMarkup).join('')}${scheduleAt(t,reduced).map(scheduleMarkup).join('')}${lesionAt(t,reduced).map(lesionMarkup).join('')}</g>`;
 return`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1536 1080" class="mc-resonance-scene mc-illustrated-scene" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" role="img" aria-labelledby="mi-title mi-desc"><title id="mi-title">Optimized operations · Accurate diagnosis · Intelligent care</title><desc id="mi-desc">Three text groups glow gently in sequence. Text and effects use SVG vectors over a full 1536-pixel image.</desc>${defs}<use xlink:href="#mi-art" filter="url(#mi-brand-palette)"/>${overlays}${zoneLabelMarkup(t,reduced)}</svg>`;
}
return{paletteFilter,cycle,timeAt,voiceAt,scheduleRows,scheduleAt,lesionRegions,lesionAt,zoneLabels,labelAt,zoneLabelMarkup,render};
});

(function(){
'use strict';
const host=document.querySelector('[data-melicare-resonance]');if(!host||typeof MeliResonance==='undefined')return;
const M=MeliResonance,svg=host.querySelector('svg');if(!svg)return;
const media=matchMedia('(prefers-reduced-motion: reduce)');
const voice=[...svg.querySelectorAll('[data-voice-bar]')],schedule=[...svg.querySelectorAll('[data-schedule-row]')],lesions=[...svg.querySelectorAll('[data-lesion-zone]')];
const labels=[...svg.querySelectorAll('[data-zone-label]')];
let time=0,visible=true,last=0,drawn=0,raf=0;
function draw(){
 M.voiceAt(time,media.matches).forEach((q,i)=>{voice[i].setAttribute('height',q.height);voice[i].setAttribute('y',q.y)});
 M.scheduleAt(time,media.matches).forEach((q,i)=>schedule[i].setAttribute('opacity',q.opacity));
 M.lesionAt(time,media.matches).forEach((q,i)=>lesions[i].setAttribute('opacity',q.opacity));
 M.labelAt(time,media.matches).forEach((q,i)=>labels[i].setAttribute('opacity',q.opacity));
}
function tick(now){if(!last)last=now;const dt=Math.min((now-last)/1000,.1);last=now;if(visible&&!media.matches){time+=dt;if(now-drawn>=16){draw();drawn=now}}if(!document.hidden&&visible&&!media.matches)raf=requestAnimationFrame(tick)}
function start(){cancelAnimationFrame(raf);last=0;if(!document.hidden&&visible&&!media.matches)raf=requestAnimationFrame(tick)}
if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;start()},{rootMargin:'100px'});io.observe(host)}
document.addEventListener('visibilitychange',start);media.addEventListener('change',()=>{draw();start()});draw();start();
})();
