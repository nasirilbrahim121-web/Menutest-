/* ============================================================
   admin.js — لوحة التحكم المخفية
   الدخول: ٥ ضغطات على اسم المحل، أو إضافة #admin للرابط
   ============================================================ */
(function (global) {
  'use strict';

  var panel      = document.getElementById('adminPanel');
  var loginModal = document.getElementById('loginModal');
  var loginForm  = document.getElementById('loginForm');
  var loginPass  = document.getElementById('loginPass');
  var loginError = document.getElementById('loginError');
  var editModal  = document.getElementById('editModal');
  var editForm   = document.getElementById('editForm');
  var editFields = document.getElementById('editFields');
  var editTitle  = document.getElementById('editTitle');

  var editing = null;   /* {type:'item'|'cat', id:string|null} */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function persist() {
    if (!Store.save()) {
      toast('تعذّر الحفظ — مساحة المتصفح ممتلئة. انشر تعديلاتك أولاً، أو استخدم صوراً أصغر.');
      return false;
    }
    global.renderMenu();
    refreshPublishBadge();
    return true;
  }

  /* ------------------ ضغط الصور قبل الحفظ ------------------ */
  function fileToImage(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('decode')); };
        img.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
     الدخول والخروج
     ============================================================ */
  function requestAccess() {
    if (Store.isLoggedIn()) return open();
    loginError.hidden = true;
    loginPass.value = '';
    loginModal.hidden = false;
    setTimeout(function () { loginPass.focus(); }, 50);
  }

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var ok = await Store.checkPassword(loginPass.value);
    if (!ok) { loginError.hidden = false; loginPass.select(); return; }
    Store.setLoggedIn(true);
    loginModal.hidden = true;
    open();
  });

  function open() {
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    fillSettingsForm();
    fillPublishForm();
    refreshPublishBadge();
    renderItems();
    renderCats();
    document.getElementById('jsonBox').value = Store.toJSON();
  }

  function close() {
    panel.hidden = true;
    document.body.style.overflow = '';
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

  /* ============================================================
     النشر المباشر إلى المستودع
     ============================================================ */
  var ghStatus = document.getElementById('ghStatus');

  function setStatus(msg, kind) {
    ghStatus.textContent = msg;
    ghStatus.className = 'pub-status' + (kind ? ' is-' + kind : '');
    ghStatus.hidden = !msg;
  }

  function fillPublishForm() {
    var c = Publish.loadConfig();
    document.getElementById('ghOwner').value  = c.owner;
    document.getElementById('ghRepo').value   = c.repo;
    document.getElementById('ghBranch').value = c.branch;
    document.getElementById('ghToken').value  = c.token;
  }

  function readPublishForm() {
    return {
      owner:  document.getElementById('ghOwner').value.trim(),
      repo:   document.getElementById('ghRepo').value.trim(),
      branch: document.getElementById('ghBranch').value.trim() || 'main',
      token:  document.getElementById('ghToken').value.trim()
    };
  }

  /* نقطة حمراء على زر النشر إذا فيه تعديلات ما انتشرت */
  function refreshPublishBadge() {
    var btn = document.getElementById('topPublishBtn');
    var pending = Store.hasUnpublished();
    btn.classList.toggle('has-changes', pending);
    btn.textContent = pending ? 'نشر للزبائن ●' : 'نشر للزبائن';
  }

  document.getElementById('ghSaveCfg').addEventListener('click', function () {
    if (Publish.saveConfig(readPublishForm())) setStatus('تم حفظ بيانات الربط في هذا الجهاز.', 'ok');
    else setStatus('تعذّر الحفظ في هذا المتصفح.', 'err');
  });

  document.getElementById('ghTestBtn').addEventListener('click', async function () {
    Publish.saveConfig(readPublishForm());
    setStatus('جاري الاختبار…');
    try { setStatus(await Publish.test(), 'ok'); }
    catch (e) { setStatus(e.message, 'err'); }
  });

  async function runPublish(btn) {
    Publish.saveConfig(readPublishForm());
    btn.disabled = true;
    try {
      var res = await Publish.publish(function (m) { setStatus(m); });
      setStatus('تم النشر بنجاح' + (res.images ? ' (ورفعنا ' + res.images + ' صورة)' : '') +
        '. الموقع يتحدّث للزبائن خلال دقيقة تقريباً.', 'ok');
      renderItems();
      global.renderMenu();
      document.getElementById('jsonBox').value = Store.toJSON();
      toast('تم النشر');
    } catch (e) {
      setStatus(e.message, 'err');
      toast('ما تم النشر');
    } finally {
      btn.disabled = false;
      refreshPublishBadge();
    }
  }

  document.getElementById('ghPublishBtn').addEventListener('click', function () {
    runPublish(this);
  });

  document.getElementById('topPublishBtn').addEventListener('click', function () {
    var btn = this;
    /* ننقل المستخدم لتبويب النشر حتى يشوف الحالة والأخطاء */
    document.querySelector('.atab[data-view="backup"]').click();
    if (!Publish.isConfigured()) {
      setStatus('عبّي بيانات الربط أول مرة، بعدها النشر بضغطة وحدة.', 'err');
      document.getElementById('ghToken').focus();
      return;
    }
    runPublish(btn);
  });
  document.getElementById('logoutBtn').addEventListener('click', function () {
    Store.setLoggedIn(false);
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
    fillFilter();
    var box = document.getElementById('adminItems');
    var cats = Store.categories();
    var chosen = filterCat.value;
    var list = cats.filter(function (c) { return !chosen || c.id === chosen; });

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

  document.getElementById('adminItems').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = btn.closest('.arow').dataset.id;
    var item = Store.data.items.find(function (i) { return i.id === id; });
    if (!item) return;
    var act = btn.dataset.act;

    if (act === 'edit') return openItemForm(item);

    if (act === 'toggle') {
      item.available = !item.available;
      persist(); renderItems(); return;
    }

    if (act === 'del') {
      if (!confirm('حذف «' + item.name + '» نهائياً؟')) return;
      Store.data.items = Store.data.items.filter(function (i) { return i.id !== id; });
      persist(); renderItems(); toast('تم الحذف'); return;
    }

    if (act === 'up' || act === 'down') {
      var siblings = Store.itemsOf(item.categoryId);
      var idx = siblings.findIndex(function (i) { return i.id === id; });
      var swapWith = siblings[act === 'up' ? idx - 1 : idx + 1];
      if (!swapWith) return;
      var tmp = item.order; item.order = swapWith.order; swapWith.order = tmp;
      persist(); renderItems();
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
      '<label class="field"><span>مسار الصورة أو رابطها</span>' +
        '<input class="input" name="image" id="imgPath" placeholder="images/mocha.jpg" value="' + esc(it.image) + '"></label>' +
      '<label class="field"><span>أو ارفع صورة من الجهاز</span>' +
        '<input class="input" type="file" id="imgFile" accept="image/*"></label>' +
      '<div id="imgPrev" class="logo-preview">' + (it.image ? '<img src="' + esc(it.image) + '" alt="">' : '') + '</div>' +
      '<label class="check"><input type="checkbox" name="available"' + (it.available !== false ? ' checked' : '') + '> <span>متوفر للطلب</span></label>';

    document.getElementById('imgFile').addEventListener('change', async function (e) {
      var f = e.target.files[0];
      if (!f) return;
      try {
        var dataUrl = await fileToImage(f, 800);
        document.getElementById('imgPath').value = dataUrl;
        document.getElementById('imgPrev').innerHTML = '<img src="' + dataUrl + '" alt="">';
      } catch (err) { toast('تعذّرت قراءة الصورة'); }
    });

    editModal.hidden = false;
  }

  /* ============================================================
     الأقسام
     ============================================================ */
  function renderCats() {
    var box = document.getElementById('adminCats');
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

  document.getElementById('adminCats').addEventListener('click', function (e) {
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
      Store.data.categories = Store.data.categories.filter(function (c) { return c.id !== id; });
      Store.data.items = Store.data.items.filter(function (i) { return i.categoryId !== id; });
      persist(); renderCats(); renderItems(); toast('تم الحذف'); return;
    }

    if (act === 'up' || act === 'down') {
      var cats = Store.categories();
      var idx = cats.findIndex(function (c) { return c.id === id; });
      var swapWith = cats[act === 'up' ? idx - 1 : idx + 1];
      if (!swapWith) return;
      var tmp = cat.order; cat.order = swapWith.order; swapWith.order = tmp;
      persist(); renderCats(); renderItems();
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
  editForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(editForm);

    if (editing.type === 'cat') {
      var name = String(f.get('name') || '').trim();
      if (!name) return;
      if (editing.id) {
        Store.data.categories.find(function (c) { return c.id === editing.id; }).name = name;
      } else {
        Store.data.categories.push({
          id: Store.uid('c'), name: name, order: Store.data.categories.length + 1
        });
      }
      persist(); renderCats(); renderItems();
    } else {
      var item = editing.id
        ? Store.data.items.find(function (i) { return i.id === editing.id; })
        : { id: Store.uid('i'), order: Store.data.items.length + 1 };

      item.name       = String(f.get('name') || '').trim();
      item.categoryId = f.get('categoryId');
      item.price      = Number(f.get('price')) || 0;
      item.oldPrice   = f.get('oldPrice') ? Number(f.get('oldPrice')) : null;
      item.calories   = f.get('calories') === '' ? null : Number(f.get('calories'));
      item.desc       = String(f.get('desc') || '').trim();
      item.image      = String(f.get('image') || '').trim();
      item.available  = f.get('available') === 'on';

      if (!editing.id) Store.data.items.push(item);
      persist(); renderItems();
    }

    editModal.hidden = true;
    toast('تم الحفظ');
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
    try {
      var dataUrl = await fileToImage(f, 256);
      Store.data.settings.logo = dataUrl;
      document.getElementById('logoPreview').innerHTML = '<img src="' + dataUrl + '" alt="">';
      persist();
      toast('تم تحديث الشعار');
    } catch (err) { toast('تعذّرت قراءة الصورة'); }
  });

  document.getElementById('saveInfoBtn').addEventListener('click', async function () {
    var s = Store.data.settings;
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

    var p1 = document.getElementById('setPass1').value;
    var p2 = document.getElementById('setPass2').value;
    if (p1 || p2) {
      if (p1 !== p2) { toast('كلمتا المرور غير متطابقتين'); return; }
      if (p1.length < 4) { toast('كلمة المرور قصيرة جداً'); return; }
      await Store.setPassword(p1);
    }

    if (persist()) {
      fillSettingsForm();
      toast('تم حفظ المعلومات');
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
    reader.onload = function () {
      try {
        Store.import(reader.result);
        global.renderMenu();
        open();
        toast('تم استيراد المنيو');
      } catch (err) { toast('الملف غير صالح'); }
    };
    reader.readAsText(f);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', async function () {
    if (!confirm('سيتم حذف كل التعديلات المحفوظة في هذا الجهاز والرجوع للمنيو الأصلي. متأكد؟')) return;
    await Store.reset();
    global.renderMenu();
    open();
    toast('تم الاسترجاع');
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
