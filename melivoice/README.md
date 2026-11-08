# MELI Voice

Voice → EMR: ghi âm hoặc tải file giọng nói, `gpt-transcribe` chép lời thành transcript rồi `gpt-5.6-sol`
cấu trúc hoá transcript thành hồ sơ bệnh án (GT2, JSON schema strict),
chỉnh sửa, xác nhận, lịch sử, xuất CSV. Backend FastAPI + SQLite và giao diện web nằm chung một cổng.

## Chạy
```bash
cp .env.example .env      # điền OPENAI_API_KEY
./run.sh                  # mở http://localhost:8765
```
Docker Compose (chỉ mở một cổng 8765 cho cả giao diện và API):
```bash
cp .env.example .env      # điền OPENAI_API_KEY
docker compose up -d --build
```
Đổi cổng ngoài: `PORT=9000 docker compose up -d`. Dữ liệu lưu ở `./data`.

## Đăng nhập
MELI Voice không có form đăng nhập riêng: mọi lần đăng nhập đi qua portal MELICARE
(`PORTAL_URL/MELICARE_Login.html?next=<origin>/login[?redirect=/history]`). Đăng nhập xong portal mở lại
`next` kèm `?token=<access token>` (chỉ với host trong danh sách handoff của portal, tức `melivoice.meliq.ai`;
không chạy trên localhost). Bộ chuyển ứng dụng của portal cũng mở thẳng `https://melivoice.meliq.ai/?token=...`.
- `static/assets/melivoice-auth.js` lưu phiên vào `localStorage` (`melivoice.auth.session.v1`), xóa token khỏi URL,
  chưa có phiên thì chuyển về `/login` (trang này tự chuyển sang portal). Token hỏng dừng ở `/login?error=token`.
- Giao diện gửi kèm `Authorization: Bearer <access token>` cho mọi `/api/*` và làm mới token qua
  `POST AUTH_URL/api/v1/auth/refresh` khi sắp hết hạn; backend hiện **chưa** kiểm tra token.
  Đăng xuất gọi `/auth/logout` rồi về trang đăng nhập portal.
- Header: nút về MELICARE, menu tài khoản, bộ chuyển ứng dụng (gắn `?token=` cho MELIOCR, MELIGuide, MELICDSS)
  — `static/assets/melivoice-nav.js`. Trang có URL riêng: `/` (Ghi âm) và `/history` (Lịch sử).
- Chạy local: đặt `DEV_LOGIN=true` trong `.env` — `/login` có nút "Đăng nhập giả (dev)".

## Cấu trúc
- `app/` – FastAPI (`main.py`), gọi model + schema GT2 (`gpt_audio.py`), prompt cấu trúc hoá (`P4_PROMPT.txt`)
- `static/` – giao diện (`index.html` + `assets/`)
- `data/` – SQLite `meli_voice.db` và audio (tự tạo)

## API

MeliData: tự lưu snapshot và audio gốc qua kho tạm `/api/v1/melivoice/records`, retry bằng SQLite outbox.
Điền `MELIDATA_URL`/`MELIDATA_TENANT_ID`; Docker Compose nối network ngoài `melidata_default`.
Nút **Lưu EMR & MeliData** đồng thời xác nhận consent. Thiếu Patient ID vẫn lưu tạm và có nhãn cần bổ sung;
ứng dụng không tự tạo Patient ID. Backend công bố DocumentReference sau khi tra được Patient trong tenant.
Patient ID ở form là identifier của Patient với system `https://meliq.ai/id/patient`, khác mã hồ sơ BA.
Xem `docs/MELIDATA-IMPLEMENTATION.md` để biết cấu hình, giới hạn và cách seed lô thử nghiệm.

Cache miss có thể phục hồi record/audio từ MeliData. Ngưỡng cache chỉ thống kê dung lượng ở `/api/health`;
không tự xóa cache. Hồ sơ chưa lưu EMR vẫn có nút xóa; thao tác này ghi dấu xóa ở MeliData để không xuất hiện lại
khi đồng bộ. Chỉ hồ sơ đã lưu EMR mới bị khóa xóa.
`GET /api/health` · `POST /api/records` · `GET /api/records` · `GET|PATCH|DELETE /api/records/{id}` ·
`POST /api/records/{id}/process` · `GET /api/records/{id}/audio` · `GET /api/export.csv`
