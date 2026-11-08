# MeliData archive: triển khai thử nghiệm

Tài liệu này cập nhật quyết định sau bản khảo sát STORAGE-PLAN: theo yêu cầu người dùng,
MeliData trực tiếp giữ dữ liệu tạm thời và audio trong PostgreSQL thay vì cần thêm database/object storage riêng.

## Dữ liệu

- SQLite thêm Patient ID, cờ Patient ID tạm/test, simulated_fields, revision, consent/time và receipt đồng bộ.
- `sync_outbox` giữ snapshot revision trong cùng transaction với thao tác lưu. ACK cũ không xóa công việc mới.
- MeliData giữ current snapshot, immutable revision và audio BYTEA có SHA-256. Không có TTL tự xóa dữ liệu tạm.
- Dữ liệu thử nghiệm hiện có được script riêng điền thông tin giả lập và gắn nhãn. Runtime không tạo Patient ID.
- Không thêm dữ liệu lâm sàng giả vào GT2/EMR. Chỉ giả lập các trường định danh/metadata còn thiếu của lô thử nghiệm.

## Hành vi giao diện

- Patient ID khác mã hồ sơ BA. Chỉ hiển thị tag “Thiếu patient_id” khi chưa có ID do bác sĩ nhập.
- ID tạm của lô kiểm thử cũng được xem là chưa bổ sung ID thật. Các cờ thử nghiệm, ID tạm và trạng thái đồng bộ
  chỉ phục vụ backend, không tạo tag riêng trên giao diện.
- “Lưu nháp” lưu vào kho tạm; không cấp consent công bố FHIR.
- “Lưu EMR & MeliData” lưu EMR, consent và thời gian. Thiếu ID vẫn được giữ trong kho tạm.
- Nhập ID thật và lưu lại sẽ bỏ cờ ID tạm. Nếu ID chưa có trong MeliData, backend giữ trạng thái chờ;
  ứng dụng không tự tạo Patient. Sau khi Patient được thêm, worker sẽ công bố.
- Không hiển thị tag lưu tạm, công bố hay đồng bộ.
- Mất mạng giữ bản local và tự retry; nội dung đang gõ không bị polling ghi đè.

## API và cấu hình

MeliData: `/api/v1/melivoice/records`, PUT snapshot và audio, GET list/detail/audio/EMR revision.
Mọi truy cập dùng tenant từ auth context. Scope archive: `melivoice.read`, `melivoice.write`.
Consent công bố yêu cầu thêm `system/Patient.read system/DocumentReference.write`.

MeliVoice: `MELIDATA_URL`, `MELIDATA_TENANT_ID`; dùng `MELIDATA_TOKEN` hoặc cấu hình
`MELIDATA_CLIENT_ID`, `MELIDATA_CLIENT_SECRET`, `MELIDATA_TOKEN_URL` cho client credentials.
Đối chiếu endpoint MeliAuth của môi trường trước khi bật chế độ client credentials.
Docker Compose kết nối network `melidata_default`, không dùng localhost để gọi từ container.

`CACHE_AUDIO_MAX_MB` mặc định 512, `CACHE_MAX_RECORDS` mặc định 1000: chỉ báo vượt ngưỡng qua `/api/health`.
Chưa tự giải phóng cache. Hồ sơ pending/processed/draft có nút xóa, vẫn yêu cầu nhập đúng tên file để xác nhận.
Hồ sơ confirmed (đã lưu EMR) không thể xóa, kể cả khi chưa công bố FHIR do thiếu Patient ID.
MeliVoice chỉ báo xóa thành công sau khi MeliData xác nhận tombstone ở revision mới; nếu mất kết nối hoặc có
xung đột thì giữ nguyên hồ sơ và báo lỗi. Tombstone ngăn đồng bộ cũ làm hồ sơ xuất hiện lại.
Thao tác này không purge lịch sử/audio lưu trữ; metadata actor/client và revision xóa được giữ để đối soát.

## Seed một lần

Chạy `python /srv/scripts/seed_trial_archive.py` trong container để dry-run; thêm `--apply` mới ghi.
Mặc định script dừng nếu tổng record khác 27, tránh vô tình seed hồ sơ mới. Script backup SQLite bằng backup API
và copy audio vào `data/backups/before-trial-seed-<timestamp>` trước khi điền thông tin.
Mỗi record thiếu Patient ID dùng `TMP-MV-<legacy-id>`, Patient có meta.tag synthetic-trial.
Các trường trống được điền tên thử nghiệm, BS. Thử nghiệm, Khoa thử nghiệm; giữ nguyên nội dung audio/GT2/EMR.
Các hồ sơ confirmed của lô thử nghiệm được cấp consent chuyển sang MeliData theo yêu cầu migration;
các hồ sơ processed chỉ được archive tạm.

## Giới hạn hiện tại

- Đây là chế độ thử nghiệm một tenant do backend cấu hình. MeliVoice chưa có xác minh JWT/tenant theo từng request;
  phải hoàn thiện phần này trước khi dùng nhiều tenant hoặc dữ liệu production.
- MeliData deployment đang dùng auth-disabled theo cấu hình có sẵn; module archive vẫn có kiểm tra scope/tenant
  khi auth được bật. Không thay đổi cấu hình auth trong lần triển khai này.
- Audio tối đa 64 MiB/file, giữ BYTEA trong PostgreSQL. Với audio lớn/lưu lượng cao cần chuyển sang object storage.
- Đồng bộ nền sau ghi là eventual: dữ liệu chưa được ACK vẫn cần cache local. Không hứa an toàn nếu mất máy trước ACK.
- Không tự xóa dữ liệu khi cache đầy; chỉ báo dung lượng và giữ thêm bản ở MeliData.
- Không tự merge conflict; giữ local outbox và hiển thị xung đột để tránh mất cập nhật.

## Kiểm chứng

MeliData: pnpm check, e2e trên PostgreSQL tmpfs riêng, migration up/down/up trên database thử nghiệm.
MeliVoice: unittest outbox/retry/conflict/cache restore và consent/Patient ID trong container không có mạng.

## Kết quả triển khai ngày 25/10/2026

- Đã cập nhật container MeliData (3200) và MeliVoice (8765), không thay đổi cấu hình auth thử nghiệm đang có.
- Đã backup trước cập nhật và trước seed; backup nằm trong `data/backups/` (được gitignore).
- Đã tạo 27 Patient ID tạm có nhãn synthetic-trial và điền metadata còn trống cho đúng 27 hồ sơ cũ.
- 27 snapshot và 27 audio gốc đã được archive: 23 temporary, 4 published; outbox local bằng 0 khi đối soát.
- So sánh toàn bộ snapshot và checksum audio: 0 sai lệch. GT2/EMR/transcript không được giả lập lại.
- Đã phục hồi một record và audio thật vào cache thử nghiệm rỗng, khớp dữ liệu; cache gốc giữ nguyên.
- MeliData: 9 unit tests, 6 e2e tests; lint/typecheck/build và migration down/up trên DB thử nghiệm đều qua.
- MeliVoice: 10 unittest/API tests qua; Playwright kiểm tra lưu thiếu ID, thay ID, consent và giao diện desktop/mobile qua.

## Phương án dọn cache cần được cho phép riêng

Tự dọn cache chưa được triển khai/bật. Thao tác xóa hồ sơ thủ công trước khi lưu EMR là workflow riêng,
chỉ thực hiện sau xác nhận của người dùng và giữ tombstone tại MeliData.
Đề xuất cụ thể để xem xét: khi audio cache vượt 512 MiB, worker nội bộ dọn các bản phát MP3 dẫn xuất trước,
sau đó các audio gốc có bản lưu trung tâm, theo thời điểm truy cập cũ nhất, đến khi xuống dưới 400 MiB.
Trước mỗi lần dọn phải xác nhận lại remote revision và checksum audio, không có local outbox hoặc job đang xử lý;
giữ nguyên metadata local và toàn bộ archive/revision/audio trong MeliData. Không mở endpoint dọn công khai.
Nếu MeliData không truy cập được hoặc checksum/revision không khớp, giữ nguyên file local.
