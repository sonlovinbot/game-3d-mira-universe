/**
 * PWA phía trang: đăng ký service worker, nút "Cài về máy", báo có bản mới, báo trạng thái offline.
 * Chỉ chạy ở bản build (npm run build / GitHub Pages); khi chạy `npm run dev` thì bỏ qua để không
 * dính bộ nhớ đệm lúc đang sửa code.
 */
const $ = (s) => document.querySelector(s);

export function isStandalone() {
  return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

let noteTimer = 0;
/** Thanh báo nhỏ ở đỉnh màn hình (nằm ngoài HUD nên hiện được cả ở màn hình đầu). */
function note(msg, action) {
  const bar = $('#pwa-bar');
  if (!bar) return;
  bar.querySelector('span').textContent = msg;
  const b = bar.querySelector('button');
  b.classList.toggle('hidden', !action);
  if (action) { b.textContent = action.label; b.onclick = action.run; }
  bar.classList.remove('hidden');
  clearTimeout(noteTimer);
  if (!action) noteTimer = setTimeout(() => bar.classList.add('hidden'), 4200);
}

export function initPwa({ onBeforeUpdate = () => {} } = {}) {
  const btn = $('#btn-install');
  const hint = $('#install-hint');
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  let deferred = null;

  if (isStandalone()) document.documentElement.classList.add('pwa');

  // Chrome / Edge / Android: trình duyệt báo có thể cài → hiện nút.
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn?.classList.remove('hidden');
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    btn?.classList.add('hidden');
    note('Đã cài Mira — mở từ màn hình chính để chơi toàn màn hình, không cần mạng');
  });

  // iPhone / iPad (Safari không có lời mời cài): hiện nút mở hướng dẫn "Thêm vào MH chính".
  if (isIOS && !isStandalone()) btn?.classList.remove('hidden');

  if (btn) btn.onclick = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') btn.classList.add('hidden');
    } else if (isIOS) {
      hint?.classList.remove('hidden');
    }
  };
  hint?.querySelector('button')?.addEventListener('click', () => hint.classList.add('hidden'));

  addEventListener('offline', () => note('Mất mạng — vẫn chơi được bình thường'));

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let updating = false; // true khi người chơi bấm "Cập nhật"
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (w) => {
      if (!w || !navigator.serviceWorker.controller) return; // lần cài đầu: không cần báo
      note('Đã có bản Mira mới', { label: 'Cập nhật', run: () => { updating = true; onBeforeUpdate(); w.postMessage('skip-waiting'); } });
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    // kiểm tra bản mới khi người chơi quay lại tab
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((err) => console.warn('[pwa] không đăng ký được service worker', err));

  // Chỉ tải lại sau khi người chơi bấm "Cập nhật"; lần cài đầu (clients.claim) thì không.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updating) return;
    reloading = true;
    location.reload();
  });
}
