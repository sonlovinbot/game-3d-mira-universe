import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * PWA: sau khi build, liệt kê mọi file trong dist/ và sinh dist/sw.js từ src/pwa/sw-template.js.
 * Mã phiên bản = hash nội dung các file, nên mỗi lần đổi code/asset người chơi nhận bản mới.
 * Không cần thư viện ngoài (Workbox) — toàn bộ logic nằm trong sw-template.js.
 */
const SKIP = [/^sw\.js$/, /^pwa\//, /\.map$/, /^mira\.glb$/]; // mira.glb chỉ là bản dự phòng không xương
function miraPwa() {
  let outDir = 'dist';
  return {
    name: 'mira-pwa',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const files = [];
      const walk = (d) => readdirSync(d).forEach((f) => {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p); else files.push(relative(outDir, p).split(sep).join('/'));
      });
      walk(outDir);
      const list = files.filter((f) => !SKIP.some((r) => r.test(f))).sort();
      const h = createHash('sha256');
      for (const f of list) h.update(f).update(readFileSync(join(outDir, f)));
      const version = h.digest('hex').slice(0, 10);
      const precache = ['./', ...list.filter((f) => f !== 'index.html'), 'index.html'];
      const sw = readFileSync('src/pwa/sw-template.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('= __PRECACHE__;', `= ${JSON.stringify(precache)};`);
      writeFileSync(join(outDir, 'sw.js'), sw);
      const kb = list.reduce((s, f) => s + statSync(join(outDir, f)).size, 0) / 1024;
      console.log(`\n[mira-pwa] sw.js ${version}: ${precache.length} file, ${(kb / 1024).toFixed(1)} MB lưu offline`);
    },
  };
}

export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1200 }, plugins: [miraPwa()] });
