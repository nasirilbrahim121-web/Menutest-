/* ============================================================
   admin.js — لوحة التحكم المخفية
   الدخول: ٥ ضغطات على اسم المحل أو الرابط #admin، ثم إيميل وكلمة مرور.
   كل تعديل يُحفظ مباشرة في قاعدة البيانات ويظهر للزبائن فوراً.
   ============================================================ */
(function (global) {
  'use strict';

  var panel      = document.getElementById('adminPanel');
  var loginModal = document.getElementById('loginModal');
  var loginForm  = document.getElementById('loginForm');
  var loginEmail = document.getElementById('loginEmail');
  var loginPass  = document.getElementById('loginPass');
  var loginError = document.getElementById('loginError');
  var editModal  = document.getElementById('editModal');
  var editForm   = document.getElementById('editForm');
  var editFields = document.getElementById('editFields');
  var editTitle  = document.getElementById('editTitle');
  var cloudBox   = document.getElementById('cloudStatus');

  var editing = null;   /* {type:'item'|'cat', id:string|null} */
  var ctx = { user: null, isAdmin: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* يحفظ التعديل ويحدّث المنيو. يرجّع true إذا نجح الحفظ فعلاً. */
  async function persist() {
    try {
      await Store.save();
      global.renderMenu();
      showCloudStatus();
      return true;
    } catch (e) {
      toast(e.message);
      showCloudStatus(e.message);
      return false;
    }
  }

  /* ------------------ تصغير الصور قبل الرفع ------------------ */
  function fileToBlob(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('تعذّرت قراءة الصورة')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('صيغة الصورة غير مدعومة')); };
        img.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          cv.toBlob(function (blob) {
            blob ? resolve(blob) : reject(new Error('تعذّر تجهيز الصورة'));
          }, 'image/jpeg', 0.82);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
     الدخول والخروج
     ============================================================ */
  async function requestAccess() {
    if (!Cloud.isConfigured()) {
      alert('الموقع غير مربوط بقاعدة البيانات بعد. عبّي القيمتين في ملف assets/js/config.js.');
      return;
    }
    var user = await Cloud.currentUser();
    if (user) return enterPanel();
    loginError.hidden = true;
    loginPass.value = '';
    loginModal.hidden = false;
    setTimeout(function () { (loginEmail.value ? loginPass : loginEmail).focus(); }, 50);
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = loginForm.querySelector('button[type=submit]');
    btn.disabled = true;
    loginError.hidden = true;
    try {
      await Cloud.signIn(loginEmail.value.trim(), loginPass.value);
      loginModal.hidden = true;
      loginPass.value = '';
      await enterPanel();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  /* يحدد صلاحية المستخدم ويجهّز المحل اللي بيعدّله */
  async function enterPanel() {
    ctx.user = await Cloud.currentUser();
    ctx.isAdmin = await Cloud.isPlatformAdmin();
    document.querySelector('.atab[data-view="shops"]').hidden = !ctx.isAdmin;

    /* لو الرابط ما فيه محل، نفتح محل صاحبه تلقائياً إذا عنده واحد فقط */
    if (!Store.data) {
      try {
        var mine = ctx.isAdmin
          ? await Cloud.listShops()
          : await Cloud.myShops((ctx.user && ctx.user.email) || '');
        if (mine.length === 1) await switchShop(mine[0].slug, true);
      } catch (e) { /* نكمل ونعرض التبويب بحالته */ }
    }
    open();
    renderShops();
  }

  async function switchShop(slug, quiet) {
    await Store.init(slug);
    try { history.replaceState(null, '', '?shop=' + encodeURIComponent(slug)); }
    catch (e) { /* بعض المتصفحات تمنعها */ }
    global.renderMenu();
    if (!panel.hidden) {
      fillSettingsForm();
      renderItems();
      renderCats();
      updateContext();
      document.getElementById('jsonBox').value = Store.data ? Store.toJSON() : '';
    }
    if (!quiet) toast('تم فتح ' + slug);
  }

  function updateContext() {
    var box = document.getElementById('ctxShop');
    box.textContent = Store.shop && Store.data
      ? (Store.data.settings.shopName || Store.shop.slug) + ' · ' + Store.shop.slug
      : 'ما فيه محل محدد';
    document.getElementById('noShopHint').hidden = !!Store.data;
    document.getElementById('addItemBtn').disabled = !Store.data;
    document.getElementById('addCatBtn').disabled = !Store.data;
  }

  /* ---------- تبويب المحلات ---------- */
  async function renderShops() {
    var box = document.getElementById('shopsList');
    var msg = document.getElementById('shopsMsg');
    if (!box) return;
    msg.hidden = true;
    box.innerHTML = '<p class="muted">جاري التحميل…</p>';
    try {
      var rows = ctx.isAdmin
        ? await Cloud.listShops()
        : await Cloud.myShops((ctx.user && ctx.user.email) || '');
      if (!rows.length) {
        box.innerHTML = '<p class="muted">ما فيه محلات بعد.</p>';
        return;
      }
      var base = location.origin + location.pathname;
      box.innerHTML = rows.map(function (r) {
        var url = base + '?shop=' + encodeURIComponent(r.slug);
        return '<div class="arow" data-slug="' + esc(r.slug) + '">' +
          '<div class="arow-main">' +
            '<b>' + esc(r.name) + (r.active === false ? ' — <span style="color:#c62828">موقوف</span>' : '') + '</b>' +
            '<small>' + esc(r.owner_email || 'بدون مالك') + '</small>' +
            '<small class="shop-link">' + esc(url) + '</small>' +
          '</div>' +
          '<div class="arow-actions">' +
            '<button class="btn ghost tiny" type="button" data-shop-act="edit">تعديل المنيو</button>' +
            '<button class="btn ghost tiny" type="button" data-shop-act="copy">نسخ الرابط</button>' +
            (ctx.isAdmin ? '<button class="btn ghost tiny" type="button" data-shop-act="toggle">' +
              (r.active === false ? 'تفعيل' : 'إيقاف') + '</button>' +
              '<button class="btn ghost tiny danger" type="button" data-shop-act="del">حذف</button>' : '') +
          '</div></div>';
      }).join('');
    } catch (e) {
      box.innerHTML = '';
      msg.textContent = e.message;
      msg.className = 'pub-status is-err';
      msg.hidden = false;
    }
  }

  document.getElementById('shopsList').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-shop-act]');
    if (!btn) return;
    var slug = btn.closest('.arow').dataset.slug;
    var act = btn.dataset.shopAct;
    var base = location.origin + location.pathname + '?shop=' + encodeURIComponent(slug);

    if (act === 'edit') {
      await switchShop(slug);
      document.querySelector('.atab[data-view="items"]').click();
      return;
    }
    if (act === 'copy') {
      try { await navigator.clipboard.writeText(base); toast('تم نسخ الرابط'); }
      catch (err) { prompt('انسخ الرابط:', base); }
      return;
    }
    if (act === 'toggle') {
      var turningOff = btn.textContent.trim() === 'إيقاف';
      try {
        await Cloud.updateShopMeta(slug, { active: !turningOff });
        toast(turningOff ? 'تم إيقاف المحل' : 'تم تفعيل المحل');
        renderShops();
      } catch (err) { toast(err.message); }
      return;
    }
    if (act === 'del') {
      if (!confirm('حذف المحل «' + slug + '» ومنيوه نهائياً؟ ما فيه تراجع.')) return;
      try {
        await Cloud.deleteShop(slug);
        toast('تم حذف المحل');
        if (Store.shop && Store.shop.slug === slug) { Store.data = null; Store.shop = null; updateContext(); }
        renderShops();
      } catch (err) { toast(err.message); }
    }
  });

  document.getElementById('addShopBtn').addEventListener('click', function () {
    editing = { type: 'shop', id: null };
    editTitle.textContent = 'إضافة محل';
    editFields.innerHTML =
      '<label class="field"><span>اسم المحل *</span><input class="input" name="name" required placeholder="قهوة النخلة"></label>' +
      '<label class="field"><span>رابط المحل *</span><input class="input ltr" name="slug" required placeholder="alnakhla" pattern="[a-z0-9][a-z0-9-]{1,39}"></label>' +
      '<p class="muted small">حروف إنجليزية صغيرة وأرقام وشرطات فقط. يصير رابط المنيو: <code>?shop=alnakhla</code></p>' +
      '<label class="field"><span>إيميل صاحب المحل</span><input class="input ltr" name="ownerEmail" type="email" placeholder="owner@example.com"></label>' +
      '<p class="muted small">أنشئ له حساباً بنفس الإيميل من Supabase ← Authentication ← Users، وبعدها يدخل ويعدّل منيوه هو فقط.</p>';
    editModal.hidden = false;
  });

  function open() {
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    updateContext();
    fillSettingsForm();
    showCloudStatus();
    renderItems();
    renderCats();
    document.getElementById('jsonBox').value = Store.data ? Store.toJSON() : '';
  }

  function close() {
    panel.hidden = true;
    document.body.style.overflow = '';
  }

  /* حالة الاتصال أعلى تبويب النسخ الاحتياطي */
  function showCloudStatus(errorMsg) {
    if (!cloudBox) return;
    var map = {
      ok: ['متصل — أي تعديل تحفظه يشوفه الزبائن فوراً.', 'ok'],
      offline: ['ما وصلنا لقاعدة البيانات، وتعرض نسخة محفوظة. لا تعدّل قبل ما يرجع الاتصال.', 'err'],
      demo: ['الموقع غير مربوط بقاعدة البيانات — منيو تجريبي محفوظ في هذا الجهاز فقط.', 'err'],
      'no-shop': ['ما فيه محل محدد في الرابط.', 'err'],
      'not-found': ['المحل المذكور في الرابط غير موجود.', 'err']
    };
    var row = map[Store.status] || map['no-shop'];
    var msg = errorMsg || (Store.error ? row[0] + ' (' + Store.error + ')' : row[0]);
    cloudBox.textContent = msg;
    cloudBox.className = 'pub-status' + (errorMsg ? ' is-err' : (row[1] ? ' is-' + row[1] : ''));
    cloudBox.hidden = false;
  }

  /* ============================================================
     تبويبات اللوحة
     ============================================================ */
  document.querySelector('.admin-tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.atab');
    if (!btn) return;
    Array.prototype.forEach.call(document.querySelectorAll('.atab'), function (t) {
      t.classList.toggle('is-active', t === btn);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.aview'), function (v) {
      v.hidden = v.dataset.view !== btn.dataset.view;
    });
  });

  document.getElementById('previewBtn').addEventListener('click', close);

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    await Cloud.signOut();
    close();
    toast('تم تسجيل الخروج');
  });

  /* ============================================================
     الأصناف
     ============================================================ */
  var filterCat = document.getElementById('filterCat');

  function fillFilter() {
    var cur = filterCat.value;
    filterCat.innerHTML = '<option value="">كل الأقسام</option>' +
      Store.categories().map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('');
    filterCat.value = cur || '';
  }

  function renderItems() {
    if (!Store.data) { document.getElementById('adminItems').innerHTML = ''; return; }
    fillFilter();
    var box = document.getElementById('adminItems');
    var chosen = filterCat.value;
    var list = Store.categories().filter(function (c) { return !chosen || c.id === chosen; });

    if (!Store.data.items.length) {
      box.innerHTML = '<p class="muted">لا توجد أصناف بعد. اضغط «إضافة صنف».</p>';
      return;
    }

    box.innerHTML = list.map(function (c) {
      var items = Store.itemsOf(c.id);
      if (!items.length) return '';
      return '<h3>' + esc(c.name) + '</h3>' + items.map(function (it, idx) {
        var img = it.image
          ? '<img src="' + esc(it.image) + '" alt="" onerror="this.outerHTML=\'<div class=&quot;ph&quot;>صورة</div>\'">'
          : '<div class="ph">صورة</div>';
        return '<div class="arow" data-id="' + esc(it.id) + '">' + img +
          '<div class="arow-main">' +
            '<b>' + esc(it.name) + (it.available ? '' : ' — <span style="color:#c62828">غير متوفر</span>') + '</b>' +
            '<small>' + esc(Store.data.settings.currency) + ' ' + Number(it.price).toFixed(2) +
              (it.oldPrice ? ' (بدل ' + Number(it.oldPrice).toFixed(2) + ')' : '') +
              (it.calories != null ? ' • ' + it.calories + ' سعرة' : '') + '</small>' +
          '</div>' +
          '<div class="arow-actions">' +
            '<button class="iconbtn" type="button" data-act="up" title="أعلى"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button class="iconbtn" type="button" data-act="down" title="أسفل"' + (idx === items.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '<button class="btn ghost tiny" type="button" data-act="edit">تعديل</button>' +
            '<button class="btn ghost tiny" type="button" data-act="toggle">' + (it.available ? 'إخفاء' : 'إظهار') + '</button>' +
            '<button class="btn ghost tiny danger" type="button" data-act="del">حذف</button>' +
          '</div></div>';
      }).join('');
    }).join('') || '<p class="muted">لا توجد أصناف في هذا القسم.</p>';
  }

  filterCat.addEventListener('change', renderItems);

  document.getElementById('adminItems').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = btn.closest('.arow').dataset.id;
    var item = Store.data.items.find(function (i) { return i.id === id; });
    if (!item) return;
    var act = btn.dataset.act;

    if (act === 'edit') return openItemForm(item);

    if (act === 'toggle') {
      item.available = !item.available;
      if (!await persist()) item.available = !item.available; /* تراجع لو فشل الحفظ */
      renderItems();
      return;
    }

    if (act === 'del') {
      if (!confirm('حذف «' + item.name + '» نهائياً؟')) return;
      var backup = Store.data.items.slice();
      Store.data.items = Store.data.items.filter(function (i) { return i.id !== id; });
      if (await persist()) toast('تم الحذف');
      else Store.data.items = backup;
      renderItems();
      return;
    }

    if (act === 'up' || act === 'down') {
      var siblings = Store.itemsOf(item.categoryId);
      var idx = siblings.findIndex(function (i) { return i.id === id; });
      var swapWith = siblings[act === 'up' ? idx - 1 : idx + 1];
      if (!swapWith) return;
      var tmp = item.order; item.order = swapWith.order; swapWith.order = tmp;
      if (!await persist()) { swapWith.order = item.order; item.order = tmp; }
      renderItems();
    }
  });

  document.getElementById('addItemBtn').addEventListener('click', function () {
    if (!Store.data.categories.length) { toast('أضف قسماً أولاً'); return; }
    openItemForm(null);
  });

  /* ---------- نموذج الصنف ---------- */
  function openItemForm(item) {
    editing = { type: 'item', id: item ? item.id : null };
    editTitle.textContent = item ? 'تعديل صنف' : 'إضافة صنف';
    var it = item || {
      name: '', categoryId: (Store.categories()[0] || {}).id, price: '', oldPrice: '',
      calories: '', desc: '', image: '', available: true
    };

    editFields.innerHTML =
      '<label class="field"><span>اسم الصنف *</span><input class="input" name="name" required value="' + esc(it.name) + '"></label>' +
      '<label class="field"><span>القسم</span><select class="input" name="categoryId">' +
        Store.categories().map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === it.categoryId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('') +
      '</select></label>' +
      '<label class="field"><span>السعر *</span><input class="input" name="price" type="number" step="0.01" min="0" required value="' + esc(it.price) + '"></label>' +
      '<label class="field"><span>السعر قبل الخصم (اتركه فارغاً إن لم يكن عرضاً)</span>' +
        '<input class="input" name="oldPrice" type="number" step="0.01" min="0" value="' + esc(it.oldPrice || '') + '"></label>' +
      '<label class="field"><span>السعرات الحرارية</span><input class="input" name="calories" type="number" min="0" value="' + esc(it.calories == null ? '' : it.calories) + '"></label>' +
      '<label class="field"><span>الوصف</span><textarea class="input" name="desc" rows="2">' + esc(it.desc) + '</textarea></label>' +
      '<label class="field"><span>صورة الصنف</span><input class="input" type="file" id="imgFile" accept="image/*"></label>' +
      '<input type="hidden" name="image" id="imgPath" value="' + esc(it.image) + '">' +
      '<p id="imgMsg" class="muted small"></p>' +
      '<div id="imgPrev" class="logo-preview">' + (it.image ? '<img src="' + esc(it.image) + '" alt="">' : '') + '</div>' +
      '<label class="check"><input type="checkbox" name="available"' + (it.available !== false ? ' checked' : '') + '> <span>متوفر للطلب</span></label>';

    document.getElementById('imgFile').addEventListener('change', async function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var msg = document.getElementById('imgMsg');
      msg.textContent = 'جاري رفع الصورة…';
      try {
        var blob = await fileToBlob(f, 800);
        var url = await Cloud.uploadImage(Store.shop.slug, blob, 'item');
        document.getElementById('imgPath').value = url;
        document.getElementById('imgPrev').innerHTML = '<img src="' + esc(url) + '" alt="">';
        msg.textContent = 'تم رفع الصورة. اضغط «حفظ» عشان تنحفظ مع الصنف.';
      } catch (err) {
        msg.textContent = err.message;
      }
    });

    editModal.hidden = false;
  }

  /* ============================================================
     الأقسام
     ============================================================ */
  function renderCats() {
    var box = document.getElementById('adminCats');
    if (!Store.data) { box.innerHTML = ''; return; }
    var cats = Store.categories();
    if (!cats.length) { box.innerHTML = '<p class="muted">لا توجد أقسام بعد.</p>'; return; }
    box.innerHTML = cats.map(function (c, idx) {
      var n = Store.itemsOf(c.id).length;
      return '<div class="arow" data-id="' + esc(c.id) + '">' +
        '<div class="arow-main"><b>' + esc(c.name) + '</b><small>' + n + ' صنف</small></div>' +
        '<div class="arow-actions">' +
          '<button class="iconbtn" type="button" data-act="up"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button class="iconbtn" type="button" data-act="down"' + (idx === cats.length - 1 ? ' disabled' : '') + '>▼</button>' +
          '<button class="btn ghost tiny" type="button" data-act="edit">تعديل</button>' +
          '<button class="btn ghost tiny danger" type="button" data-act="del">حذف</button>' +
        '</div></div>';
    }).join('');
  }

  document.getElementById('adminCats').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = btn.closest('.arow').dataset.id;
    var cat = Store.data.categories.find(function (c) { return c.id === id; });
    if (!cat) return;
    var act = btn.dataset.act;

    if (act === 'edit') return openCatForm(cat);

    if (act === 'del') {
      var n = Store.itemsOf(id).length;
      var msg = n ? 'سيتم حذف القسم و' + n + ' صنف بداخله. متأكد؟' : 'حذف القسم «' + cat.name + '»؟';
      if (!confirm(msg)) return;
      var cats = Store.data.categories.slice(), items = Store.data.items.slice();
      Store.data.categories = cats.filter(function (c) { return c.id !== id; });
      Store.data.items = items.filter(function (i) { return i.categoryId !== id; });
      if (await persist()) toast('تم الحذف');
      else { Store.data.categories = cats; Store.data.items = items; }
      renderCats(); renderItems();
      return;
    }

    if (act === 'up' || act === 'down') {
      var list = Store.categories();
      var idx = list.findIndex(function (c) { return c.id === id; });
      var swapWith = list[act === 'up' ? idx - 1 : idx + 1];
      if (!swapWith) return;
      var tmp = cat.order; cat.order = swapWith.order; swapWith.order = tmp;
      if (!await persist()) { swapWith.order = cat.order; cat.order = tmp; }
      renderCats(); renderItems();
    }
  });

  document.getElementById('addCatBtn').addEventListener('click', function () { openCatForm(null); });

  function openCatForm(cat) {
    editing = { type: 'cat', id: cat ? cat.id : null };
    editTitle.textContent = cat ? 'تعديل قسم' : 'إضافة قسم';
    editFields.innerHTML =
      '<label class="field"><span>اسم القسم *</span><input class="input" name="name" required value="' +
      esc(cat ? cat.name : '') + '"></label>';
    editModal.hidden = false;
  }

  /* ---------- حفظ النموذج ---------- */
  editForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = new FormData(editForm);
    var btn = editForm.querySelector('button[type=submit]');
    btn.disabled = true;

    try {
      if (editing.type === 'shop') {
        try {
          var slug = String(f.get('slug') || '').trim().toLowerCase();
          var shopName = String(f.get('name') || '').trim();
          /* المحل الجديد يبدأ بمنيو القالب لكن باسمه هو */
          var starter = await Store.templateMenu();
          starter.settings.shopName = shopName;
          starter.settings.tagline = '';
          await Cloud.createShop({
            slug: slug,
            name: shopName,
            ownerEmail: String(f.get('ownerEmail') || '').trim() || null,
            data: starter
          });
          editModal.hidden = true;
          toast('تم إنشاء المحل');
          await renderShops();
        } catch (err) { toast(err.message); }
        return;
      }

      if (editing.type === 'cat') {
        var name = String(f.get('name') || '').trim();
        if (!name) return;
        var snapshot = Store.data.categories.slice();
        if (editing.id) {
          Store.data.categories.find(function (c) { return c.id === editing.id; }).name = name;
        } else {
          Store.data.categories.push({
            id: Store.uid('c'), name: name, order: Store.data.categories.length + 1
          });
        }
        if (await persist()) { editModal.hidden = true; toast('تم الحفظ'); }
        else Store.data.categories = snapshot;
        renderCats(); renderItems();
      } else {
        var isNew = !editing.id;
        var item = isNew
          ? { id: Store.uid('i'), order: Store.data.items.length + 1 }
          : Store.data.items.find(function (i) { return i.id === editing.id; });
        var before = isNew ? null : JSON.parse(JSON.stringify(item));

        item.name       = String(f.get('name') || '').trim();
        item.categoryId = f.get('categoryId');
        item.price      = Number(f.get('price')) || 0;
        item.oldPrice   = f.get('oldPrice') ? Number(f.get('oldPrice')) : null;
        item.calories   = f.get('calories') === '' ? null : Number(f.get('calories'));
        item.desc       = String(f.get('desc') || '').trim();
        item.image      = String(f.get('image') || '').trim();
        item.available  = f.get('available') === 'on';

        if (isNew) Store.data.items.push(item);

        if (await persist()) { editModal.hidden = true; toast('تم الحفظ'); }
        else if (isNew) Store.data.items.pop();
        else Object.assign(item, before);
        renderItems();
      }
    } finally {
      btn.disabled = false;
    }
  });

  /* ============================================================
     معلومات المحل والإعدادات
     ============================================================ */
  var S = {
    shopName: 'setShopName', tagline: 'setTagline', currency: 'setCurrency',
    phone: 'setPhone', whatsapp: 'setWhatsapp', instagram: 'setInstagram',
    address: 'setAddress', hours: 'setHours', notes: 'setNotes'
  };

  function fillSettingsForm() {
    if (!Store.data) return;
    var s = Store.data.settings, c = s.contact || {};
    document.getElementById(S.shopName).value  = s.shopName || '';
    document.getElementById(S.tagline).value   = s.tagline || '';
    document.getElementById(S.currency).value  = s.currency || '';
    document.getElementById('setBg').value     = s.theme.bg;
    document.getElementById('setAccent').value = s.theme.accent;
    document.getElementById('setShowCal').checked = s.showCalories !== false;
    document.getElementById(S.phone).value     = c.phone || '';
    document.getElementById(S.whatsapp).value  = c.whatsapp || '';
    document.getElementById(S.instagram).value = c.instagram || '';
    document.getElementById(S.address).value   = c.address || '';
    document.getElementById(S.hours).value     = c.hours || '';
    document.getElementById(S.notes).value     = c.notes || '';
    document.getElementById('logoPreview').innerHTML =
      s.logo ? '<img src="' + esc(s.logo) + '" alt="">' : '';
    document.getElementById('setPass1').value = '';
    document.getElementById('setPass2').value = '';
  }

  document.getElementById('setLogoFile').addEventListener('change', async function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var prev = Store.data.settings.logo;
    try {
      var blob = await fileToBlob(f, 256);
      var url = await Cloud.uploadImage(Store.shop.slug, blob, 'logo');
      Store.data.settings.logo = url;
      document.getElementById('logoPreview').innerHTML = '<img src="' + esc(url) + '" alt="">';
      if (await persist()) toast('تم تحديث الشعار');
      else Store.data.settings.logo = prev;
    } catch (err) { toast(err.message); }
  });

  document.getElementById('saveInfoBtn').addEventListener('click', async function () {
    var btn = this;
    var s = Store.data.settings;
    var before = JSON.parse(JSON.stringify(s));
    btn.disabled = true;

    try {
      s.shopName = document.getElementById(S.shopName).value.trim();
      s.tagline  = document.getElementById(S.tagline).value.trim();
      s.currency = document.getElementById(S.currency).value.trim() || 'ر.س';
      s.theme.bg     = document.getElementById('setBg').value;
      s.theme.accent = document.getElementById('setAccent').value;
      s.showCalories = document.getElementById('setShowCal').checked;
      s.contact = {
        phone:     document.getElementById(S.phone).value.trim(),
        whatsapp:  document.getElementById(S.whatsapp).value.trim(),
        instagram: document.getElementById(S.instagram).value.trim(),
        address:   document.getElementById(S.address).value.trim(),
        hours:     document.getElementById(S.hours).value.trim(),
        notes:     document.getElementById(S.notes).value.trim()
      };

      if (!await persist()) { Store.data.settings = before; return; }

      /* كلمة المرور تتغيّر في حساب الدخول نفسه، مو داخل المنيو */
      var p1 = document.getElementById('setPass1').value;
      var p2 = document.getElementById('setPass2').value;
      if (p1 || p2) {
        if (p1 !== p2) { toast('كلمتا المرور غير متطابقتين'); return; }
        if (p1.length < 8) { toast('كلمة المرور لازم ٨ أحرف على الأقل'); return; }
        try {
          await Cloud.changePassword(p1);
          toast('تم حفظ المعلومات وتغيير كلمة المرور');
        } catch (err) { toast(err.message); return; }
      } else {
        toast('تم حفظ المعلومات');
      }
      fillSettingsForm();
    } finally {
      btn.disabled = false;
    }
  });

  /* ============================================================
     النسخ الاحتياطي
     ============================================================ */
  document.getElementById('exportBtn').addEventListener('click', function () {
    var blob = new Blob([Store.toJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'menu.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  document.getElementById('importFile').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        await Store.import(reader.result);
        global.renderMenu();
        open();
        toast('تم استيراد المنيو');
      } catch (err) { toast(err.message || 'الملف غير صالح'); }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  document.getElementById('reloadBtn').addEventListener('click', async function () {
    await Store.init();
    global.renderMenu();
    open();
    toast('تم التحديث من قاعدة البيانات');
  });

  document.getElementById('copyJsonBtn').addEventListener('click', async function () {
    var box = document.getElementById('jsonBox');
    try {
      await navigator.clipboard.writeText(box.value);
      toast('تم النسخ');
    } catch (e) {
      box.removeAttribute('readonly'); box.select(); document.execCommand('copy');
      box.setAttribute('readonly', 'readonly');
      toast('تم النسخ');
    }
  });

  global.Admin = {
    init: function () { /* الربط تم أعلاه عند تحميل الملف */ },
    requestAccess: requestAccess,
    open: open,
    close: close
  };

})(window);
