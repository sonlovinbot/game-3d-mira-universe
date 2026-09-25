# Mira · Đêm Linh Quang

![Mira trên hòn đảo bay](docs/images/game/01-man-hinh-dau.jpg)

Màn chơi 3D trên web (three.js): Mira đứng trên một hòn đảo bay lúc chạng vạng, nhặt Linh Tinh trên tế đàn, đánh 5 đợt yêu quái mạnh dần và trùm Hắc Nguyệt Thú. Mira có bộ xương thật: đứng thở, đi, chạy, phanh dừng, chém, bắn, nhảy, trúng đòn, gục ngã.

- **Chơi online:** https://sonlovinbot.github.io/game-3d-mira-universe/
- **Xem riêng các chuyển động:** nút **Xem chuyển động** ở màn hình đầu, hoặc https://sonlovinbot.github.io/game-3d-mira-universe/#studio
- Chơi được trên máy tính (bàn phím, chuột) và điện thoại (cần ảo, nút chạm).

## Cách chơi

| Hành động | Bàn phím | Cảm ứng |
|---|---|---|
| Di chuyển | W A S D / phím mũi tên | Kéo nửa trái màn hình |
| Chém Nguyệt Quang | J / chuột trái | Nút lớn bên phải |
| Tia Linh Quang (bám mục tiêu) | K | Nút tia sáng |
| Vòng Tinh Tú (nổ lan, đẩy lùi) | L | Nút vòng tròn |
| Lướt Gió (không mất máu khi lướt) | Space / Shift | Nút lướt |
| Mưa Sao Băng (khi thanh vàng đầy) | U | Nút sao băng |
| Tạm dừng · Nhạc nền · Hiệu ứng | Esc · M · N | Các nút góc trên |

Nhặt Linh Tinh ở tế đàn để mở cổng, hết mỗi đợt quái Linh Tinh hiện lại (sát thương +12%, máu tối đa +10, hồi 40% máu). 5 đợt: Slime Bóng Tối → Ma Trơi → Thạch Quỷ → đợt dồn dập → trùm Hắc Nguyệt Thú (đập đất có vòng đỏ báo trước, bắn vòng hạt tối, gọi thêm quái, nổi giận khi dưới 50% máu).

## Hình ảnh

### Thiết kế nhân vật và quái

Mira được vẽ thiết kế 4 góc bằng AI tạo ảnh, rồi dựng 3D bằng Tripo. Bộ quái (Slime, Ma Trơi, Thạch Quỷ, Hắc Nguyệt Thú) có ảnh concept; trong game quái được dựng bằng khối hình học trong code.

| Trước | Sau | Trái | Phải |
|---|---|---|---|
| ![](docs/images/concept/mira-concept-1.jpg) | ![](docs/images/concept/mira-concept-2.jpg) | ![](docs/images/concept/mira-concept-3.jpg) | ![](docs/images/concept/mira-concept-4.jpg) |

| Tư thế ra chiêu (storyboard) | Quái vật (concept) |
|---|---|
| ![](docs/images/concept/mira-cast-storyboard.jpg) | ![](docs/images/concept/monster-concepts.jpg) |

### Từ ảnh đến nhân vật cử động được

| 1. Mesh Tripo (502.944 mặt, chưa có xương) | 2. Có texture PBR |
|---|---|
| ![](docs/images/pipeline/tripo-mesh.jpg) | ![](docs/images/pipeline/tripo-textured.jpg) |

3\. Retopology còn 19.577 tam giác → Auto Rig 65 xương chuẩn Mixamo trên Tripo → chuyển động dựng bằng code trên bộ xương đó. Bảng dưới: mỗi ô là góc trước + góc nghiêng, đường xanh là bộ xương.

![Bảng tư thế trên bộ xương](docs/images/rig/18-bang-tu-the-xuong.jpg)

### Xưởng chuyển động (trong game)

| Đứng thở | Đi bộ | Chạy |
|---|---|---|
| ![](docs/images/game/02-xuong-dung-tho.jpg) | ![](docs/images/game/03-xuong-di-bo.jpg) | ![](docs/images/game/04-xuong-chay.jpg) |
| **Chém Nguyệt Quang** | **Tia Linh Quang** | **Vòng Tinh Tú (nhảy)** |
| ![](docs/images/game/05-xuong-chem.jpg) | ![](docs/images/game/06-xuong-tia-sang.jpg) | ![](docs/images/game/07-xuong-nhay.jpg) |
| **Hiện bộ xương** | **Trình diễn chạy vòng tròn** | |
| ![](docs/images/game/08-xuong-bo-xuong.jpg) | ![](docs/images/game/09-xuong-chay-vong.jpg) | |

### Trong trận

| Nhặt Linh Tinh | Đánh quái | Vòng Tinh Tú |
|---|---|---|
| ![](docs/images/game/10-nhat-linh-tinh.jpg) | ![](docs/images/game/11-danh-quai.jpg) | ![](docs/images/game/12-vong-tinh-tu.jpg) |
| **Mưa Sao Băng** | **Trùm Hắc Nguyệt Thú đập đất** | **Nhặt Linh Tinh cuối** |
| ![](docs/images/game/13-mua-sao-bang.jpg) | ![](docs/images/game/14-trum.jpg) | ![](docs/images/game/15-chien-thang.jpg) |

### Điện thoại

| Màn hình đầu | Đang chơi |
|---|---|
| <img src="docs/images/game/16-dien-thoai-man-hinh-dau.jpg" width="260"> | <img src="docs/images/game/17-dien-thoai-choi.jpg" width="260"> |

Bản đầu tiên (Mira chưa có xương, chỉ nhún cả khối): `docs/images/v1/v1-chua-co-xuong.jpg`.

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
- **`motions.js`**: tư thế nền khép chân lại (mô hình gốc dạng chân chữ A khá rộng), khi đi/chạy bàn chân đặt gần đường giữa. Thư viện 11 chuyển động: đứng thở, đi, chạy, dừng, chém, tia sáng, nhảy, lướt, trúng đòn, gục ngã, vẫy chào. Đi và chạy sinh từ **một** hàm dáng đi có tham số, nên pha trộn liên tục được.
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

- **Nhạc nền và hiệu ứng tách riêng**, mỗi thứ có công tắc bật/tắt riêng ở màn hình đầu, trong Xưởng chuyển động và trên HUD (phím tắt `M` cho nhạc, `N` cho hiệu ứng). Lựa chọn được nhớ cho lần sau.
- **Nhạc nền là "hộp nhạc đêm" sinh bằng code**: nốt sine gảy nhẹ trên âm giai ngũ cung Rê, bass trầm mỗi nhịp, tiếng vọng nhẹ. Không trống, không nốt ngân kéo dài. Theo trạng thái: chậm ở màn hình đầu và Xưởng; dày hơn khi đánh; chuyển sang giọng thứ khi gặp trùm; tắt dần khi hết ván. Nhạc Mixkit cũ (nhịp trống giật) đã bị bỏ.
- 20 hiệu ứng lấy từ bộ Mixkit Game SFX: cắt khoảng lặng, fade, chuẩn hoá đỉnh −3 dB, MP3 mono.
- Kênh Nhạc / Hiệu ứng / Giao diện đi vào một limiter. Âm lượng chỉnh thêm trong màn Tạm dừng.
- Mỗi âm có giới hạn số tiếng cùng lúc và khoảng cách tối thiểu; cao độ lệch nhẹ để tiếng lặp lại không đơ.
- Chỉ tổng hợp 2 âm bộ Mixkit không có: bước chân và đập đất, đều là sóng sine đã lọc, ngắn.

| Sự kiện | File nguồn Mixkit |
|---|---|
| Chém / trúng / chí mạng | martial-arts-fast-punch / small-hit / game-ball-tap |
| Tia sáng / Vòng sao, Tuyệt kỹ | retro-video-game-bubble-laser / magic-glitter-shot |
| Lướt / Mira bị đánh | player-jumping / boxer-getting-hit |
| Quái chết / trùm chết | video-game-blood-pop / game-blood-pop-slide |
| Linh hồn / Linh Tinh / Linh Tinh hiện ra / nâng cấp | winning-a-coin / video-game-treasure / unlock-new-item / winning-an-extra-bonus |
| Tuyệt kỹ sẵn sàng / bắt đầu đợt / hết đợt | unlock-game-notification / medieval-show-fanfare / completion-of-a-level |
| Thắng / thua / bấm nút / mở xưởng | game-level-completed / player-losing-or-failing / video-game-retro-click / quick-positive-notification |

## Deploy GitHub Pages

- `.github/workflows/deploy.yml`: mỗi lần push nhánh `main`, GitHub Actions chạy test, build và xuất bản `dist/` lên Pages (Settings → Pages → Source: GitHub Actions).
- Code dùng đường dẫn tương đối (`base: './'`) nên chạy được ở thư mục con của Pages hay ở tên miền riêng mà không cần sửa.
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
dev/rigtest.html  Trang kiểm tra pose 3 góc nhìn (chỉ chạy khi npm run dev)
docs/images/      Ảnh thiết kế, quy trình dựng nhân vật, ảnh chụp game
```

`?debug` trên URL mở `window.__MIRA__` để kiểm thử (`advance`, `teleport`, `god`, `killAll`, `skipTo`, `openStudio`, `info`).
