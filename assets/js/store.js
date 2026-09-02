/* ============================================================
   store.js — تخزين بيانات المنيو
   ترتيب مصادر البيانات:
   1) تعديلات محفوظة في هذا المتصفح (localStorage)
   2) ملف data/menu.json المرفوع مع الموقع
   3) البيانات الافتراضية المدمجة بالأسفل
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'menuApp.data.v1';
  var SESSION_KEY = 'menuApp.admin';
  var DIRTY_KEY   = 'menuApp.unpublished';

  /* كلمة المرور الافتراضية: admin1234  (يفضّل تغييرها من لوحة التحكم) */
  var DEFAULT_PASS_HASH =
    'ac9689e2272427085e35b9d3e3e8bed88cb3434828b43b86fc0596cad4c6e270';

  var DEFAULT_DATA = {
    settings: {
      shopName: 'قهوة الركن',
      tagline: 'منيو المشروبات',
      logo: '',
      currency: 'ر.س',
      theme: { bg: '#ffffff', accent: '#2c3a2e' },
      showCalories: true,
      adminPasswordHash: DEFAULT_PASS_HASH,
      contact: {
        phone: '',
        whatsapp: '',
        instagram: '',
        address: '',
        hours: '',
        notes: ''
      }
    },
    categories: [
      { id: 'hot',      name: 'المشروبات الساخنة', order: 1 },
      { id: 'cold',     name: 'المشروبات الباردة', order: 2 },
      { id: 'desserts', name: 'الحلويات',          order: 3 }
    ],
    items: [
      { id: 'i01', categoryId: 'hot',  name: 'كابتشينو',       desc: '', calories: 210, price: 19, oldPrice: null, image: 'images/cappuccino.jpg',       available: true, order: 1 },
      { id: 'i02', categoryId: 'hot',  name: 'دبل ماكياتو',    desc: '', calories: 190, price: 18, oldPrice: null, image: 'images/double-macchiato.jpg', available: true, order: 2 },
      { id: 'i03', categoryId: 'hot',  name: 'موكا',            desc: '', calories: 250, price: 20, oldPrice: null, image: 'images/mocha.jpg',            available: true, order: 3 },
      { id: 'i04', categoryId: 'hot',  name: 'هوت شوكليت',     desc: '', calories: 230, price: 17, oldPrice: null, image: 'images/hot-chocolate.jpg',    available: true, order: 4 },
      { id: 'i05', categoryId: 'hot',  name: 'قهوة سعودية',    desc: '', calories: 10,  price: 9,  oldPrice: null, image: 'images/saudi-coffee.jpg',     available: true, order: 5 },
      { id: 'i06', categoryId: 'hot',  name: 'أمريكانو',        desc: '', calories: 15,  price: 15, oldPrice: null, image: 'images/americano.jpg',        available: true, order: 6 },
      { id: 'i07', categoryId: 'hot',  name: 'لاتيه',           desc: '', calories: 220, price: 18, oldPrice: 22,   image: 'images/latte.jpg',            available: true, order: 7 },
      { id: 'i08', categoryId: 'hot',  name: 'اسبريسو',         desc: '', calories: 5,   price: 12, oldPrice: null, image: 'images/espresso.jpg',         available: true, order: 8 },
      { id: 'i09', categoryId: 'hot',  name: 'شاي كرك',         desc: '', calories: 120, price: 8,  oldPrice: null, image: 'images/karak-tea.jpg',        available: true, order: 9 },

      { id: 'i10', categoryId: 'cold', name: 'آيس لاتيه',       desc: '', calories: 230, price: 20, oldPrice: null, image: 'images/ice-latte.jpg',        available: true, order: 1 },
      { id: 'i11', categoryId: 'cold', name: 'آيس أمريكانو',    desc: '', calories: 20,  price: 17, oldPrice: null, image: 'images/ice-americano.jpg',    available: true, order: 2 },
      { id: 'i12', categoryId: 'cold', name: 'آيس موكا',        desc: '', calories: 280, price: 22, oldPrice: 26,   image: 'images/ice-mocha.jpg',        available: true, order: 3 },
      { id: 'i13', categoryId: 'cold', name: 'ميلك شيك',        desc: '', calories: 380, price: 24, oldPrice: null, image: 'images/milkshake.jpg',        available: true, order: 4 },
      { id: 'i14', categoryId: 'cold', name: 'ليموناضة نعناع',  desc: '', calories: 150, price: 18, oldPrice: null, image: 'images/mint-lemonade.jpg',    available: true, order: 5 },

      { id: 'i15', categoryId: 'desserts', name: 'تشيز كيك',    desc: '', calories: 420, price: 21, oldPrice: null, image: 'images/cheesecake.jpg',       available: true, order: 1 },
      { id: 'i16', categoryId: 'desserts', name: 'كرواسان',     desc: '', calories: 310, price: 12, oldPrice: null, image: 'images/croissant.jpg',        available: true, order: 2 }
    ]
  };

  /* ------------------ أدوات مساعدة ------------------ */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function sha256(text) {
    if (global.crypto && global.crypto.subtle) {
      var buf = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.prototype.map
        .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    }
    /* بديل بسيط إذا كان المتصفح قديماً أو الصفحة غير آمنة */
    var h = 0, i;
    for (i = 0; i < text.length; i++) { h = (h * 31 + text.charCodeAt(i)) | 0; }
    return 'fallback:' + h;
  }

  /* يضمن اكتمال البيانات حتى لو كان الملف قديماً أو ناقصاً */
  function normalize(data) {
    var d = clone(DEFAULT_DATA);
    if (!data || typeof data !== 'object') return d;

    if (data.settings) {
      Object.keys(d.settings).forEach(function (k) {
        if (k === 'theme' || k === 'contact') return;
        if (data.settings[k] !== undefined) d.settings[k] = data.settings[k];
      });
      if (data.settings.theme) Object.assign(d.settings.theme, data.settings.theme);
      if (data.settings.contact) Object.assign(d.settings.contact, data.settings.contact);
    }

    if (Array.isArray(data.categories)) {
      d.categories = data.categories
        .filter(function (c) { return c && c.name; })
        .map(function (c, i) {
          return { id: c.id || uid('c'), name: String(c.name), order: Number(c.order) || i + 1 };
        });
    }

    if (Array.isArray(data.items)) {
      d.items = data.items
        .filter(function (it) { return it && it.name; })
        .map(function (it, i) {
          return {
            id: it.id || uid('i'),
            categoryId: it.categoryId || (d.categories[0] && d.categories[0].id) || '',
            name: String(it.name),
            desc: it.desc ? String(it.desc) : '',
            calories: it.calories === '' || it.calories == null ? null : Number(it.calories),
            price: Number(it.price) || 0,
            oldPrice: it.oldPrice ? Number(it.oldPrice) : null,
            image: it.image ? String(it.image) : '',
            available: it.available !== false,
            order: Number(it.order) || i + 1
          };
        });
    }
    return d;
  }

  var Store = {
    data: null,
    /** true إذا كانت البيانات المعروضة تعديلات محلية غير منشورة */
    hasLocalEdits: false,

    async init() {
      var saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* الوضع الخاص */ }

      if (saved) {
        try {
          this.data = normalize(JSON.parse(saved));
          this.hasLocalEdits = true;
          return this.data;
        } catch (e) { /* ملف تالف — نكمل للمصدر التالي */ }
      }

      try {
        var res = await fetch('data/menu.json', { cache: 'no-store' });
        if (res.ok) {
          this.data = normalize(await res.json());
          return this.data;
        }
      } catch (e) { /* فتح الملف مباشرة من الجهاز أو الملف غير موجود */ }

      this.data = clone(DEFAULT_DATA);
      return this.data;
    },

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        this.hasLocalEdits = true;
        this.markUnpublished();
        return true;
      } catch (e) {
        return false; /* غالباً امتلأت المساحة بسبب صور مرفوعة كبيرة */
      }
    },

    /* ---------- تعديلات لم تُنشر بعد ---------- */
    markUnpublished() {
      try { localStorage.setItem(DIRTY_KEY, '1'); } catch (e) {}
    },
    clearUnpublished() {
      try { localStorage.removeItem(DIRTY_KEY); } catch (e) {}
    },
    hasUnpublished() {
      try { return localStorage.getItem(DIRTY_KEY) === '1'; } catch (e) { return false; }
    },

    async reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      this.hasLocalEdits = false;
      this.clearUnpublished();
      return this.init();
    },

    toJSON() { return JSON.stringify(this.data, null, 2); },

    import(json) {
      var parsed = typeof json === 'string' ? JSON.parse(json) : json;
      this.data = normalize(parsed);
      this.save();
      return this.data;
    },

    /* ---------- الأقسام ---------- */
    categories() {
      return this.data.categories.slice().sort(function (a, b) { return a.order - b.order; });
    },
    categoryName(id) {
      var c = this.data.categories.find(function (x) { return x.id === id; });
      return c ? c.name : '';
    },
    /* ---------- الأصناف ---------- */
    itemsOf(categoryId) {
      return this.data.items
        .filter(function (i) { return i.categoryId === categoryId; })
        .sort(function (a, b) { return a.order - b.order; });
    },
    offers() {
      return this.data.items
        .filter(function (i) { return i.oldPrice && i.oldPrice > i.price; })
        .sort(function (a, b) { return a.order - b.order; });
    },

    /* ---------- كلمة المرور ---------- */
    async checkPassword(pass) {
      var h = await sha256(pass);
      return h === this.data.settings.adminPasswordHash;
    },
    async setPassword(pass) {
      this.data.settings.adminPasswordHash = await sha256(pass);
      return this.save();
    },
    isLoggedIn() {
      try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
    },
    setLoggedIn(v) {
      try { v ? sessionStorage.setItem(SESSION_KEY, '1') : sessionStorage.removeItem(SESSION_KEY); }
      catch (e) {}
    },

    uid: uid,
    sha256: sha256,
    DEFAULT_DATA: DEFAULT_DATA
  };

  global.Store = Store;
})(window);
