/* ============================================================
   cloud.js — قاعدة البيانات وتسجيل الدخول ورفع الصور

   منصة واحدة تخدم كل المحلات: كل محل صف في جدول shops، ومنيوه
   كامل داخل عمود data. صاحب المحل يعدّل محله فقط، ومدير المنصة
   يقدر يضيف محلات ويعدّل أي محل.
   ============================================================ */
(function (global) {
  'use strict';

  var CFG = global.MENU_CONFIG || {};
  var BUCKET = 'menu-images';
  var client = null;

  function isConfigured() {
    return !!(CFG.supabaseUrl && CFG.supabaseKey);
  }

  function get() {
    if (client) return client;
    if (!isConfigured()) return null;
    if (!global.supabase || !global.supabase.createClient) return null;
    client = global.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return client;
  }

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
    if (/Email not confirmed/i.test(msg)) return new Error('الإيميل غير مؤكد. فعّل Auto Confirm للحساب من لوحة Supabase.');
    if (/duplicate key/i.test(msg) || code === '23505') return new Error('فيه محل مسجّل بنفس الرابط. اختر رابطاً غيره.');
    if (/violates check constraint/i.test(msg) || code === '23514') {
      return new Error('رابط المحل لازم يكون حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.');
    }
    if (/row-level security/i.test(msg) || code === '42501') {
      return new Error('ما عندك صلاحية على هذا المحل. تأكد إنك داخل بالحساب الصحيح.');
    }
    if (/relation .* does not exist/i.test(msg) || code === '42P01') {
      return new Error('جداول المنصة غير موجودة. شغّل ملف supabase-setup.sql أولاً.');
    }
    if (/Bucket not found/i.test(msg)) return new Error('مخزن الصور غير موجود. شغّل ملف supabase-setup.sql أولاً.');
    if (/fetch|network|Failed to fetch/i.test(msg)) return new Error('ما فيه اتصال بقاعدة البيانات. تأكد من الإنترنت.');
    if (/rate limit|too many/i.test(msg)) return new Error('محاولات كثيرة خلال وقت قصير. انتظر شوي وأعد المحاولة.');
    return new Error(msg || 'صار خطأ غير متوقع في الاتصال بقاعدة البيانات.');
  }

  /* ------------------ المحلات ------------------ */

  /* منيو محل واحد للعرض للزبون */
  async function loadShop(slug) {
    if (!isConfigured()) return null;
    var c = requireClient();
    var res = await c.from('shops')
      .select('slug,name,data,active')
      .eq('slug', slug)
      .maybeSingle();
    if (res.error) throw describe(res.error);
    return res.data || null;
  }

  async function saveShop(slug, data) {
    var c = requireClient();
    var res = await c.from('shops')
      .update({ data: data })
      .eq('slug', slug)
      .select('slug');
    if (res.error) throw describe(res.error);
    if (!res.data || !res.data.length) {
      throw new Error('ما تم الحفظ — ما عندك صلاحية على هذا المحل، أو انتهت جلستك. سجّل دخول مرة ثانية.');
    }
    return true;
  }

  /* كل المحلات — لمدير المنصة */
  async function listShops() {
    var c = requireClient();
    var res = await c.from('shops')
      .select('slug,name,owner_email,active,updated_at')
      .order('created_at', { ascending: true });
    if (res.error) throw describe(res.error);
    return res.data || [];
  }

  /* محلات صاحب المحل نفسه */
  async function myShops(email) {
    var c = requireClient();
    var res = await c.from('shops')
      .select('slug,name,active')
      .ilike('owner_email', email || '')
      .order('created_at', { ascending: true });
    if (res.error) throw describe(res.error);
    return res.data || [];
  }

  async function createShop(shop) {
    var c = requireClient();
    var res = await c.from('shops').insert({
      slug: shop.slug,
      name: shop.name,
      owner_email: shop.ownerEmail || null,
      data: shop.data
    }).select('slug');
    if (res.error) throw describe(res.error);
    return res.data[0];
  }

  async function updateShopMeta(slug, patch) {
    var c = requireClient();
    var res = await c.from('shops').update(patch).eq('slug', slug).select('slug');
    if (res.error) throw describe(res.error);
    if (!res.data || !res.data.length) throw new Error('ما تم التعديل — هذي العملية لمدير المنصة فقط.');
    return true;
  }

  async function deleteShop(slug) {
    var c = requireClient();
    var res = await c.from('shops').delete().eq('slug', slug).select('slug');
    if (res.error) throw describe(res.error);
    if (!res.data || !res.data.length) throw new Error('ما تم الحذف — هذي العملية لمدير المنصة فقط.');
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

  /* هل المستخدم الحالي مدير منصة؟ سياسات القراءة ترجّع صفه فقط */
  async function isPlatformAdmin() {
    var c = get();
    if (!c) return false;
    try {
      var res = await c.from('platform_admins').select('user_id').limit(1);
      return !res.error && !!(res.data && res.data.length);
    } catch (e) { return false; }
  }

  async function changePassword(newPassword) {
    var c = requireClient();
    var res = await c.auth.updateUser({ password: newPassword });
    if (res.error) throw describe(res.error);
    return true;
  }

  /* ------------------ الصور ------------------ */
  async function uploadImage(slug, blob, hint) {
    var c = requireClient();
    var name = (hint || 'img').replace(/[^a-zA-Z0-9_-]/g, '') || 'img';
    var path = 'shops/' + slug + '/' + name + '-' + Date.now().toString(36) + '.jpg';
    var up = await c.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg', upsert: false, cacheControl: '3600'
    });
    if (up.error) throw describe(up.error);
    return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  global.Cloud = {
    isConfigured: isConfigured,
    loadShop: loadShop,
    saveShop: saveShop,
    listShops: listShops,
    myShops: myShops,
    createShop: createShop,
    updateShopMeta: updateShopMeta,
    deleteShop: deleteShop,
    signIn: signIn,
    signOut: signOut,
    currentUser: currentUser,
    isPlatformAdmin: isPlatformAdmin,
    changePassword: changePassword,
    uploadImage: uploadImage
  };

})(window);
