// Скрипт сохранённого документа: просмотр картинок по щелчку и подсветка текущего раздела в содержании.
(function () {
  var imgs = [].slice.call(document.querySelectorAll('main.hn-doc img:not(.hn-emoji)'));
  var box = document.querySelector('.hn-lightbox');
  if (box && imgs.length) {
    var big = box.querySelector('img');
    var cap = box.querySelector('.hn-caption');
    var current = 0;
    var show = function (i) {
      current = (i + imgs.length) % imgs.length;
      big.src = imgs[current].src;
      big.alt = imgs[current].alt || '';
      cap.textContent = (current + 1) + ' / ' + imgs.length + (imgs[current].alt ? ' · ' + imgs[current].alt : '');
      box.classList.remove('full');
    };
    var close = function () { box.hidden = true; document.body.style.overflow = ''; };
    imgs.forEach(function (img, i) {
      if (img.closest('a')) return;
      img.addEventListener('click', function () { show(i); box.hidden = false; document.body.style.overflow = 'hidden'; });
    });
    big.addEventListener('click', function (e) { e.stopPropagation(); box.classList.toggle('full'); });
    box.addEventListener('click', close);
    box.querySelector('.hn-close').addEventListener('click', function (e) { e.stopPropagation(); close(); });
    box.querySelector('.hn-prev').addEventListener('click', function (e) { e.stopPropagation(); show(current - 1); });
    box.querySelector('.hn-next').addEventListener('click', function (e) { e.stopPropagation(); show(current + 1); });
    if (imgs.length < 2) { box.querySelector('.hn-prev').hidden = true; box.querySelector('.hn-next').hidden = true; }
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(current + 1);
      if (e.key === 'ArrowLeft') show(current - 1);
    });
  }
  // Холст: высота — по самому нижнему листу. Если окно уже холста, листы встают друг под другом сверху вниз.
  var canvas = document.querySelector('.hn-canvas');
  if (canvas) {
    var frames = [].slice.call(canvas.querySelectorAll(':scope > .hn-frame'));
    frames.sort(function (a, b) { return (+a.dataset.y - +b.dataset.y) || (+a.dataset.x - +b.dataset.x); })
      .forEach(function (f, i) { f.style.order = i; });
    var width = parseInt(canvas.style.width, 10) || 0;
    var fit = function () {
      var main = canvas.parentElement;
      document.body.classList.toggle('stacked', main.clientWidth + 2 < width);
      if (document.body.classList.contains('stacked')) return;
      var bottom = 0;
      frames.forEach(function (f) { bottom = Math.max(bottom, f.offsetTop + f.offsetHeight); });
      canvas.style.height = (bottom + 40) + 'px';
    };
    fit();
    window.addEventListener('resize', fit);
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas.parentElement);
  }
  // Кнопка-значок «Содержание» прячет и показывает содержание; выбор запоминается в этом браузере.
  var toggle = document.querySelector('.hn-toc-toggle');
  if (toggle) {
    var key = 'hn-toc-hidden:' + location.pathname;
    var setHidden = function (hidden) {
      document.body.classList.toggle('toc-hidden', hidden);
      toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    };
    var saved = null;
    try { saved = localStorage.getItem(key); } catch (e) { /* хранилище недоступно */ }
    setHidden(saved === '1');
    toggle.addEventListener('click', function () {
      var hidden = !document.body.classList.contains('toc-hidden');
      setHidden(hidden);
      try { localStorage.setItem(key, hidden ? '1' : '0'); } catch (e) { /* без запоминания */ }
    });
  }
  var links = [].slice.call(document.querySelectorAll('.hn-toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          links.forEach(function (a) { a.classList.remove('active'); });
          byId[en.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '0px 0px -70% 0px' });
    Object.keys(byId).forEach(function (id) { var h = document.getElementById(id); if (h) obs.observe(h); });
  }
})();
