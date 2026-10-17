/* Single source of truth for every MELICARE destination.
 * Change a URL here and the homepage, dashboards, app switcher, MELIDx menus and page directory all follow.
 *   href   absolute https URL (external app, opens in a new tab) or a local page.
 *   group  ops | care → listed in the app switcher; dx → MELIDx sub-tool.
 *   sso    true → MELI_AUTH appends ?token=<access token> when opening (see meli-auth.js).
 * Markup links with <a data-mc-route="<id or module>">; scripts call MELICARE_SITE.open(id).
 * This catalogue describes routes only; it does not grant authentication or permissions.
 */
(() => {
 'use strict';
 const routes = [
  {id:'melior',    module:'MELIOR',    name:'MELIOR',    icon:'or',    href:'MELI_OR.html',                       group:'ops',  tone:'#1689ba'},
  {id:'meliocr',   module:'MELIOCR',   name:'MELIOCR',   icon:'ocr',   href:'https://meliocr.meliq.ai/login',     group:'ops',  tone:'#af801e', sso:true},
  {id:'melivoice', module:'MELIVoice', name:'MELIVoice', icon:'voice', href:'https://melivoice.meliq.ai/login',   group:'ops',  tone:'#8062ba', sso:true},
  {id:'meliguide', module:'MELIGuide', name:'MELIGuide', icon:'guide', href:'https://medibot.leira.com.vn/login', group:'ops',  tone:'#328b7b', sso:true},
  {id:'melivlm',   module:'MELIVLM',   name:'MELIVLM',   icon:'vlm',   href:'MELI_VLM.html',                      group:'care', tone:'#5377c1'},
  {id:'melicdss',  module:'MELICDSS',  name:'MELICDSS',  icon:'cdss',  href:'https://cdss.leira.com.vn/login',    group:'care', tone:'#418b88', sso:true},
  {id:'melidx',    module:'MELIDx',    name:'MELIDx',    icon:'dx',    href:'MELIDx.html',                        group:'care', tone:'#9a69b6'},
  {id:'melipos',   module:'MELIPos',   name:'MELIPos',   icon:'pos',   href:'MELIPostOp.html',                    group:'care', tone:'#c26374'},
  {id:'melimind',     module:'MELIMind',     name:'MELI Mind',     href:'MELIMind.html',                   group:'dx'},
  {id:'melistroke',   module:'MELIStroke',   name:'MELI Stroke',   href:'https://stoke-predict.devt.vn/',  group:'dx'},
  {id:'melicardio',   module:'MELICardio',   name:'MELI Cardio',   href:'MELICardio.html',                 group:'dx'},
  {id:'melialz',      module:'MELIAlz',      name:'MELI Alz',      href:'MELIAlz.html',                    group:'dx'},
  {id:'melidiabetes', module:'MELIDiabetes', name:'MELI Diabetes', href:'MELIDiabetes.html',               group:'dx'}
 ].map(route => Object.freeze(route));

 const lookup = new Map();
 for (const route of routes) {
  lookup.set(route.id, route);
  lookup.set(route.module, route);
 }
 const isExternal = href => /^https?:\/\//i.test(href);
 const find = key => lookup.get(key) || null;
 const href = key => find(key)?.href || null;

 // External apps open in a new tab everywhere; local pages replace the current one.
 function open(key) {
  const target = href(key) || String(key || '');
  if (!target) return;
  const newTab = isExternal(target);
  if (window.MELI_AUTH?.openUrl) return window.MELI_AUTH.openUrl(target, {newTab});
  if (newTab) window.open(target, '_blank', 'noopener,noreferrer');
  else location.assign(target);
 }

 function applyLink(a, key) {
  const target = href(key);
  if (!target) return;
  a.href = target;
  if (isExternal(target)) {
   a.target = '_blank';
   a.rel = 'noopener noreferrer';
  } else {
   a.removeAttribute('target');
   a.removeAttribute('rel');
  }
 }

 function bindLinks(root = document) {
  root.querySelectorAll('a[data-mc-route]').forEach(a => applyLink(a, a.dataset.mcRoute));
 }

 window.MELICARE_SITE = Object.freeze({
  home: 'MELICARE.html',
  login: 'MELICARE_Login.html',
  directory: 'DANH_SACH_TRANG.html',
  dashboards: Object.freeze({admin:'MELICARE_Dashboard_Admin.html', doctor:'MELICARE_Dashboard_Doctor.html'}),
  routes: Object.freeze(routes),
  apps: Object.freeze(routes.filter(route => route.group === 'ops' || route.group === 'care')),
  dx: Object.freeze(routes.filter(route => route.group === 'dx')),
  byId: Object.freeze(Object.fromEntries(routes.map(route => [route.id, route.href]))),
  modules: Object.freeze(Object.fromEntries(routes.map(route => [route.module, route.href]))),
  find,
  href,
  isExternal,
  open,
  applyLink,
  bindLinks
 });

 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bindLinks());
 else bindLinks();
})();
