/* ============================================================
   store.js — تحميل وحفظ بيانات المنيو
   ترتيب مصادر البيانات:
   1) قاعدة البيانات (المصدر الرسمي متى ما كان الموقع مربوطاً)
   2) نسخة محلية محفوظة في المتصفح — تُستخدم لو انقطع الاتصال
   3) ملف data/menu.json المرفوع مع الموقع
   4) البيانات الافتراضية المدمجة بالأسفل
   ============================================================ */
(function (global) {
  'use strict';

  /* نسخة محلية من آخر منيو نجح تحميله أو حفظه — تُستخدم لو انقطع الاتصال */
  var CACHE_KEY  = 'menuApp.cache.v2';
  var LEGACY_KEY = 'menuApp.data.v1';

  var DEFAULT_DATA = {
    settings: {
      shopName: 'قهوة الركن',
      tagline: 'منيو المشروبات',
      logo: '',
      currency: 'ر.س',
      theme: { bg: '#ffffff', accent: '#2c3a2e' },
      showCalories: true,
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

  /* يضمن اكتمال البيانات حتى لو كان الملف قديماً أو ناقصاً */
  function normalize(data) {
    var d = clone(DEFAULT_DATA);
    if (!data || typeof data !== 'object') return d;

    if (data.settings) {
      Object.keys(d.settings).forEach(function (k) {
        if (k === 'theme' || k === 'contact') return;
        if (data.settings[k] !== undefined) d.settings[k] = data.settings[k];
      });
      delete d.settings.adminPasswordHash; /* الدخول صار عبر حساب حقيقي */
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

  function readLocal(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var Store = {
    data: null,
    /* من وين جت البيانات المعروضة: cloud | cloud-empty | offline | local | file */
    source: 'file',
    cloudError: null,

    /* ملف data/menu.json إن وُجد، وإلا البيانات المدمجة */
    async fromFile() {
      try {
        var res = await fetch('data/menu.json', { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (e) { /* فتح الملف مباشرة من الجهاز أو الملف غير موجود */ }
      return clone(DEFAULT_DATA);
    },

    async init() {
      this.cloudError = null;
      var fallback = await this.fromFile();

      if (!Cloud.isConfigured()) {
        var local = readLocal(CACHE_KEY) || readLocal(LEGACY_KEY);
        this.data = normalize(local || fallback);
        this.source = local ? 'local' : 'file';
        return this.data;
      }

      try {
        var remote = await Cloud.loadMenu();
        if (remote) {
          this.data = normalize(remote);
          this.source = 'cloud';
          writeLocal(CACHE_KEY, this.data);
          return this.data;
        }
        /* قاعدة البيانات فاضية — نعرض الملف، وأول حفظ ينقله لها */
        this.data = normalize(fallback);
        this.source = 'cloud-empty';
        return this.data;
      } catch (e) {
        this.cloudError = e.message;
        this.data = normalize(readLocal(CACHE_KEY) || fallback);
        this.source = 'offline';
        return this.data;
      }
    },

    /* يحفظ في قاعدة البيانات. يرمي خطأ واضح إذا فشل، فلا نخزّن نسخة
       محلية توهم صاحب المحل إن التعديل انحفظ. */
    async save() {
      if (!Cloud.isConfigured()) {
        if (!writeLocal(CACHE_KEY, this.data)) {
          throw new Error('تعذّر الحفظ — مساحة المتصفح ممتلئة.');
        }
        this.source = 'local';
        return true;
      }
      await Cloud.saveMenu(this.data);
      writeLocal(CACHE_KEY, this.data);
      this.source = 'cloud';
      return true;
    },

    toJSON() { return JSON.stringify(this.data, null, 2) + '\n'; },

    async import(json) {
      var parsed = typeof json === 'string' ? JSON.parse(json) : json;
      this.data = normalize(parsed);
      await this.save();
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

    uid: uid,
    DEFAULT_DATA: DEFAULT_DATA
  };

  global.Store = Store;
})(window);
