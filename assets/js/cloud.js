/* ============================================================
   cloud.js — التعامل مع قاعدة البيانات والتخزين وتسجيل الدخول

   المنيو كله محفوظ كسجل واحد في جدول menu، والصور في مخزن الملفات.
   لو ما كان الموقع مربوطاً بعد، كل الدوال ترجع بهدوء والموقع يكمل
   شغله من ملف data/menu.json.
   ============================================================ */
(function (global) {
  'use strict';

  var CFG = global.MENU_CONFIG || {};
  var BUCKET = 'menu-images';
  var client = null;

  function isConfigured() {
    return !!(CFG.supabaseUrl && CFG.supabaseKey);
  }

  /* المكتبة تُحمَّل من CDN؛ لو تعذّر تحميلها نكمل بدون سحابة */
  function libraryReady() {
    return !!(global.supabase && global.supabase.createClient);
  }

  function get() {
    if (client) return client;
    if (!isConfigured() || !libraryReady()) return null;
    client = global.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return client;
  }

  /* يرجّع العميل أو يرمي رسالة تشرح السبب الحقيقي */
  function requireClient() {
    if (!isConfigured()) throw new Error('الموقع غير مربوط بقاعدة البيانات بعد.');
    var c = get();
    if (!c) throw new Error('تعذّر تحميل مكتبة قاعدة البيانات. تأكد من الإنترنت وأعد المحاولة.');
    return c;
  }

  /* رسائل الأخطاء بلغة يفهمها صاحب المحل */
  function describe(err) {
    var msg = (err && (err.message || err.error_description)) || '';
    var code = err && err.code;
    if (/Invalid login credentials/i.test(msg)) return new Error('الإيميل أو كلمة المرور غير صحيحة.');
    if (/Email not confirmed/i.test(msg)) return new Error('الإيميل غير مؤكد. أكّده من الرسالة اللي وصلتك، أو فعّله من لوحة Supabase.');
    if (/row-level security/i.test(msg) || code === '42501') {
      return new Error('ما عندك صلاحية الحفظ. تأكد إنك مسجّل دخول، وإن سياسات الصلاحيات مضافة.');
    }
    if (/relation .* does not exist/i.test(msg) || code === '42P01') {
      return new Error('جدول المنيو غير موجود في قاعدة البيانات. شغّل ملف supabase-setup.sql أولاً.');
    }
    if (/Bucket not found/i.test(msg)) return new Error('مخزن الصور غير موجود. شغّل ملف supabase-setup.sql أولاً.');
    if (/fetch|network|Failed to fetch/i.test(msg)) return new Error('ما فيه اتصال بقاعدة البيانات. تأكد من الإنترنت.');
    if (/rate limit|too many/i.test(msg)) return new Error('محاولات كثيرة خلال وقت قصير. انتظر شوي وأعد المحاولة.');
    return new Error(msg || 'صار خطأ غير متوقع في الاتصال بقاعدة البيانات.');
  }

  /* ------------------ المنيو ------------------ */
  async function loadMenu() {
    if (!isConfigured()) return null;
    /* لو المكتبة ما تحمّلت نرمي خطأ اتصال، لا نرجّع "فاضي" —
       عشان ما نوهم صاحب المحل إن منيوه ضاع */
    var c = requireClient();
    var res = await c.from('menu').select('data').eq('id', 1).maybeSingle();
    if (res.error) throw describe(res.error);
    return res.data ? res.data.data : null;
  }

  async function saveMenu(data) {
    var c = requireClient();
    var res = await c.from('menu')
      .upsert({ id: 1, data: data, updated_at: new Date().toISOString() })
      .select('id');
    if (res.error) throw describe(res.error);
    return true;
  }

  /* ------------------ تسجيل الدخول ------------------ */
  async function signIn(email, password) {
    var c = requireClient();
    var res = await c.auth.signInWithPassword({ email: email, password: password });
    if (res.error) throw describe(res.error);
    return res.data.user;
  }

  async function signOut() {
    var c = get();
    if (c) await c.auth.signOut();
  }

  async function currentUser() {
    var c = get();
    if (!c) return null;
    try {
      var res = await c.auth.getSession();
      return (res.data && res.data.session && res.data.session.user) || null;
    } catch (e) { return null; }
  }

  async function changePassword(newPassword) {
    var c = requireClient();
    var res = await c.auth.updateUser({ password: newPassword });
    if (res.error) throw describe(res.error);
    return true;
  }

  /* ------------------ الصور ------------------ */
  async function uploadImage(blob, hint) {
    var c = requireClient();
    var name = (hint || 'img').replace(/[^a-zA-Z0-9_-]/g, '') || 'img';
    var path = 'items/' + name + '-' + Date.now().toString(36) + '.jpg';
    var up = await c.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg', upsert: false, cacheControl: '3600'
    });
    if (up.error) throw describe(up.error);
    var pub = c.storage.from(BUCKET).getPublicUrl(path);
    return pub.data.publicUrl;
  }

  global.Cloud = {
    isConfigured: isConfigured,
    libraryReady: libraryReady,
    loadMenu: loadMenu,
    saveMenu: saveMenu,
    signIn: signIn,
    signOut: signOut,
    currentUser: currentUser,
    changePassword: changePassword,
    uploadImage: uploadImage
  };

})(window);
