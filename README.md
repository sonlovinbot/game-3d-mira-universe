# Mira · Đêm Linh Quang

Màn chơi 3D nhỏ trên web: Mira đứng trên một hòn đảo bay lúc chạng vạng, nhặt Linh Tinh (tinh thể phát sáng) trên tế đàn, rồi đánh 5 đợt yêu quái mạnh dần, kết thúc bằng trùm Hắc Nguyệt Thú.

## Chạy trên máy

```sh
npm install
npm run dev        # mở http://localhost:5190
npm run build      # bản build nằm trong dist/
npm test           # 6 bài test cho luật chơi (va chạm, sóng quái, hồi chiêu…)
```

Thư mục `dist/` là web tĩnh, đưa lên hosting nào cũng chạy được. Không mở trực tiếp bằng `file://` được vì trình duyệt chặn việc tải file GLB.

## Kết quả kiểm tra file GLB gốc

File gốc: `bunny girl figure 3d model.glb` (23,5 MB, xuất từ Tripo, glTF 2.0)

| Hạng mục | Kết quả |
|---|---|
| Node / Mesh / Primitive | 1 / 1 / 1. Cả nhân vật là **một khối liền**: tóc, tai thỏ, áo, túi, giày không tách thành phần riêng |
| Hình học | 273.618 đỉnh, 502.944 tam giác. Có POSITION, NORMAL, TEXCOORD_0 |
| Vật liệu | 1 vật liệu PBR: base color + metallic/roughness + normal map (3 ảnh 4096×4096) |
| Rig / xương (skin, JOINTS/WEIGHTS) | **Không có** |
| Animation clip | **Không có** |
| Morph target (blendshape) | **Không có** |
| Extension | KHR_materials_volume, FB_ngon_encoding (không bắt buộc) |
| Kích thước gốc | 0,47 × 0,98 × 0,20 (đơn vị glTF), đáy ở y = 0, mặt nhìn về +Z |

### Bản tối ưu dùng trong game: `public/mira.glb`

- Giảm còn 70.411 tam giác (khoảng 14% bản gốc), texture 2048 px dạng WebP, nén Meshopt + quantization.
- Dung lượng còn **0,99 MB** (bản gốc 23,5 MB), tải nhanh trên điện thoại.
- Công cụ: `gltf-transform optimize --simplify-ratio 0.14 --texture-compress webp --texture-size 2048 --compress meshopt`.
- File gốc giữ nguyên, không bị sửa.

### Vì không có rig nên hoạt ảnh làm thế nào?

Mira được "diễn" bằng cách biến đổi cả khối: nhún và nghiêng người khi chạy, xoay người khi chém, bật nhảy khi tung Vòng Tinh Tú, kéo dãn khi lướt, ngã ra khi thua. Nhìn vẫn sinh động kiểu mô hình đồ chơi, nhưng **chân tay không cử động**.

Muốn có bước chạy và vung tay thật thì cần rig: đưa model qua Mixamo, AccuRIG hoặc chức năng auto-rig của Tripo, xuất lại GLB có clip tên *idle / run / attack*. Code đã sẵn chỗ đón: thay `public/mira.glb` là game tự dùng các clip đó thay cho hoạt ảnh giả lập (xem `src/player.js`).

## Lối chơi

1. Chạy tới tế đàn giữa đảo, nhặt Linh Tinh để mở cổng hư không.
2. Mỗi đợt quái tràn ra từ 4 cổng ở mép đảo. Hạ hết quái thì Linh Tinh xuất hiện lại. Nhặt nó để được: **+12% sát thương, +10 máu tối đa, hồi 40% máu**, rồi sang đợt tiếp.
3. Quái chết rơi linh hồn vàng, tự bay về Mira để nạp thanh Tuyệt kỹ.

| Đợt | Quái | Ghi chú |
|---|---|---|
| 1 | 8 Slime Bóng Tối | Nhảy chậm, dễ đoán |
| 2 | 8 Slime + 6 Ma Trơi | Ma Trơi nhanh, lượn zigzag, lao tới khi cắn |
| 3 | 8 Slime + 8 Ma Trơi + 3 Thạch Quỷ | Thạch Quỷ trâu máu, đòn nặng, gồng tay báo trước |
| 4 | 10 + 10 + 5 | Ra quái dày nhất, tối đa 14 con cùng lúc |
| 5 | **Hắc Nguyệt Thú** + 16 quái nhỏ | Trùm có đòn đập đất (vòng đỏ báo trước 1,1 giây), bắn vòng hạt tối, gọi thêm slime. Dưới 50% máu sẽ nổi giận, ra đòn nhanh hơn |

Máu và tốc độ quái tăng theo từng đợt (máu ×1,0 → ×1,4, tốc độ ×1,0 → ×1,15).

## Điều khiển

| Hành động | Bàn phím | Cảm ứng |
|---|---|---|
| Di chuyển | W A S D / phím mũi tên | Kéo cần ảo ở nửa trái màn hình |
| Chém Nguyệt Quang (cận chiến, hình vòng cung) | J / 1 / chuột trái | Nút lớn bên phải |
| Tia Linh Quang (bắn xa, bám mục tiêu) | K / 2 | Nút tia sáng |
| Vòng Tinh Tú (nổ lan quanh người, đẩy lùi, làm choáng) | L / 3 | Nút vòng tròn |
| Lướt Gió (lướt nhanh, miễn sát thương trong lúc lướt) | Space / Shift | Nút lướt |
| Mưa Sao Băng (tuyệt kỹ, cần đầy thanh vàng) | U / 4 | Nút sao băng |
| Tạm dừng / Tắt âm | Esc, P / M | Nút Ⅱ / ♪ |

Chiêu tự ngắm vào con quái gần nhất theo hướng Mira đang quay mặt, nên chơi trên điện thoại vẫn trúng. Giữ nút là chiêu tự ra lại mỗi khi hết thời gian hồi. Bấm sớm trong lúc chiêu đang hồi thì game vẫn nhớ lệnh thêm 0,22 giây.

## Công nghệ

- **three.js 0.180** để dựng cảnh. Các module đi kèm: GLTFLoader + MeshoptDecoder, EffectComposer + UnrealBloomPass (hiệu ứng phát sáng) + OutputPass (tone mapping ACES), RoomEnvironment (ánh sáng phản chiếu PBR), BufferGeometryUtils (gộp mesh).
- **Vite** để chạy dev và build.
- Bóng đổ PCF mềm, sương mù, bầu trời bằng shader, 5.200 ngọn cỏ đung đưa theo gió (instancing + shader), đom đóm, nấm phát sáng, đảo bay xa, cổng xoáy.
- Hệ hạt dùng GPU, gom thành một lần vẽ duy nhất. Tất cả âm thanh tổng hợp bằng WebAudio, không cần file âm thanh.
- Quái vật dựng hoàn toàn bằng khối hình học trong code, không dùng asset bên ngoài.
- Trên điện thoại tự hạ chất lượng: ít cỏ hơn, bóng đổ 1024 px, pixel ratio tối đa 1,5.

## Cấu trúc code

```
src/logic.js    Luật chơi thuần (số liệu quái, sóng, chiêu, va chạm) — có unit test
src/world.js    Bối cảnh: trời, đảo, cỏ, cây, tế đàn, trụ rune, cổng, Linh Tinh
src/player.js   Tải GLB, chuẩn hoá kích thước, hoạt ảnh giả lập, bóng mờ khi lướt, bóng xuyên vật cản
src/enemies.js  3 loại quái + trùm: AI đuổi, báo trước đòn đánh, đòn riêng của trùm
src/skills.js   5 chiêu của Mira
src/fx.js       Hạt, vệt chém, sóng xung kích, vòng cảnh báo, số sát thương, thanh máu quái
src/input.js    Bàn phím, chuột, cần ảo, nút chạm
src/audio.js    Âm thanh tổng hợp
src/main.js     Vòng lặp game, camera, luồng màn chơi, HUD
```

Mở `?debug` trên URL sẽ có `window.__MIRA__` để kiểm thử: `advance(giây)`, `teleport(x,z)`, `god()`, `killAll()`, `skipTo(đợt)`, `info()`.

## Đã kiểm thử

- `npm test`: 6/6 đạt.
- Chrome headless ở 3 kích thước: desktop 1280×720, điện thoại dọc 390×844, điện thoại ngang 844×390. Chạy trọn luồng: tiêu đề → nhặt tinh thể → đánh từng đợt → trùm → thắng / thua → chơi lại. Không có lỗi JavaScript.
- Cho bot tự chơi 3 ván, chỉ đánh tự động, không bật bất tử: thắng 2 ván trong khoảng 110 giây, thua 1 ván ở trùm.
- **Chưa thử trên điện thoại thật.** Headless render bằng CPU nên không đo được FPS thật; cần thử trên máy để chỉnh chất lượng hình.
