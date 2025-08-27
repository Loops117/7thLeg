// home.gallery.once.js — lightbox for bulletin thumbnails (capture-phase, class-agnostic)
(function(){
  if (window.__bulletinGalleryOnceV2) return;
  window.__bulletinGalleryOnceV2 = true;

  const SIGN_CACHE = new Map(); // path -> signedUrl
  const BUCKET = 'bulletin-images';

  const qs  = (sel, root=document) => root.querySelector(sel);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function ensureModal(){
    if (qs('#galleryModal')) return;
    const modal = document.createElement('div');
    modal.id = 'galleryModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content bg-dark text-white position-relative">
          <div class="modal-header border-0">
            <h6 class="modal-title">Image</h6>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body d-flex justify-content-center align-items-center" style="min-height:60vh;overflow:hidden;">
            <img id="galleryModalImage" src="" alt="" style="max-width:100%;max-height:80vh; transform-origin:center center;"/>
          </div>
          <div class="modal-footer justify-content-between">
            <div class="btn-group">
              <button id="btn-prev" class="btn btn-outline-light">‹ Prev</button>
              <button id="btn-next" class="btn btn-outline-light">Next ›</button>
            </div>
            <div class="btn-group">
              <button id="btn-zoom-out" class="btn btn-outline-light">-</button>
              <button id="btn-zoom-reset" class="btn btn-outline-light">Reset</button>
              <button id="btn-zoom-in" class="btn btn-outline-light">+</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  async function signIfNeeded(urlOrPath){
    if (!urlOrPath) return urlOrPath;
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    if (SIGN_CACHE.has(urlOrPath)) return SIGN_CACHE.get(urlOrPath);
    const sb = window.supabase;
    try{
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(urlOrPath, 60*60);
      const u = data?.signedUrl || urlOrPath;
      SIGN_CACHE.set(urlOrPath, u);
      return u;
    }catch{ return urlOrPath; }
  }

  function collectGallery(clickedEl){
    const gallery = clickedEl.closest('.bulletin-gallery');
    if (!gallery) return { list: [], index: 0 };
    // prefer anchors, else fall back to images
    const anchors = qsa('a.bulletin-thumb, a[href]', gallery).filter(a => a.querySelector('img') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(a.getAttribute('href')||''));
    const images  = qsa('img.gallery-thumb, .bulletin-gallery img', gallery);
    const nodes = anchors.length ? anchors : images;
    const list = nodes.map(el => {
      const path = el.getAttribute('data-supa-path') || el.dataset?.supaPath;
      const href = el.getAttribute('href') || el.getAttribute('src');
      return path || href || '';
    }).filter(Boolean);
    const index = Math.max(0, nodes.indexOf(clickedEl.closest('a, img')));
    return { list, index };
  }

  function openModalWith(urls, start=0){
    ensureModal();
    const img = qs('#galleryModalImage');
    let i = start|0, scale = 1, panX = 0, panY = 0;

    function setImg(idx){
      i = (idx + urls.length) % urls.length;
      img.dataset.index = i;
      img.src = urls[i];
      reset(false);
    }
    function reset(apply = true){
      scale = 1; panX = 0; panY = 0;
      if (apply) applyTransform();
    }
    function applyTransform(){
      img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
      img.style.cursor = scale>1 ? 'grab' : 'default';
    }
    function next(){ setImg(i+1); }
    function prev(){ setImg(i-1); }

    let isDown = false, lastX=0, lastY=0;
    function onDown(e){ isDown = true; (img.style.cursor='grabbing'); const pt = (e.touches?.[0])||e; lastX=pt.clientX; lastY=pt.clientY; }
    function onMove(e){ if(!isDown||scale<=1) return; const pt=(e.touches?.[0])||e; panX += (pt.clientX-lastX); panY += (pt.clientY-lastY); lastX=pt.clientX; lastY=pt.clientY; applyTransform(); }
    function onUp(){ isDown = false; if(scale>1) img.style.cursor='grab'; }

    qs('#btn-next').onclick = next;
    qs('#btn-prev').onclick = prev;
    qs('#btn-zoom-in').onclick = () => { scale = Math.min(6, scale + 0.2); applyTransform(); };
    qs('#btn-zoom-out').onclick = () => { scale = Math.max(1, scale - 0.2); applyTransform(); };
    qs('#btn-zoom-reset').onclick = () => { reset(true); };

    img.onmousedown = onDown;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    img.ontouchstart = onDown;
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    window.addEventListener('keydown', (e)=>{
      if (!document.body.classList.contains('modal-open')) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === '+') { scale = Math.min(6, scale + 0.2); applyTransform(); }
      else if (e.key === '-') { scale = Math.max(1, scale - 0.2); applyTransform(); }
      else if (e.key === '0') reset(true);
      else if (e.key === 'Escape') hideFallback();
    });

    // show via Bootstrap if present; else fallback overlay
    const modalEl = qs('#galleryModal');
    let Modal = window.bootstrap?.Modal || (window.bootstrap && window.bootstrap.Modal);
    const inst = Modal ? Modal.getOrCreateInstance(modalEl) : null;
    if (inst) {
      inst.show();
    } else {
      // Fallback: force modal visible and create a backdrop
      modalEl.classList.add('show');
      modalEl.style.display = 'block';
      modalEl.removeAttribute('aria-hidden');
      modalEl.setAttribute('aria-modal','true');
      document.body.classList.add('modal-open');
      if (!qs('#galleryBackdrop')) {
        const bd = document.createElement('div');
        bd.id = 'galleryBackdrop';
        bd.className = 'modal-backdrop fade show';
        bd.style.display = 'block';
        document.body.appendChild(bd);
        bd.addEventListener('click', hideFallback);
      }
      qs('#galleryModal .btn-close')?.addEventListener('click', hideFallback, { once: true });
    }

    function hideFallback(){
      modalEl.classList.remove('show');
      modalEl.style.display = 'none';
      modalEl.setAttribute('aria-hidden','true');
      document.body.classList.remove('modal-open');
      const bd = qs('#galleryBackdrop'); if (bd) bd.remove();
    }

    setImg(i);
  }

  async function onGalleryClickCapture(e){
    const target = e.target.closest('.bulletin-gallery a, .bulletin-gallery img, img.gallery-thumb, a > img.gallery-thumb');
    if (!target) return; console.debug('🖼️ viewer intercepted', target);
    // Only intercept left clicks without modifier keys
    const isLeftClick = (e.button === 0 || e.button === undefined || e.button === null);
if (!isLeftClick || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Prevent browser navigation before anyone else handles it
    e.preventDefault();
    e.stopPropagation();

    const { list, index } = collectGallery(target);
    if (!list.length) return;
    const urls = await Promise.all(list.map(signIfNeeded));
    openModalWith(urls, index);
  }

  window.__openBulletinGallery = async function(target){
    const { list, index } = collectGallery(target);
    if (!list.length) return;
    const urls = await Promise.all(list.map(signIfNeeded));
    openModalWith(urls, index);
  };

  function init(){ console.info('🖼️ viewer ready');
    ensureModal();
    // Capture-phase to beat default navigation/open-in-new-tab
    document.addEventListener('click', onGalleryClickCapture, { capture: true });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();