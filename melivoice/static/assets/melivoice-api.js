/* MELI Voice — nối giao diện với MeliVoice_Backend (FastAPI). Dùng chung cho MELI_Voice.html và MELIVoice.html.
   Đổi địa chỉ backend: đặt window.MELI_VOICE_API trước khi nạp file này. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search).get('api');
  var API = (qs || window.MELI_VOICE_API || (/^https?:$/.test(location.protocol) ? location.origin : 'http://localhost:8765')).replace(/\/$/, '');
  var $ = function (id) { return document.getElementById(id); };
  var cur = null;          // bản ghi đang mở
  var recorder = null, chunks = [], recBlob = null, recTimer = null, recSec = 0;
  var audioEl = null, recStream = null, audioIcon = null;
  var STATUS = { pending: 'Chưa xử lý', processed: 'Chờ bác sĩ kiểm tra', draft: 'Đang chỉnh sửa', confirmed: 'Đã lưu EMR' };
  var TOP_KEYS = ['hanh_chinh', 'ly_do_vao_vien', 'qua_trinh_benh_ly', 'tien_su', 'kham_luc_vao',
    'can_lam_sang_de_cap', 'chan_doan', 'xu_tri', 'dien_bien_bien_chung', 'ket_cuc'];
  var LIST_DEFAULT = { 'xu_tri.thuoc_dieu_tri': true };
  var EMPTY_TEXT = 'Thông tin không được tìm thấy';   // chữ mờ hiển thị trong mọi ô không có nội dung
  var patientCodeInput = document.querySelector('[data-gt2="patient_code"]');
  if (patientCodeInput) {
    patientCodeInput.closest('.field').insertAdjacentHTML('afterend',
      '<div class="field"><label for="mvPatientId">Patient ID</label><input id="mvPatientId" data-gt2="patient_id" maxlength="128" placeholder="Bác sĩ nhập Patient ID" autocomplete="off"/><small>Mã bệnh nhân trong hệ thống. Để trống sẽ lưu tạm.</small></div>');
  }
  var emrBody = document.querySelector('#result .emr .body') || document.querySelector('#result [data-gt2="patient_name"]')?.closest('.body');
  if (emrBody) emrBody.insertAdjacentHTML('afterbegin', '<div id="mvStorageTags" class="mvStorageTags" role="status" aria-live="polite"></div>');
  var confirmButton = document.querySelector('#result .save .btn.primary');
  if (confirmButton) {
    confirmButton.textContent = 'Lưu EMR & MeliData';
    confirmButton.closest('.save').insertAdjacentHTML('beforebegin', '<p class="mvStorageConsent">Bấm “Lưu EMR & MeliData” là đồng ý lưu bệnh án vào MeliData. Thiếu Patient ID, hồ sơ được giữ ở kho tạm để bổ sung sau.</p>');
  }

  function storageTags(rec) {
    var input = $('mvPatientId');
    var patientId = input && cur && cur.id === rec.id ? input.value.trim() : (rec.patient_id || '').trim();
    // A generated fixture identifier does not count as an ID entered by the physician.
    var missing = !patientId || (rec.patient_id_temporary && patientId === rec.patient_id);
    return missing ? '<span class="mvStorageTag incomplete">Thiếu patient_id</span>' : '';
  }
  function renderStorageTags() { var tags = $('mvStorageTags'); if (tags && cur) tags.innerHTML = storageTags(cur); }
  if ($('mvPatientId')) $('mvPatientId').addEventListener('input', renderStorageTags);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* nhóm trường có ít nhất một giá trị thật (bỏ qua {gioi_tinh: null}, [], '') */
  function hasVal(v) {
    if (v == null || v === '') return false;
    if (typeof v === 'object') return Object.keys(v).some(function (k) { return hasVal(v[k]); });
    return true;
  }
  function fmtTime(sec) { sec = Math.round(sec || 0); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
  function fmtDate(iso) {
    var d = new Date(iso); if (isNaN(d)) return iso || '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  /* gọi API kèm access token (melivoice-auth.js); 401 sau khi làm mới thì trang tự về /login */
  function send(path, opt) {
    return window.MELIVOICE_AUTH.fetch(API + path, opt).then(function (r) {
      if (r.ok) return r;
      return r.json().catch(function () { return {}; }).then(function (j) {
        var err = new Error(j.detail || ('Lỗi máy chủ ' + r.status)); err.status = r.status; throw err;
      });
    });
  }
  function api(path, opt) { return send(path, opt).then(function (r) { return r.json(); }); }
  function saveBlob(blob, name) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = u; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(u); }, 500);
  }
  function offline(e) {
    if (e && e.status === 401) return;   // đang chuyển về trang đăng nhập
    notify('error', 'Không kết nối được máy chủ', 'Hãy kiểm tra backend MELI Voice đang chạy rồi thử lại.',
      { details: [['Máy chủ', API], ['Chi tiết', e && e.message || String(e)]] });
  }

  /* hộp thoại trong trang (alert()/confirm() của trình duyệt bị chặn khi trang nằm trong iframe portal)
     o: { tone, title, subtitle, message, details: [[nhãn, giá trị], ...], note, okLabel, cancelLabel, mustType }
     tone: danger | error | warn | success | info; cancelLabel = null -> chỉ có một nút (thông báo)
     mustType: người dùng phải gõ đúng chuỗi này thì nút xác nhận mới bật */
  var ICONS = {
    danger: '<path d="M3 6h18M8 6V4h8v2m2 0-1 14H7L6 6m4 5v6m4-6v6"></path>',
    error: '<circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6m0-6-6 6"></path>',
    warn: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path>',
    success: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12.5 2.8 2.8L16.5 9.5"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5m0-8h.01"></path>'
  };
  function askConfirm(o) {
    var mustType = o.mustType, tone = o.tone || 'danger', alone = o.cancelLabel === null;
    return new Promise(function (resolve) {
      var old = $('mvConfirm'); if (old) old.remove();   // không chồng hai hộp thoại
      var box = document.createElement('div');
      box.className = 'mvConfirm'; box.id = 'mvConfirm';
      box.innerHTML = '<div class="mvConfirmCard mvTone-' + tone + '" role="' + (tone === 'success' || tone === 'info' ? 'dialog' : 'alertdialog') + '" aria-modal="true" aria-labelledby="mvConfirmTitle" aria-describedby="mvConfirmDesc">' +
        '<div class="mvConfirmHead"><div class="mvConfirmIcon"><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" viewBox="0 0 24 24">' + ICONS[tone] + '</svg></div>' +
        '<div class="mvConfirmHeadText"><h3 id="mvConfirmTitle">' + esc(o.title) + '</h3>' + (o.subtitle ? '<p>' + esc(o.subtitle) + '</p>' : '') + '</div>' +
        '<button class="mvConfirmClose" data-ans="0" type="button" aria-label="Đóng"><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"></path></svg></button></div>' +
        '<div class="mvConfirmBody" id="mvConfirmDesc">' +
        (o.message ? '<p class="mvConfirmMsg">' + esc(o.message) + '</p>' : '') +
        (o.details && o.details.length ? '<dl class="mvConfirmDetails">' + o.details.map(function (d) {
          return '<div><dt>' + esc(d[0]) + '</dt><dd>' + (esc(d[1]) || '—') + '</dd></div>';
        }).join('') + '</dl>' : '') +
        (o.note ? '<p class="mvConfirmNote"><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path></svg><span>' + esc(o.note) + '</span></p>' : '') +
        (mustType ? '<label class="mvConfirmType"><span>Gõ lại tên file <code>' + esc(mustType) + '</code> để xác nhận</span>' +
          '<span class="mvConfirmField"><input type="text" autocomplete="off" spellcheck="false" placeholder="Nhập tên file"/>' +
          '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"></path></svg></span></label>' : '') +
        '</div><div class="mvConfirmActions">' + (alone ? '' : '<button class="btn" data-ans="0" type="button">' + esc(o.cancelLabel || 'Huỷ') + '</button>') +
        '<button class="btn ' + (tone === 'danger' ? 'mvConfirmDanger' : 'primary mvConfirmOk') + '" data-ans="1" type="button"' + (mustType ? ' disabled' : '') + '>' + esc(o.okLabel || 'Đã hiểu') + '</button></div></div>';
      var input = box.querySelector('input'), ok = box.querySelector('[data-ans="1"]');
      function matched() { return !mustType || input.value.trim() === mustType; }
      function close(ans) { document.removeEventListener('keydown', onKey, true); box.remove(); resolve(ans ? (input ? input.value.trim() : true) : false); }
      if (input) {
        input.addEventListener('input', function () { ok.disabled = !matched(); input.classList.toggle('ok', matched()); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && matched()) close(true); });
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(false); } }
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ans]');
        if (b && !b.disabled) close(b.getAttribute('data-ans') === '1');
        else if (e.target === box) close(false);   // bấm ra ngoài = huỷ
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(box);
      // không có ô nhập thì trỏ vào Huỷ, tránh Enter xoá nhầm; hộp thông báo thì trỏ vào nút duy nhất
      (input || box.querySelector('.mvConfirmActions [data-ans="0"]') || ok).focus();
    });
  }
  /* thông báo một nút, thay cho alert() */
  function notify(tone, title, message, extra) {
    return askConfirm(Object.assign({ tone: tone, title: title, message: message, cancelLabel: null }, extra));
  }

  /* ---------- đọc/ghi giá trị theo đường dẫn GT2 ---------- */
  function getPath(o, path) {
    return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o);
  }
  function setPath(o, path, v) {
    var ks = path.split('.'), a = o;
    ks.slice(0, -1).forEach(function (k) { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; });
    a[ks[ks.length - 1]] = v;
  }
  function toText(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('\n');
    if (typeof v === 'object') return Object.keys(v).map(function (k) { return v[k] == null ? '' : v[k]; }).filter(String).join(' · ');
    return String(v);
  }

  /* ---------- các danh sách có cấu trúc (cận lâm sàng, thủ thuật) ---------- */
  var LISTS = {
    'can_lam_sang_de_cap': ['ten', 'ket_qua', 'text'],
    'xu_tri.thu_thuat': ['method', 'phuong_phap_vo_cam', 'text']
  };
  function listBox(key) {
    var i = document.querySelector('[data-gt2="' + key + '[0].' + LISTS[key][0] + '"]');
    return i && i.closest('.field.full');
  }
  function renderList(key, arr) {
    var box = listBox(key); if (!box) return;
    var labels = {}; var first = box.querySelector(':scope > .grid').querySelectorAll(':scope > .field > label');
    LISTS[key].forEach(function (k, n) { labels[k] = first[n] ? first[n].textContent : k; });
    if (!box._labels) box._labels = labels; else labels = box._labels;
    if (!box._title) box._title = box.querySelector(':scope > label').textContent;
    if (!Array.isArray(arr) || !arr.length) arr = [{}];
    box.innerHTML = '<label>' + esc(box._title) + '</label>' + arr.map(function (it, i) {
      if (typeof it !== 'object' || it == null) it = { text: it };
      return '<div class="grid" style="margin-bottom:10px">' + LISTS[key].map(function (k) {
        return '<div class="field"><label>' + esc(labels[k]) + '</label><input data-gt2="' + key + '[' + i + '].' + k +
          '" value="' + esc(it[k]) + '" placeholder="' + EMPTY_TEXT + '"/></div>';
      }).join('') + '</div>';
    }).join('');
  }
  function readList(key) {
    var out = [], n = 0, ks = LISTS[key];
    while (document.querySelector('[data-gt2="' + key + '[' + n + '].' + ks[0] + '"]')) {
      var it = {}, any = false;
      ks.forEach(function (k) {
        var v = document.querySelector('[data-gt2="' + key + '[' + n + '].' + k + '"]').value.trim();
        it[k] = v || null; if (v) any = true;
      });
      if (any) out.push(it); n++;
    }
    return out.length ? out : null;
  }

  /* ---------- đổ dữ liệu bản ghi ra form ---------- */
  function fillForm(rec) {
    var emr = rec.emr || rec.gt2 || {};
    var meta = { patient_name: rec.patient_name, patient_code: rec.patient_code, patient_id: rec.patient_id, doctor: rec.doctor, department: rec.department };
    var empty = 0;
    document.querySelectorAll('[data-gt2]').forEach(function (el) {
      var k = el.getAttribute('data-gt2');
      if (/\[\d+\]/.test(k) || k === 'thuc_the_lam_sang') return;
      var v = k in meta ? meta[k] : getPath(emr, k);
      el.value = toText(v);
      el.placeholder = k === 'patient_id' ? 'Bác sĩ nhập Patient ID' : EMPTY_TEXT;
      if (!(k in meta) && !el.value) empty++;
    });
    Object.keys(LISTS).forEach(function (k) { renderList(k, getPath(emr, k)); });
    var badge = document.querySelector('#result .head span');
    if (badge) badge.textContent = empty ? empty + ' trường chưa có dữ liệu' : 'Đủ dữ liệu';
  }
  function collect() {
    var base = JSON.parse(JSON.stringify((cur && (cur.emr || cur.gt2)) || {}));
    var out = {};
    document.querySelectorAll('[data-gt2]').forEach(function (el) {
      var k = el.getAttribute('data-gt2');
      if (/\[\d+\]/.test(k) || /^(patient_|doctor$|department$)/.test(k)) return;
      if (k === 'thuc_the_lam_sang') { setPath(out, k, null); return; }
      var t = el.value.trim(), orig = getPath(base, k), v;
      if (!t) v = null;
      else if (k === 'hanh_chinh.tuoi' && /^\d+$/.test(t)) v = parseInt(t, 10);
      else if (Array.isArray(orig) || LIST_DEFAULT[k]) v = t.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      else v = t;
      setPath(out, k, v);
    });
    Object.keys(LISTS).forEach(function (k) { setPath(out, k, readList(k)); });
    return out;
  }
  function meta() {
    var g = function (k) { var e = document.querySelector('[data-gt2="' + k + '"]'); return e ? e.value.trim() : ''; };
    return { patient_name: g('patient_name'), patient_code: g('patient_code'), patient_id: g('patient_id'), doctor: g('doctor'), department: g('department') };
  }

  /* ---------- hiển thị kết quả ---------- */
  function renderTranscript(rec) {
    var box = $('transcript'); if (!box) return;
    var t = (rec.transcript || '').trim();
    function notice(kind, title, detail) {
      box.innerHTML = '<div class="mvTxNotice ' + kind + '"><b>' + title + '</b><span>' + detail + '</span></div>';
    }
    if (rec.transcript_status === 'audio_error') {
      notice('audioErr', '⚠ Lỗi âm thanh: AI không nhận diện được nội dung',
        (rec.audio_note ? 'AI ghi nhận: ' + esc(rec.audio_note) + '.<br/>' : '') +
        'Bản ghi âm vẫn được lưu. Hãy nghe lại bản ghi và tự nhập thông tin vào các trường EMR.');
      if (t) box.insertAdjacentHTML('beforeend', '<p>' + esc(t) + '</p>');
      return;
    }
    if (!t) return notice('empty', 'Chưa có nội dung nhận diện', 'Bản ghi này chưa có nội dung nhận diện.');
    var parts = t.split(/\n+/).filter(Boolean);
    if (parts.length < 2) parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
    box.innerHTML = parts.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
  }
  function setupAudio(rec) {
    if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); audioEl = null; }
    var btn = document.querySelector('#result .audio button');
    var dur = document.querySelector('#result .audio b');
    if (dur) dur.textContent = fmtTime(rec.duration);
    if (!btn) return;
    btn.removeAttribute('data-ui-icon'); btn.classList.remove('ui-icon-only');   // icon CSS chồng lên icon của nút
    var PLAY = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>';
    var PAUSE = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    function icon(playing) { btn.innerHTML = playing ? PAUSE : PLAY; btn.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát bản ghi'); }
    audioIcon = icon;
    icon(false);
    function toggle() {
      if (!audioEl.paused) { audioEl.pause(); icon(false); return; }
      audioEl.play().then(function () { icon(true); }).catch(function () {
        icon(false); notify('warn', 'Không phát được âm thanh', 'Trình duyệt không phát được bản ghi âm này.');
      });
    }
    btn.onclick = function () {
      if (audioEl) { toggle(); return; }
      // <audio> không gửi được header Authorization nên tải file qua fetch rồi phát từ blob
      btn.disabled = true;
      send('/api/records/' + rec.id + '/audio').then(function (r) { return r.blob(); }).then(function (b) {
        if (cur !== rec) return;
        audioEl = new Audio(URL.createObjectURL(b));
        audioEl.onended = function () { icon(false); };
        toggle();
      }).catch(offline).then(function () { btn.disabled = false; });
    };
  }
  /* rời khung kết quả (sang trang khác, quay lại lịch sử, xử lý file mới, đóng trang) thì tắt âm thanh */
  function stopAudio() {
    if (audioEl && !audioEl.paused) { audioEl.pause(); if (audioIcon) audioIcon(false); }
  }
  (function () {
    var result = $('result'), capture = $('capture');
    if (!result || !capture || !window.MutationObserver) return;
    new MutationObserver(function () {
      if (result.classList.contains('hidden') || !capture.classList.contains('active')) stopAudio();
    }).observe(capture, { attributes: true, attributeFilter: ['class'], subtree: true });
    window.addEventListener('pagehide', stopAudio);
    // bấm menu (kể cả "Ghi âm" khi đang xem bản ghi: khung kết quả vẫn nằm trong trang này nên không bị ẩn)
    var show = window.page;
    if (typeof show === 'function') window.page = function () { stopAudio(); return show.apply(this, arguments); };
  })();

  function showRecord(rec, fromHistory) {
    cur = rec;
    var draftBtn = document.querySelector('#result .save .btn:not(.primary)');
    if (draftBtn) {   // đã chốt thì không lưu ngược về bản nháp
      draftBtn.disabled = rec.status === 'confirmed';
      draftBtn.title = rec.status === 'confirmed' ? 'Bản ghi đã chốt (đã nhập EMR), không thể chuyển lại thành bản nháp' : '';
    }
    fillForm(rec); renderTranscript(rec); setupAudio(rec); renderStorageTags();
    var hd = document.querySelector('.resultOnlyBack div');
    if (hd) hd.innerHTML = '<b>' + (rec.status === 'confirmed' ? 'Đã lưu EMR' : 'Kết quả đã xử lý') + '</b> · ' + (esc(rec.patient_name) || 'Chưa nhập tên') + ' · ' + esc(rec.patient_code);
    var navs = document.querySelectorAll('.nav');
    if (typeof page === 'function') page('capture', navs[0]);
    var cap = $('capture');
    if (cap) cap.classList.toggle('resultOnlyMode', !!fromHistory);
    $('historyProcessing').classList.add('hidden');
    $('processing').classList.add('hidden');
    $('result').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- lịch sử ---------- */
  var searchTimer = null;
  function loadHistory() {
    var q = document.querySelector('#history .tools input');
    var url = '/api/records' + (q && q.value.trim() ? '?q=' + encodeURIComponent(q.value.trim()) : '');
    return api(url).then(function (rows) {
      var tb = document.querySelector('#history tbody'); if (!tb) return;
      if (!rows.length) { tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8a98a8">Chưa có bản ghi nào.</td></tr>'; return; }
      var eye = '<span class="actionIcon"><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg></span>';
      var spark = '<span class="actionIcon"><svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"></path><path d="M20 2v4m-2-2h4"></path></svg></span>';
      var trash = '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2m2 0-1 14H7L6 6m4 5v6m4-6v6"></path></svg>';
      tb.innerHTML = rows.map(function (r) {
        var done = r.status !== 'pending', groups = 0;
        if (r.emr || r.gt2) { var e = r.emr || r.gt2; groups = TOP_KEYS.filter(function (k) { return hasVal(e[k]); }).length; }
        return '<tr' + (done ? '' : ' class="pendingRow"') + '><td>' + fmtDate(r.created_at) + '</td><td><b>' + (esc(r.patient_name) || '<span class="mvMuted">Chưa nhập tên</span>') + '</b><br/><small>' + esc(r.patient_code) +
          '</small></td><td>' + (esc(r.doctor) || '—') + '</td><td>' + (esc(r.department) || '—') + '</td><td>' + (r.source === 'mic' ? '🎙 Ghi trực tiếp' : '⇧ File') +
          '</td><td>' + fmtTime(r.duration) + '</td><td>' + (done ? (r.transcript_status === 'audio_error'
              ? '<span class="mvAudioTag" title="' + esc(r.audio_note || 'AI không nhận diện được nội dung') + '">⚠ Lỗi âm thanh</span>' + (groups ? '<br/><small>' + groups + '/' + TOP_KEYS.length + ' nhóm trường EMR (bác sĩ nhập)</small>' : '')
              : groups + '/' + TOP_KEYS.length + ' nhóm trường EMR')
            : r.error_kind === 'bad_format' ? '<span class="mvErr" title="' + esc(r.error) + '">Định dạng không phù hợp</span>' : '—') +
          '</td><td><span class="badge' + (done ? '' : ' pendingBadge') + (r.status === 'processed' ? ' reviewBadge' : '') + '">' + STATUS[r.status] + '</span><div class="mvStorageTags compact">' + storageTags(r) + '</div></td><td>' +
          (done
            ? '<button class="btn rowFancy viewFancy" data-act="view" data-id="' + r.id + '" type="button">' + eye + '<span>Xem</span><span class="actionArrow">›</span></button>'
            : '<button class="btn rowFancy processFancy" data-act="process" data-id="' + r.id + '" type="button">' + spark + '<span>Xử lý</span><span class="actionArrow">›</span></button>') +
          (r.status === 'confirmed' ? '' :
            '<button class="btn rowDelete" data-act="delete" data-id="' + r.id + '" data-file="' + esc(r.file_name) + '" title="Xoá bản ghi" aria-label="Xoá bản ghi" type="button">' + trash + '</button>') +
          '</td></tr>';
      }).join('');
    });
  }

  /* ---------- tiến trình xử lý ---------- */
  // Backend xử lý đồng bộ, không báo tiến độ thật -> ước lượng theo thời gian chạy thực tế của pipeline
  // (bản ghi ~1 phút: chép lời ~3-10 s, bóc tách ~7-15 s). [bắt đầu từ %, thông báo] cho 4 bước.
  var MSG = [[0, 'Đang tải lên và chuẩn hóa tín hiệu âm thanh...'], [8, 'Đang nhận diện giọng nói và chuyển thành văn bản...'],
    [40, 'Đang bóc tách thông tin lâm sàng từ transcript...'], [85, 'Đang ánh xạ dữ liệu vào các trường EMR...']];
  function setProgress(p, step) {
    $('historyProgressBar').style.width = p + '%'; $('historyProgressText').textContent = Math.round(p) + '%';
    for (var j = 1; j <= 4; j++) { var e = $('ps' + j); e.classList.toggle('done', j < step); e.classList.toggle('active', j === step); }
  }
  function progressUI(on) {
    var cap = $('capture'), hp = $('historyProcessing'), bar = $('historyProgressBar');
    clearInterval(progressUI.iv);
    if (on === false) return;
    if (on === 'done') { setProgress(100, 5); $('processStep').textContent = 'Hoàn tất, đang mở kết quả...'; return; }
    // về 0 ngay, không chạy hiệu ứng lùi từ lượt xử lý trước
    bar.style.transition = 'none'; setProgress(0, 1); void bar.offsetWidth; bar.style.transition = '';
    $('processStep').textContent = MSG[0][1];
    cap.classList.add('resultOnlyMode'); $('result').classList.add('hidden'); hp.classList.remove('hidden');
    var t0 = Date.now();
    progressUI.iv = setInterval(function () {
      var p = 95 * (1 - Math.exp(-(Date.now() - t0) / 9000)), step = 1;   // ~63% sau 9 s, ~90% sau 27 s, không vượt 95%
      for (var i = 0; i < MSG.length; i++) if (p >= MSG[i][0]) step = i + 1;
      setProgress(p, step); $('processStep').textContent = MSG[step - 1][1];
    }, 300);
  }
  function runProcess(promiseFn, fromHistory) {
    var navs = document.querySelectorAll('.nav');
    if (typeof page === 'function') page('capture', navs[0]);
    progressUI(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    return promiseFn().then(function (rec) {
      if (rec.status === 'pending') {
        progressUI(false);
        $('historyProcessing').classList.add('hidden');
        notify('error', 'Xử lý chưa thành công', rec.error || 'Hệ thống chưa xử lý được bản ghi này, vui lòng thử lại sau.',   // lỗi hệ thống: backend không trả chi tiết
          { note: 'Bản ghi được giữ ở “Chưa xử lý” trong Lịch sử để bạn xử lý lại.' });
        if (typeof historyNav === 'function') historyNav();
        loadHistory().catch(function () {});
        return;
      }
      progressUI('done');   // cho thấy 100% một nhịp rồi mới mở kết quả
      return new Promise(function (ok) { setTimeout(ok, 450); }).then(function () {
        showRecord(rec, fromHistory);
        loadHistory().catch(function () {});
      });
    }).catch(function (e) {
      progressUI(false); $('historyProcessing').classList.add('hidden');
      if (e.status === 400) notify('warn', 'Định dạng file không phù hợp', e.message); else offline(e);   // 400: định dạng file không phù hợp
    });
  }

  /* ---------- ghi âm / tải file ---------- */
  function setTimer() { $('timer').textContent = fmtTime(recSec); }
  window.toggleRec = function () {
    var mic = $('mic');
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { notify('warn', 'Không ghi âm được', 'Trình duyệt này không hỗ trợ ghi âm. Hãy dùng “Tải file ghi âm”.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      chunks = []; recBlob = null; recSec = 0; setTimer(); recStream = stream;
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        clearInterval(recTimer); mic.classList.remove('rec');
        recBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        $('rt').textContent = 'Đã dừng ghi âm · ' + fmtTime(recSec);
      };
      recorder.start();
      mic.classList.add('rec'); $('rt').textContent = 'Đang ghi âm...';
      recTimer = setInterval(function () { recSec++; setTimer(); }, 1000);
    }).catch(function (e) {
      notify('error', 'Không truy cập được micro', 'Hãy cho phép trình duyệt dùng micro rồi thử lại.', { details: [['Chi tiết', e.message]] });
    });
  };
  window.resetRec = function () {
    if (recorder && recorder.state === 'recording') { recorder.onstop = function () { recStream && recStream.getTracks().forEach(function (t) { t.stop(); }); }; recorder.stop(); }
    clearInterval(recTimer); recBlob = null; chunks = []; recSec = 0; setTimer();
    $('mic').classList.remove('rec'); $('rt').textContent = 'Bắt đầu ghi âm';
  };
  /* kéo thả file vào khung tải lên: gán vào #audioFile rồi phát sự kiện change như khi chọn file */
  (function () {
    var zone = document.querySelector('[data-mc-drop="audioFile"]'), input = $('audioFile'), depth = 0;
    if (!zone || !input) return;
    var isAudio = function (f) { return /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|opus|webm|flac|amr|3gp|mp4)$/i.test(f.name); };
    var hasFiles = function (e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0; };
    // thả file ra ngoài khung thì trình duyệt sẽ mở file đó và rời trang -> chặn
    ['dragover', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) { if (hasFiles(e)) e.preventDefault(); });
    });
    zone.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth++; zone.classList.add('is-dragover');
    });
    zone.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', function () { if (--depth <= 0) { depth = 0; zone.classList.remove('is-dragover'); } });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; zone.classList.remove('is-dragover');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (!isAudio(f)) { notify('warn', 'File không phải âm thanh', 'Hãy chọn file MP3, WAV, M4A hoặc định dạng âm thanh khác.', { details: [['File', f.name]] }); return; }
      var dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  })();
  window.processAudio = function () {
    var f = $('audioFile').files && $('audioFile').files[0], blob, name, src;
    if (recorder && recorder.state === 'recording') { notify('info', 'Đang ghi âm', 'Hãy dừng ghi âm trước khi xử lý.'); return; }
    if (recBlob && recBlob.size) { blob = recBlob; name = 'ghi-am-' + new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') + '.' + (/ogg/.test(blob.type) ? 'ogg' : /mp4/.test(blob.type) ? 'm4a' : 'webm'); src = 'mic'; }
    else if (f) { blob = f; name = f.name; src = 'file'; }
    else { notify('info', 'Chưa có bản ghi âm', 'Hãy ghi âm hoặc chọn file âm thanh trước khi xử lý.'); return; }
    var fd = new FormData();
    fd.append('file', blob, name); fd.append('source', src);
    runProcess(function () { return api('/api/records', { method: 'POST', body: fd }); }, false).then(function () {
      recBlob = null; $('audioFile').value = ''; $('selected').classList.add('hidden'); $('upProcess').classList.add('hidden');
    });
  };

  /* ---------- các hàm cũ được nối vào API ---------- */
  window.viewProcessed = function () { };               // thay bằng data-act="view" bên dưới
  window.processHistoryItem = function () { };          // thay bằng data-act="process" bên dưới
  window.downloadHistory = function () {
    send('/api/export.csv').then(function (r) { return r.blob(); }).then(function (b) { saveBlob(b, 'meli-voice-history.csv'); }).catch(offline);
  };
  window.downloadCurrent = function () {
    if (!cur) return;
    var txt = 'MELI VOICE — ' + (cur.patient_name || 'Chưa nhập tên') + ' · ' + cur.patient_code + '\n\n[TRANSCRIPT]\n' + (cur.transcript || '') +
      '\n\n[EMR]\n' + JSON.stringify(collect(), null, 2) + '\n';
    saveBlob(new Blob([txt], { type: 'text/plain;charset=utf-8' }), cur.patient_code + '.txt');
  };
  function save(status) {
    if (!cur) return;
    var body = Object.assign({ emr: collect(), status: status }, meta());
    var buttons = document.querySelectorAll('#result .save .btn');
    buttons.forEach(function (button) { button.disabled = true; });
    api('/api/records/' + cur.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (rec) {
        showRecord(rec, $('capture').classList.contains('resultOnlyMode')); loadHistory().catch(function () {});
        var tmp = !rec.patient_id ? { note: 'Hồ sơ đang ở kho tạm vì chưa có Patient ID.' } : {};
        if (rec.melidata_saved) notify('success', status === 'confirmed' ? 'Đã lưu EMR' : 'Đã lưu bản nháp',
          status === 'confirmed' ? 'Bệnh án đã được lưu vào MeliData.' : 'Bản nháp đã được lưu tại MeliData.', tmp);
        else notify('info', 'Đã lưu trên máy', 'Hồ sơ sẽ tự đồng bộ MeliData khi kết nối sẵn sàng.');
      })
      .catch(function (e) { if (e.status === 400 || e.status === 409) notify('error', 'Chưa lưu được hồ sơ', e.message); else offline(e); })
      .finally(function () {
        buttons.forEach(function (button) { button.disabled = false; });
        var draft = document.querySelector('#result .save .btn:not(.primary)');
        if (draft && cur) draft.disabled = cur.status === 'confirmed';
      });
  }

  setInterval(function () {
    if (!cur || document.hidden || $('result').classList.contains('hidden')) return;
    api('/api/records/' + cur.id).then(function (rec) {
      // Refresh persistence receipts without overwriting a physician's unsaved form edits.
      ['sync_state', 'melidata_saved', 'publication_status', 'document_ref'].forEach(function (key) { cur[key] = rec[key]; });
      renderStorageTags();
    }).catch(function () {});
  }, 10000);

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]');
    if (b) {
      var id = b.getAttribute('data-id');
      if (b.getAttribute('data-act') === 'delete') {
        var row = b.closest('tr'), cells = row ? row.children : [];
        var who = row ? row.querySelector('b').textContent : '', code = row ? row.querySelector('small').textContent : '';
        askConfirm({
          title: 'Xoá bản ghi này?', subtitle: 'Thao tác này không thể hoàn tác.',
          details: [['Bệnh nhân', who], ['Mã hồ sơ', code], ['Thời gian', cells[0] ? cells[0].textContent : '']],
          note: 'Bản ghi sẽ bị xoá khỏi lịch sử và không xuất hiện lại khi đồng bộ.',
          okLabel: 'Xoá bản ghi', mustType: b.getAttribute('data-file')
        })
          .then(function (typed) {
            if (!typed) return;
            b.disabled = true;
            return api('/api/records/' + id + '?confirm=' + encodeURIComponent(typed), { method: 'DELETE' }).then(function () {
              if (cur && cur.id === id) { cur = null; $('result').classList.add('hidden'); }
              return loadHistory();
            }).catch(function (e) { b.disabled = false; if (e.status === 409 || e.status === 400 || e.status === 503) notify('error', 'Chưa xoá được bản ghi', e.message); else offline(e); });
          });
      }
      else if (b.getAttribute('data-act') === 'view') api('/api/records/' + id).then(function (r) { showRecord(r, true); }).catch(offline);
      else runProcess(function () { return api('/api/records/' + id + '/process', { method: 'POST' }); }, true);
      return;
    }
    var s = ev.target.closest('#result .save .btn');
    if (s) save(s.classList.contains('primary') ? 'confirmed' : 'draft');
  });
  var q = document.querySelector('#history .tools input');
  if (q) q.addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(function () { loadHistory().catch(function () {}); }, 300); });
  document.addEventListener('click', function (ev) {
    var nav = ev.target.closest('.nav'), navs = document.querySelectorAll('.nav');
    if (nav && nav === navs[1]) loadHistory().catch(function () {});
    // Bấm "Ghi âm" khi đang xem bản ghi mở từ lịch sử -> về trang ghi âm trống, không giữ bản vừa xem.
    // Kết quả vừa xử lý ngay trên trang ghi âm (không ở resultOnlyMode) thì giữ nguyên.
    if (nav && nav === navs[0] && $('capture').classList.contains('resultOnlyMode')) {
      $('capture').classList.remove('resultOnlyMode');
      $('result').classList.add('hidden');
      $('historyProcessing').classList.add('hidden');
      cur = null;
      window.scrollTo({ top: 0 });
    }
  });

  /* tải lịch sử thật; nếu backend tắt thì giữ dữ liệu minh họa */
  api('/api/health').then(loadHistory).catch(function () {
    console.warn('[MELI Voice] Backend không phản hồi tại ' + API + ' — đang dùng dữ liệu minh họa.');
  });
})();
