/* ============================================================
   app.js — واجهة الزبون
   ============================================================ */
(function (global) {
  'use strict';

  var OFFERS_ID = '__offers__';
  var state = { activeCat: null, query: '' };

  var el = {
    shopName:   document.getElementById('shopName'),
    tagline:    document.getElementById('shopTagline'),
    logo:       document.getElementById('brandLogo'),
    brand:      document.getElementById('brandTap'),
    search:     document.getElementById('searchInput'),
    clearBtn:   document.getElementById('clearSearch'),
    tabs:       document.getElementById('tabs'),
    list:       document.getElementById('list'),
    empty:      document.getElementById('emptyState'),
    footInfo:   document.getElementById('footInfo'),
    toTop:      document.getElementById('toTop'),
    itemModal:  document.getElementById('itemModal'),
    toast:      document.getElementById('toast')
  };

  /* ------------------ أدوات ------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    return Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function priceHTML(item) {
    var cur = esc(Store.data.settings.currency);
    var out = '<div class="price"><span class="cur">' + cur + '</span>' + money(item.price);
    if (item.oldPrice && item.oldPrice > item.price) {
      out += '<span class="old">' + money(item.oldPrice) + '</span>';
    }
    return out + '</div>';
  }

  function thumbHTML(item, cls) {
    if (!item.image) return '<div class="' + cls + ' ph">لا توجد صورة</div>';
    return '<img class="' + cls + '" src="' + esc(item.image) + '" alt="' + esc(item.name) +
           '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;' + cls +
           ' ph&quot;>لا توجد صورة</div>\'">';
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.hidden = true; }, 2200);
  }
  global.toast = toast;

  /* ------------------ المظهر والهوية ------------------ */
  function applyBranding() {
    var s = Store.data.settings;
    document.documentElement.style.setProperty('--bg', s.theme.bg);
    document.documentElement.style.setProperty('--accent', s.theme.accent);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', s.theme.bg);

    document.title = s.shopName || 'المنيو';
    el.shopName.textContent = s.shopName || '';
    el.tagline.textContent = s.tagline || '';

    if (s.logo) { el.logo.src = s.logo; el.logo.hidden = false; }
    else { el.logo.hidden = true; }

    renderFooter();
  }

  function renderFooter() {
    var c = Store.data.settings.contact || {};
    var parts = [];
    if (c.phone) parts.push('<a href="tel:' + esc(c.phone) + '">📞 ' + esc(c.phone) + '</a>');
    if (c.whatsapp) parts.push('<a href="https://wa.me/' + esc(String(c.whatsapp).replace(/\D/g, '')) +
      '" target="_blank" rel="noopener">واتساب</a>');
    if (c.instagram) parts.push('<a href="https://instagram.com/' +
      esc(String(c.instagram).replace(/^@/, '')) + '" target="_blank" rel="noopener">انستقرام</a>');
    if (c.address) parts.push('<span>📍 ' + esc(c.address) + '</span>');
    if (c.hours) parts.push('<span>🕒 ' + esc(c.hours) + '</span>');
    el.footInfo.innerHTML = parts.join('');
  }

  /* ------------------ الأقسام ------------------ */
  function visibleCategories() {
    var cats = Store.categories().filter(function (c) { return Store.itemsOf(c.id).length > 0; });
    if (Store.offers().length) {
      cats.unshift({ id: OFFERS_ID, name: 'العروض', count: Store.offers().length, isOffers: true });
    }
    return cats;
  }

  function renderTabs() {
    var cats = visibleCategories();
    if (!cats.length) { el.tabs.innerHTML = ''; return; }
    if (!state.activeCat || !cats.some(function (c) { return c.id === state.activeCat; })) {
      /* نبدأ من أول قسم حقيقي، وقسم العروض يبقى متاحاً بالضغط عليه */
      var first = cats.find(function (c) { return c.id !== OFFERS_ID; }) || cats[0];
      state.activeCat = first.id;
    }
    el.tabs.innerHTML = cats.map(function (c) {
      var icon = c.isOffers
        ? '<svg viewBox="0 0 24 24"><path d="M10 3H4a1 1 0 00-1 1v6l10.5 10.5a1.5 1.5 0 002.12 0l5.88-5.88a1.5 1.5 0 000-2.12L11 3zm-3 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>'
        : '';
      var badge = c.count ? '<span class="badge">' + c.count + '</span>' : '';
      return '<button type="button" class="tab' + (c.id === state.activeCat ? ' is-active' : '') +
        '" data-cat="' + esc(c.id) + '">' + icon + esc(c.name) + badge + '</button>';
    }).join('');
  }

  /* ------------------ قائمة الأصناف ------------------ */
  function itemHTML(item) {
    var s = Store.data.settings;
    var cal = (s.showCalories && item.calories != null && item.calories !== '')
      ? '<p class="item-cal">' + esc(item.calories) + ' سعرة حرارية</p>' : '';
    var desc = item.desc ? '<p class="item-desc">' + esc(item.desc) + '</p>' : '';
    var badge = !item.available ? ' <span class="out-badge">غير متوفر</span>' : '';
    return '<button type="button" class="item' + (item.available ? '' : ' is-out') +
      '" data-item="' + esc(item.id) + '">' +
        '<div class="item-info">' +
          '<p class="item-name">' + esc(item.name) + badge + '</p>' + cal + desc + priceHTML(item) +
        '</div>' +
        thumbHTML(item, 'item-thumb') +
      '</button>';
  }

  function currentItems() {
    var items;
    if (state.query) {
      var q = state.query.trim().toLowerCase();
      items = Store.data.items.filter(function (i) {
        return (i.name + ' ' + (i.desc || '') + ' ' + Store.categoryName(i.categoryId))
          .toLowerCase().indexOf(q) !== -1;
      });
    } else if (state.activeCat === OFFERS_ID) {
      items = Store.offers();
    } else {
      items = Store.itemsOf(state.activeCat);
    }
    return items;
  }

  function renderList() {
    var items = currentItems();
    el.empty.hidden = items.length > 0;

    if (state.query) {
      /* أثناء البحث نعرض النتائج مجمّعة حسب القسم */
      var groups = {};
      items.forEach(function (i) { (groups[i.categoryId] = groups[i.categoryId] || []).push(i); });
      el.list.innerHTML = Object.keys(groups).map(function (cid) {
        return '<h2 class="cat-title">' + esc(Store.categoryName(cid)) + '</h2>' +
               groups[cid].map(itemHTML).join('');
      }).join('');
    } else {
      el.list.innerHTML = items.map(itemHTML).join('');
    }
  }

  function render() {
    applyBranding();
    renderTabs();
    renderList();
  }
  global.renderMenu = render;

  /* ------------------ نافذة الصنف ------------------ */
  function openItem(id) {
    var item = Store.data.items.find(function (i) { return i.id === id; });
    if (!item) return;
    var s = Store.data.settings;
    document.getElementById('mdImgWrap').innerHTML = item.image
      ? '<img src="' + esc(item.image) + '" alt="' + esc(item.name) +
        '" onerror="this.parentNode.innerHTML=\'\'">' : '';
    document.getElementById('mdName').textContent = item.name;
    document.getElementById('mdCal').textContent =
      (s.showCalories && item.calories != null && item.calories !== '')
        ? item.calories + ' سعرة حرارية' : '';
    document.getElementById('mdDesc').textContent = item.desc || '';
    document.getElementById('mdPrice').innerHTML =
      priceHTML(item) + (item.available ? '' : ' <span class="out-badge">غير متوفر</span>');
    el.itemModal.hidden = false;
  }

  /* ------------------ الأحداث ------------------ */
  el.tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    state.activeCat = btn.dataset.cat;
    if (state.query) { state.query = ''; el.search.value = ''; el.clearBtn.hidden = true; }
    renderTabs();
    renderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.list.addEventListener('click', function (e) {
    var btn = e.target.closest('.item');
    if (btn) openItem(btn.dataset.item);
  });

  el.search.addEventListener('input', function () {
    state.query = el.search.value;
    el.clearBtn.hidden = !state.query;
    renderList();
  });

  el.clearBtn.addEventListener('click', function () {
    el.search.value = '';
    state.query = '';
    el.clearBtn.hidden = true;
    renderList();
  });

  /* إغلاق أي نافذة */
  document.addEventListener('click', function (e) {
    if (e.target.matches('[data-close]') || e.target.classList.contains('overlay')) {
      var ov = e.target.closest('.overlay');
      if (ov) ov.hidden = true;
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function (o) { o.hidden = true; });
    }
  });

  /* زر الصعود لأعلى */
  window.addEventListener('scroll', function () {
    el.toTop.classList.toggle('show', window.scrollY > 300);
  }, { passive: true });
  el.toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ------------------ المدخل المخفي للإدارة ------------------
     خمس ضغطات متتابعة على اسم المحل خلال ٣ ثوانٍ، أو الرابط #admin */
  var taps = [];
  el.brand.addEventListener('click', function () {
    var now = Date.now();
    taps.push(now);
    taps = taps.filter(function (t) { return now - t < 3000; });
    if (taps.length >= 5) {
      taps = [];
      global.Admin.requestAccess();
    }
  });

  function checkHash() {
    if (location.hash === '#admin') {
      try { history.replaceState(null, '', location.pathname + location.search); }
      catch (e) { /* بعض المتصفحات تمنعها عند فتح الملف مباشرة */ }
      global.Admin.requestAccess();
    }
  }
  window.addEventListener('hashchange', checkHash);

  /* ------------------ الإقلاع ------------------ */
  Store.init().then(function () {
    render();
    global.Admin.init();
    checkHash();
  });

})(window);
