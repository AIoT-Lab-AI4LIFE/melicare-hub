/* Canonical navigation configuration for the complete MELICARE prototype.
 * Each local page exists exactly once. Change deployment URLs here, not in each menu.
 * This catalogue describes routes only; it does not grant authentication or permissions.
 */
(() => {
 'use strict';
 const apps = [
  {
    "id": "melior",
    "module": "MELIOR",
    "name": "MELIOR",
    "icon": "or",
    "href": "MELI_OR.html",
    "group": "ops",
    "tone": "#1689ba"
  },
  {
    "id": "meliocr",
    "module": "MELIOCR",
    "name": "MELIOCR",
    "icon": "ocr",
    "href": "https://meliocr.meliq.ai/login",
    "group": "ops",
    "tone": "#af801e"
  },
  {
    "id": "melivoice",
    "module": "MELIVoice",
    "name": "MELIVoice",
    "icon": "voice",
    "href": "https://melivoice.meliq.ai/",
    "group": "ops",
    "tone": "#8062ba"
  },
  {
    "id": "meliguide",
    "module": "MELIGuide",
    "name": "MELIGuide",
    "icon": "guide",
    "href": "https://medibot.leira.com.vn/login",
    "group": "ops",
    "tone": "#328b7b"
  },
  {
    "id": "melivlm",
    "module": "MELIVLM",
    "name": "MELIVLM",
    "icon": "vlm",
    "href": "MELI_VLM.html",
    "group": "care",
    "tone": "#5377c1"
  },
  {
    "id": "melicdss",
    "module": "MELICDSS",
    "name": "MELICDSS",
    "icon": "cdss",
    "href": "https://cdss.leira.com.vn/login",
    "group": "care",
    "tone": "#418b88"
  },
  {
    "id": "melidx",
    "module": "MELIDx",
    "name": "MELIDx",
    "icon": "dx",
    "href": "MELIDx.html",
    "group": "care",
    "tone": "#9a69b6"
  },
  {
    "id": "melipos",
    "module": "MELIPos",
    "name": "MELIPos",
    "icon": "pos",
    "href": "MELIPostOp.html",
    "group": "care",
    "tone": "#c26374"
  }
].map(app => Object.freeze(app));
 window.MELICARE_SITE = Object.freeze({
  home: 'MELICARE.html',
  login: 'MELICARE_Login.html',
  directory: 'DANH_SACH_TRANG.html',
  dashboards: Object.freeze({admin:'MELICARE_Dashboard_Admin.html', doctor:'MELICARE_Dashboard_Doctor.html'}),
  clinical: Object.freeze({MELIMind:'MELIMind.html', MELIStroke:'https://stoke-predict.devt.vn/', MELICardio:'MELICardio.html', MELIAlz:'MELIAlz.html', MELIDiabetes:'MELIDiabetes.html', MELIPostOp:'MELIPostOp.html'}),
  apps: Object.freeze(apps),
  byId: Object.freeze(Object.fromEntries(apps.map(app => [app.id,app.href]))),
  modules: Object.freeze(Object.fromEntries(apps.map(app => [app.module,app.href])))
 });
})();
