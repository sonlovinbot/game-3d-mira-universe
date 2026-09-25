# Mira · Đêm Linh Quang

Màn chơi 3D trên web (three.js): Mira đứng trên một hòn đảo bay lúc chạng vạng, nhặt Linh Tinh trên tế đàn, đánh 5 đợt yêu quái mạnh dần và trùm Hắc Nguyệt Thú. Mira có bộ xương thật: đứng thở, đi, chạy, phanh dừng, chém, bắn, nhảy, trúng đòn, gục ngã.

- Chơi online (sau khi deploy): https://sonlovinbot.github.io/game-3d-mira/
- Xem riêng các chuyển động: nút **Xem chuyển động** ở màn hình đầu, hoặc thêm `#studio` vào cuối link.

## Chạy trên máy

Nháy đúp `Chay-game.command` (macOS), hoặc:

```sh
npm install
npm run dev        # http://localhost:5190  (http://localhost:5190/#studio để vào thẳng Xưởng chuyển động)
npm run build      # web tĩnh trong dist/
npm test           # 10 bài test: luật chơi + thư viện chuyển động
```

## Nhân vật

| File | Dùng làm gì |
|---|---|
| `public/mira-rigged.glb` | Bản chính: mesh retopo từ Tripo, 19.577 tam giác, **65 xương chuẩn Mixamo**, skin 4 xương mỗi đỉnh, texture WebP 2048 px, nén Meshopt, 1,9 MB |
| `public/mira.glb` | Bản dự phòng không xương (0,99 MB). Chỉ dùng khi bản có rig không tải được |

Nguồn: thư mục `mira tripo rig animate/` do Tripo xuất (Retopology Quad 20k → Auto Rig Humanoid, preset Mixamo). **Các file GLB Tripo xuất ra không có clip hoạt ảnh nào** (mảng `animations` trống; `mira_walk.glb` và `mira_run.glb` còn không có skin). Vì vậy toàn bộ chuyển động hiện tại được dựng bằng code trên bộ xương của Tripo, xem phần dưới.

Tối ưu: `gltf-transform optimize mira_slash.glb mira-rigged.glb --texture-compress webp --texture-size 2048 --compress meshopt --simplify false` (10,4 MB → 1,9 MB, giữ nguyên xương và skin).

## Hệ thống chuyển động (`src/anim/`)

- **`rig.js`**: tìm xương theo tên Mixamo, lưu tư thế gốc. Mọi pose viết trong *hệ trục nhân vật* (+Z trước mặt, +Y lên, +X bên trái Mira), góc bằng độ, nên đọc như chỉnh tượng bằng tay: `LeftUpLeg x = -30` là đá đùi trái ra trước 30°.
- **`motions.js`**: thư viện 11 chuyển động: đứng thở, đi, chạy, dừng, chém, tia sáng, nhảy, lướt, trúng đòn, gục ngã, vẫy chào. Đi và chạy sinh từ **một** hàm dáng đi có tham số, nên pha trộn liên tục được.
- **`animator.js`**, chạy mỗi khung hình:
  - Đi ↔ chạy trộn theo tốc độ trên cùng một pha. Pha tiến theo quãng đường thật (tốc độ ÷ sải chân) nên chân không trượt.
  - Khi đang chạy mà dừng thì có động tác phanh rồi trở về thế đứng.
  - Chiêu thân trên (chém, bắn, trúng đòn) chồng lên bước chạy, nên vừa chạy vừa đánh được.
  - Bàn chân tự bám mặt đất; hông tự nâng hạ khi ngồi thụp hoặc sải chân.
  - Nghiêng người khi rẽ; phát sự kiện bước chân để có tiếng bước và bụi.

### Mở rộng

- **Thêm chuyển động tự dựng**: thêm một mục vào `MOTIONS` trong `src/anim/motions.js`. Nó tự xuất hiện trong Xưởng chuyển động.
- **Dùng clip keyframe thật** (Tripo xuất *kèm animation*, hoặc Mixamo):
  1. Chép file GLB vào `public/anims/`.
  2. Ghi tên file vào `public/anims/manifest.json`, ví dụ `["mira_run.glb"]`.
  3. Clip có tên trùng id chuyển động (`idle`, `walk`, `run`, `slash`…) sẽ thay bản dựng trong code, vẫn được trộn và đồng bộ pha như cũ.
- **Công cụ kiểm tra pose**: `npm run dev` rồi mở `/dev/rigtest.html`. Trang này hiện 3 góc nhìn của một pose để chỉnh góc xương.

## Xưởng chuyển động (trong game)

`src/studio.js`:
- Mỗi chuyển động phát riêng. Có 3 bài trình diễn đi vòng tròn, chạy vòng tròn, chạy → dừng → đứng.
- 6 góc camera, xoay tự do bằng chuột hoặc cảm ứng, tự quay vòng.
- Chỉnh tốc độ 0,1–1,5×, hiện bộ xương.
- Danh sách nút sinh tự động từ thư viện chuyển động.

## Âm thanh (`src/audio.js`, `public/audio/`)

- 20 hiệu ứng lấy từ bộ Mixkit Game SFX: cắt khoảng lặng, fade, chuẩn hoá đỉnh −3 dB, MP3 mono. Một nhạc nền lặp 30 giây, nối vòng bằng crossfade 1,2 giây để không bị tiếng tách.
- 3 kênh Nhạc / Hiệu ứng / Giao diện đi vào một limiter. Âm lượng Nhạc và Hiệu ứng chỉnh trong màn Tạm dừng.
- Mỗi âm có giới hạn số tiếng cùng lúc và khoảng cách tối thiểu; cao độ lệch nhẹ để tiếng lặp lại không đơ.
- Nhạc đổi theo trạng thái:
  - Màn hình đầu và lúc khám phá: lọc tối, nhỏ tiếng.
  - Khi đánh: mở đủ dải.
  - Trùm: chậm lại 5%.
  - Khi kết thúc: tắt dần.
  - Khi có fanfare hay nhặt Linh Tinh: nhạc tự nhỏ đi.
- Chỉ tổng hợp 2 âm mà bộ Mixkit không có: tiếng bước chân và tiếng đập đất. Cả hai là sóng sine đã lọc, ngắn, không kéo dài.

| Sự kiện | File nguồn Mixkit |
|---|---|
| Chém / trúng / chí mạng | martial-arts-fast-punch / small-hit / game-ball-tap |
| Tia sáng / Vòng sao, Tuyệt kỹ | retro-video-game-bubble-laser / magic-glitter-shot |
| Lướt / Mira bị đánh | player-jumping / boxer-getting-hit |
| Quái chết / trùm chết | video-game-blood-pop / game-blood-pop-slide |
| Linh hồn / Linh Tinh / Linh Tinh hiện ra / nâng cấp | winning-a-coin / video-game-treasure / unlock-new-item / winning-an-extra-bonus |
| Tuyệt kỹ sẵn sàng / bắt đầu đợt / hết đợt | unlock-game-notification / medieval-show-fanfare / completion-of-a-level |
| Thắng / thua / bấm nút / mở xưởng | game-level-completed / player-losing-or-failing / video-game-retro-click / quick-positive-notification |
| Nhạc nền | game-level-music |

## Deploy GitHub Pages

- `.github/workflows/deploy.yml`: mỗi lần push nhánh `main`, GitHub Actions chạy test, build và xuất bản `dist/` lên Pages. Lần đầu cần vào **Settings → Pages → Source → GitHub Actions**.
- `Day-len-GitHub.command`: nháy đúp để push bằng tài khoản git trên máy.

## Cấu trúc code

```
src/logic.js      Luật chơi thuần (quái, sóng, chiêu, va chạm) — có test
src/world.js      Bối cảnh đảo, trời, cỏ, tế đàn, cổng, Linh Tinh
src/player.js     Tải nhân vật, bóng xuyên vật cản, bóng mờ khi lướt, nối vào animator
src/anim/         Bộ xương, thư viện chuyển động, animator
src/studio.js     Xưởng chuyển động trong game
src/enemies.js    Quái và trùm
src/skills.js     Chiêu của Mira
src/fx.js         Hạt, vệt chém, sóng, số sát thương
src/input.js      Bàn phím, chuột, cần ảo, nút chạm
src/audio.js      Âm thanh
src/main.js       Vòng lặp, camera, luồng màn chơi, HUD
```

`?debug` trên URL mở `window.__MIRA__` để kiểm thử (`advance`, `teleport`, `god`, `killAll`, `skipTo`, `openStudio`, `info`).
