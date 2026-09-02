/* ============================================================
   publish.js — النشر المباشر إلى GitHub من داخل لوحة التحكم
   يرفع صور المنتجات كملفات داخل images/ ثم يحدّث data/menu.json،
   فيتحدّث الموقع لكل الزبائن خلال دقيقة تقريباً.

   التوكن يُحفظ في هذا الجهاز فقط (localStorage) ولا يدخل أبداً
   داخل ملف المنيو المنشور.
   ============================================================ */
(function (global) {
  'use strict';

  var CFG_KEY = 'menuApp.github.v1';
  var API = 'https://api.github.com';
  var MENU_PATH = 'data/menu.json';

  /* ------------------ الإعدادات ------------------ */
  function loadConfig() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) {}
    var guess = guessFromUrl();
    return {
      owner:  saved.owner  || guess.owner,
      repo:   saved.repo   || guess.repo,
      branch: saved.branch || 'main',
      token:  saved.token  || ''
    };
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, token: cfg.token
      }));
      return true;
    } catch (e) { return false; }
  }

  /* يخمّن اسم الحساب والمستودع من رابط GitHub Pages */
  function guessFromUrl() {
    var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { owner: '', repo: '' };
    var seg = location.pathname.split('/').filter(Boolean);
    return { owner: m[1], repo: seg.length ? seg[0] : m[1] + '.github.io' };
  }

  function isConfigured() {
    var c = loadConfig();
    return !!(c.token && c.owner && c.repo);
  }

  /* ------------------ ترميز Base64 ------------------ */
  function bytesToB64(bytes) {
    var out = '', CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(out);
  }
  function textToB64(text) { return bytesToB64(new TextEncoder().encode(text)); }

  /* ------------------ نداءات GitHub ------------------ */
  function describe(res) {
    var msg = (res.body && res.body.message) || '';
    var e;
    if (res.status === 401) e = new Error('التوكن غير صحيح أو منتهي الصلاحية.');
    else if (res.status === 403) e = new Error('التوكن ما عنده صلاحية الكتابة على هذا المستودع.');
    else if (res.status === 404) e = new Error('ما لقيت المستودع أو الفرع. تأكد من اسم الحساب والمستودع والفرع، وإن التوكن يشمل هذا المستودع.');
    else if (res.status === 409 || res.status === 422) {
      e = new Error('فيه تعديل أحدث على المستودع.');
      e.conflict = true;
    } else e = new Error('تعذّر الاتصال بـ GitHub' + (msg ? ' — ' + msg : '') + ' (رمز ' + res.status + ')');
    e.status = res.status;
    return e;
  }

  async function call(cfg, path, options) {
    var opts = options || {};
    var res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        body: opts.body,
        headers: {
          'Authorization': 'Bearer ' + cfg.token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      throw new Error('ما فيه اتصال بالإنترنت، أو الشبكة تمنع GitHub.');
    }
    var body = null;
    try { body = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, body: body };
  }

  /* يرجّع sha الملف الحالي، أو null إذا الملف غير موجود */
  async function fileSha(cfg, path) {
    var r = await call(cfg, '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' +
      path + '?ref=' + encodeURIComponent(cfg.branch));
    if (r.status === 404) return null;
    if (!r.ok) throw describe(r);
    return r.body && r.body.sha;
  }

  async function putFile(cfg, path, contentB64, message, sha) {
    var payload = { message: message, content: contentB64, branch: cfg.branch };
    if (sha) payload.sha = sha;
    var r = await call(cfg, '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path,
      { method: 'PUT', body: JSON.stringify(payload) });
    if (!r.ok) throw describe(r);
    return r.body;
  }

  /* ------------------ اختبار الاتصال ------------------ */
  async function test() {
    var cfg = loadConfig();
    if (!cfg.token) throw new Error('حط التوكن أولاً.');
    if (!cfg.owner || !cfg.repo) throw new Error('اكتب اسم الحساب واسم المستودع.');
    var sha = await fileSha(cfg, MENU_PATH);
    return sha
      ? 'الاتصال سليم — ملف المنيو موجود وجاهز للتحديث.'
      : 'الاتصال سليم — ملف المنيو غير موجود وراح يُنشأ عند أول نشر.';
  }

  /* ------------------ النشر ------------------ */
  async function publish(onProgress) {
    var report = function (m) { if (onProgress) onProgress(m); };
    var cfg = loadConfig();
    if (!cfg.token) throw new Error('حط التوكن أولاً.');
    if (!cfg.owner || !cfg.repo) throw new Error('اكتب اسم الحساب واسم المستودع.');

    var data = Store.data;

    /* ١) الصور المرفوعة من الجهاز تُحوَّل إلى ملفات داخل images/ */
    var pending = [];
    data.items.forEach(function (it) {
      if (/^data:image\//.test(it.image || '')) {
        pending.push({
          dataUrl: it.image,
          name: 'item-' + it.id,
          apply: function (p) { it.image = p; }
        });
      }
    });
    if (/^data:image\//.test(data.settings.logo || '')) {
      pending.push({
        dataUrl: data.settings.logo,
        name: 'logo',
        apply: function (p) { data.settings.logo = p; }
      });
    }

    var stamp = Date.now().toString(36);
    for (var i = 0; i < pending.length; i++) {
      report('جاري رفع الصور… (' + (i + 1) + ' من ' + pending.length + ')');
      var item = pending[i];
      var path = 'images/' + item.name + '-' + stamp + i + '.jpg';
      await putFile(cfg, path, item.dataUrl.slice(item.dataUrl.indexOf(',') + 1),
        'إضافة صورة ' + item.name);
      item.apply(path);
    }
    /* نحفظ المسارات الجديدة محلياً حتى لا تُرفع الصور مرة ثانية */
    if (pending.length) Store.save();

    /* ٢) تحديث ملف المنيو */
    report('جاري نشر المنيو…');
    var content = textToB64(Store.toJSON());
    var sha = await fileSha(cfg, MENU_PATH);
    try {
      await putFile(cfg, MENU_PATH, content, 'تحديث المنيو من لوحة التحكم', sha);
    } catch (e) {
      if (!e.conflict) throw e;
      /* شخص ثاني نشر قبل شوي — نجيب أحدث نسخة ونعيد المحاولة مرة وحدة */
      report('فيه نسخة أحدث… إعادة المحاولة');
      sha = await fileSha(cfg, MENU_PATH);
      await putFile(cfg, MENU_PATH, content, 'تحديث المنيو من لوحة التحكم', sha);
    }

    Store.clearUnpublished();
    return { images: pending.length };
  }

  global.Publish = {
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    isConfigured: isConfigured,
    test: test,
    publish: publish
  };

})(window);
