# MeliVoice: kiểm kê dữ liệu và phương án lưu trữ, đồng bộ MeliData

Ngày kiểm tra: 25/10/2026. Đây là báo cáo khảo sát và thiết kế đề xuất; chưa triển khai đồng bộ hay thay đổi dữ liệu đang chạy.

## 1. Kết luận thiết kế

MeliData tại `http://localhost:3200` đang hoạt động, dùng PostgreSQL và cung cấp FHIR R4. Dịch vụ hiện là kho dữ liệu lâm sàng liên thông, chưa phải kho lưu toàn bộ trạng thái nghiệp vụ MeliVoice hoặc kho upload audio.

Để SQLite ở MeliVoice thực sự là cache có thể dựng lại, cần có nơi bền vững lưu cả bản nháp, transcript, kết quả AI, lịch sử chỉnh sửa, metadata và audio. Chỉ đồng bộ hồ sơ confirmed sang FHIR sẽ chưa đạt yêu cầu này.

Phương án khuyến nghị:

1. MeliData FHIR là nguồn chuẩn cho Patient và tài liệu lâm sàng đã công bố.
2. Kho nghiệp vụ PostgreSQL bền vững do MeliVoice sở hữu lưu đầy đủ record/revision/processing/mapping/outbox. Có thể dùng chung PostgreSQL cluster với MeliData, nhưng database, role và migration riêng; không ghi trực tiếp vào các bảng FHIR.
3. Object storage riêng tư lưu audio gốc và tài liệu lớn. Database giữ object key và metadata, không giữ audio base64.
4. SQLite và audio trên máy MeliVoice là cache, cộng hàng chờ ghi chưa được nơi lưu trữ bền vững xác nhận. Phần chưa được xác nhận không được dọn.

Nếu muốn mọi API lưu trữ đều đi qua cổng 3200, cần quyết định mở rộng phạm vi MeliData bằng module/API lưu trữ nghiệp vụ tách biệt. Đây là thay đổi contract và ownership so với `melidata/AGENTS.md`, không phải tính năng đã có.

## 2. Những gì đã kiểm tra

- Đọc backend FastAPI, frontend, prompt và mã xử lý audio của MeliVoice.
- Đọc SQLite trong container `meli-voice` ở chế độ read-only, chỉ lấy schema và thống kê tổng hợp.
- Đọc source, entities, migration, profile registry, auth guard và tài liệu MeliData.
- Gọi GET `/health/ready`, GET `/fhir/r4/metadata`, GET `/docs-json` của dịch vụ cổng 3200.
- Đọc tên bảng PostgreSQL thực tế và một số biến cấu hình không chứa bí mật.
- Không upload, sửa, xóa dữ liệu hay in nội dung hồ sơ bệnh nhân.

## 3. Database MeliVoice hiện tại

### 3.1 Vị trí và quy mô thực tế

- Host: `data/meli_voice.db` và `data/audio/`.
- Docker mount: `./data:/data`, SQLite nằm tại `/data/meli_voice.db`.
- Có đúng một bảng nghiệp vụ: `records`, 21 cột.
- 27 record: 23 `processed`, 4 `confirmed`.
- 26 record có `gt2`, 4 có `emr`, 27 có `transcript` khác NULL; thống kê khác NULL không khẳng định nội dung hợp lệ/không rỗng.
- SQLite: 110.592 byte.
- Thư mục audio: 32 file, tổng 14.288.424 byte; gồm file gốc và có thể cả bản phát dẫn xuất. Không được coi phần chênh lệch số file là file mồ côi khi chưa đối chiếu.
- Không thiếu audio gốc của 27 record.
- Cả 27 record đều trống `patient_name`, `doctor`, `department` ở cấp cột; thông tin lâm sàng trong JSON chưa được kiểm kê giá trị.
- Không trống `patient_code`, nhưng có 2 nhóm mã xuất hiện nhiều lần. Không thể kết luận các nhóm đó là cùng bệnh nhân.
- Chỉ có index tự sinh của primary key `id`; chưa có index tìm kiếm/trạng thái/thời gian hay unique constraint cho mã hồ sơ.

### 3.2 Toàn bộ cột của records

| Cột | Kiểu SQLite | Nội dung | Nơi giữ lâu dài đề xuất |
|---|---|---|---|
| `id` | TEXT, primary key | 12 ký tự hex lấy từ UUID; khóa record nội bộ | Kho nghiệp vụ; business identifier tài liệu FHIR |
| `created_at` | TEXT | ISO datetime do server tạo, hiện không có timezone | Kho nghiệp vụ, chuyển sang timestamp có timezone sau khi xác minh timezone nguồn |
| `patient_name` | TEXT | Tên do người dùng nhập; có thể rỗng | Snapshot nghiệp vụ; Patient chuẩn lấy theo reference |
| `patient_code` | TEXT | Mã do người dùng nhập hoặc `BA-YYMMDD-NNN` | Giữ như mã hồ sơ/record cũ; chưa đủ làm Patient.identifier |
| `doctor` | TEXT | Tên bác sĩ dạng text | Snapshot nghiệp vụ và Practitioner reference khi được đối chiếu |
| `department` | TEXT | Tên khoa dạng text | Snapshot nghiệp vụ và Organization reference khi được đối chiếu |
| `source` | TEXT | `mic` hoặc `file` | Kho nghiệp vụ |
| `duration` | REAL | Thời lượng audio, giây | Metadata asset/kho nghiệp vụ |
| `audio_file` | TEXT | Tên file nội bộ, thường `<id>.<đuôi>` | Object key + metadata; giữ tên cũ phục vụ migration |
| `status` | TEXT | `pending`, `processed`, `draft`, `confirmed` | Trạng thái nghiệp vụ; tách khỏi trạng thái đồng bộ |
| `error` | TEXT | Lỗi xử lý; API che phần lớn lỗi hệ thống | Kho vận hành có quyền hạn/retention riêng, lọc dữ liệu nhạy cảm |
| `gt2` | TEXT chứa JSON | Kết quả AI trích xuất, trước chỉnh sửa | Kho nghiệp vụ, revision/processing run |
| `emr` | TEXT chứa JSON | Bệnh án bác sĩ đã lưu/chỉnh sửa | Kho nghiệp vụ; bản đã duyệt xuất tài liệu qua FHIR |
| `transcript` | TEXT | Lời chép từ audio | Kho nghiệp vụ; công bố riêng chỉ khi có quy trình duyệt phù hợp |
| `usage` | TEXT chứa JSON | Token usage của lời gọi trích xuất GT2 cuối cùng | Processing run/metric vận hành |
| `latency` | REAL | Thời gian trích xuất GT2 cuối cùng, giây | Processing run/metric vận hành |
| `file_name` | TEXT | Tên file gốc người dùng upload | Asset metadata, có thể chứa thông tin nhạy cảm |
| `transcript_status` | TEXT | `ok`, `audio_error`, `error` | Kho nghiệp vụ/processing run |
| `transcript_error` | TEXT | Lỗi chép lời bị cắt ngắn; API không trả ra | Kho vận hành có giới hạn truy cập và retention |
| `error_kind` | TEXT | `bad_format` hoặc `system` | Kho nghiệp vụ/processing run |
| `audio_note` | TEXT | AI mô tả lý do âm thanh có vấn đề | Kho nghiệp vụ |

Các cột phần lớn không có NOT NULL/default/CHECK. Không có foreign key, bảng Patient/User/Tenant, bảng revision hoặc bảng job. Migration hiện là CREATE/ALTER trong lúc khởi động ứng dụng.

### 3.3 Nội dung JSON bệnh án

`gt2` và `emr` là hai bản riêng. Giao diện ưu tiên `emr`, nếu chưa có thì dùng `gt2`. Các trường giao diện/prompt hiện kỳ vọng:

| Đường dẫn | Ý nghĩa |
|---|---|
| `hanh_chinh.gioi_tinh` | Giới tính được đề cập |
| `hanh_chinh.tuoi` | Tuổi được đề cập |
| `ly_do_vao_vien` | Lý do vào viện |
| `qua_trinh_benh_ly` | Diễn tiến bệnh hiện tại |
| `tien_su.ban_than` | Tiền sử cá nhân |
| `tien_su.gia_dinh` | Tiền sử gia đình |
| `kham_luc_vao` | Khám lúc tiếp nhận |
| `can_lam_sang_de_cap[]` | Danh sách `{ten, ket_qua, text}` |
| `chan_doan.chinh` | Chẩn đoán chính |
| `chan_doan.kem_theo` | Chẩn đoán kèm theo |
| `xu_tri.thu_thuat[]` | Danh sách `{method, phuong_phap_vo_cam, text}` |
| `xu_tri.thuoc_dieu_tri` | Thuốc đã dùng; giao diện nhập theo từng dòng |
| `dien_bien_bien_chung` | Diễn biến và biến chứng |
| `ket_cuc` | Kết cục điều trị |
| `thuc_the_lam_sang` | Prompt và giao diện hiện đặt NULL, chưa có offsets được kiểm chứng |

Đây là cấu trúc kỳ vọng, chưa phải schema dữ liệu được backend enforce chặt: GT2 chỉ được parse JSON, PATCH nhận `emr` là dict tùy ý. Phải bổ sung schema/version trước khi dựa vào mapping tự động.

### 3.4 Dữ liệu ngoài SQLite

| Dữ liệu | Hiện ở đâu | Xử lý đề xuất |
|---|---|---|
| Audio gốc upload/ghi âm | `data/audio/<id>.<extension>` | Lưu object storage bền vững, giữ nguyên bytes |
| MP3 dùng phát lại | `data/audio/<id>.play.mp3` | Cache dẫn xuất, có thể tạo lại và dọn theo TTL |
| WAV đã chuyển đổi/chuẩn hóa | Thư mục tạm do `tempfile.mkdtemp()` tạo | File tạm; hiện chưa thấy bước cleanup trong mã chuyển đổi |
| Prompt, model mặc định | `app/P4_PROMPT.txt`, cấu hình môi trường | Lưu model và prompt hash/version cho từng processing run mới |
| Raw response AI, parse metadata, model trong kết quả hàm | Chủ yếu trong bộ nhớ | Hiện không được lưu đầy đủ; không thể khôi phục lịch sử chưa từng lưu |
| Usage của bước chép lời | Không được trả/lưu trong hàm transcribe | Bổ sung nếu cần tổng chi phí và audit xử lý |
| Phiên đăng nhập | `localStorage`, key `melivoice.auth.session.v1` | Chỉ là phiên trình duyệt, không đưa vào kho hồ sơ/backup dữ liệu lâm sàng |
| Refresh token | Theo luồng auth nằm ở cookie HTTP-only của MeliAuth | Không lưu vào record hoặc đồng bộ |
| CSV lịch sử/TXT tải về | Sinh khi người dùng tải | Không phải bản lưu dài hạn đầy đủ của hệ thống |
| Log server | Logging/container stdout | Chỉ metadata cần thiết; không sao chép lỗi/raw text vào audit/event nếu có PHI |

### 3.5 Hành vi cần sửa khi thêm đồng bộ

- Nút xác nhận hiện chỉ PATCH SQLite; chưa có bước nhập EMR bên ngoài.
- Backend cấm chuyển confirmed về draft, xử lý lại và xóa confirmed. Tuy nhiên vẫn cho PATCH nội dung `emr` và metadata của confirmed. Cần khóa thật hoặc bắt tạo revision sửa đổi với người sửa/lý do.
- Xử lý lại ghi đè GT2/transcript/usage/latency; chưa có lịch sử từng lần chạy.
- Không có `updated_at`, `confirmed_at`, `confirmed_by`, `revision`, `tenant_id`, patient reference hoặc audit chỉnh sửa.
- `patient_code` sinh bằng COUNT theo ngày, có thể trùng khi xóa bản ghi hoặc chạy đồng thời. Dùng UUID/business key ổn định cho tích hợp.
- MeliVoice backend hiện chưa kiểm tra token và chưa lọc dữ liệu theo tenant.
- List API đọc toàn bộ record, chưa phân trang; tìm trong tên/mã/bác sĩ/khoa/transcript/GT2, chưa tìm `emr`.
- Xóa hiện xóa ngay row và file cục bộ. Khi có kho bền vững phải dùng tombstone và công việc xóa có kiểm soát, tránh record xuất hiện lại khi rehydrate.

## 4. MeliData hiện có những gì

### 4.1 Runtime đã xác minh

- GET `/health/ready`: HTTP 200, `database=up`.
- FHIR base: `/fhir/r4`; API vận hành trên cổng 3200.
- PostgreSQL có 6 bảng nghiệp vụ dưới đây và bảng migration.
- Runtime cấu hình `NODE_ENV=production`, `AUTH_DISABLED=true`, tenant mặc định `development`, request body limit `2mb`.
- Trong chế độ hiện tại auth guard bỏ qua JWT và cho scope `*`. Trước khi triển khai tenant thật cần bật xác minh MeliAuth và provision tenant/client/grants; không dùng tenant mặc định để tự phân loại dữ liệu cũ.

| Bảng | Vai trò |
|---|---|
| `fhir_resource` | JSONB phiên bản hiện hành; tenant/type/id/version, client tạo/sửa, thời gian, cờ deleted |
| `fhir_resource_history` | Snapshot từng version, actor/client và tombstone khi xóa |
| `fhir_identifier` | Index `identifier.system + value`, unique theo tenant/resource type/system/value |
| `audit_event` | Metadata hành động, actor/client/resource/version/request, không chứa nội dung bệnh án |
| `outbox_event` | Metadata sự kiện, sequence bigint và thời gian, không chứa nội dung bệnh án |
| `tenant_registry` | Tenant, active, source_version, thời điểm provision/cập nhật |

FHIR write tạo current/history/identifier/audit/outbox trong một transaction PostgreSQL. Không có transaction chung với SQLite hoặc object storage.

### 4.2 API có thể sử dụng ngay

- `GET /fhir/r4/metadata`.
- `POST /fhir/r4/{type}/$validate`.
- `POST /fhir/r4/{type}`: create; id kỹ thuật do server tạo.
- `GET /fhir/r4/{type}/{id}` và search theo type.
- `PUT /fhir/r4/{type}/{id}`: update resource đã tồn tại; bắt buộc `If-Match: W/"<version>"`.
- `DELETE /fhir/r4/{type}/{id}`: cũng bắt buộc If-Match.
- GET history và GET từng version.
- Search theo `identifier`, `_id`, `_lastUpdated`; các resource thích hợp có `patient`/`subject`, `status`, `encounter`, `code` tùy registry.
- Phân trang `_count` tối đa 200, `_offset`; sort hiện chỉ `_lastUpdated` hoặc `-_lastUpdated`.

### 4.3 Phần chưa có hoặc chưa phù hợp

- Runtime hỗ trợ Patient, nhân sự/cơ sở, Encounter, Procedure, DocumentReference và các resource MeliOR/MeliOCR trong profile registry.
- README nhắc Observation/Condition cho MeliVoice nhưng source registry và CapabilityStatement runtime chưa có hai resource này.
- DocumentReference hiện được gắn owner/profile `meliocr`; cần hợp đồng/profile dùng chung hoặc riêng cho MeliVoice, không nhận nhầm profile nghiệp vụ OCR.
- Chưa có Binary, Composition, Provenance trong allow-list.
- Chưa có upload/download object storage hoặc API lưu record/revision/job MeliVoice.
- Chưa có API polling outbox dù đã có bảng outbox.
- Chưa có transaction Bundle, conditional create/update, client-assigned create bằng PUT hoặc Idempotency-Key contract.
- Search hiện chưa có full-text cho transcript, nội dung JSON bệnh án, tên bác sĩ/khoa. Không thể thay thế nguyên trạng ô tìm kiếm MeliVoice bằng search FHIR hiện tại.
- Search `encounter` hiện đọc đường dẫn top-level `encounter.reference`; DocumentReference R4 dùng `context.encounter[]`, cần sửa/test nếu yêu cầu tìm tài liệu theo encounter.
- Validation chủ yếu structural và required fields; chưa phải full FHIR/terminology validation.
- README có nhắc `docs/DATA-SCHEMA.md`, nhưng file này không có trong checkout đã kiểm tra.

## 5. Mapping lâm sàng đề xuất

### Giai đoạn đầu: xuất tài liệu đã duyệt

| Dữ liệu MeliVoice | MeliData FHIR | Quy tắc |
|---|---|---|
| Người bệnh | `Patient/{id}` | Chọn/đối chiếu Patient hiện có theo định danh ổn định. Không ghép theo tên và không lấy mã BA tự sinh làm mã bệnh nhân |
| Bác sĩ | `Practitioner/{id}` | Dùng ID nhân sự chuẩn, giữ tên cũ chỉ làm snapshot |
| Khoa/cơ sở | `Organization/{id}` | Dùng ID tổ chức đã đối chiếu |
| Đợt khám/điều trị | `Encounter/{id}` nếu có | Không tự tạo Encounter chỉ vì có một lần ghi âm |
| Bệnh án EMR đã xác nhận | `DocumentReference` | Subject, author, context khi có; identifier ổn định từ record ID; trỏ tài liệu EMR đã duyệt |
| Audio nguồn | Asset riêng; có thể tạo DocumentReference riêng nếu được phép công bố | Quyền truy cập và trạng thái xác minh khác với bệnh án đã duyệt |
| Transcript | Kho nghiệp vụ | Duyệt riêng trước khi công bố như tài liệu lâm sàng; xác nhận EMR không tự động là xác nhận nguyên văn transcript |
| GT2 chưa sửa | Kho nghiệp vụ | Giữ nguồn AI, không công bố như chẩn đoán chuẩn đã duyệt |

Đề xuất business identifier tài liệu: system `https://meliq.ai/id/melivoice/record`, value là UUID record ổn định. Đây là URI contract cần thống nhất, chưa được triển khai.

DocumentReference biểu diễn metadata và tham chiếu tài liệu; bản thân tài liệu có thể nằm ở server khác. Dùng `content.attachment.url` trỏ URL tải có kiểm tra quyền và ổn định. Không lưu URL ký sẵn sẽ hết hạn làm URL chuẩn. JSON GT2/EMR vẫn là JSON nghiệp vụ, không tự trở thành FHIR chỉ vì được đính kèm.

Đối với bệnh án đã duyệt: đề xuất `DocumentReference.status=current`, `docStatus=final`. `confirmed` không phải giá trị hợp lệ của trường status này. Nếu có sửa đổi cần quy trình amended/replacement và lịch sử rõ ràng.

### Giai đoạn sau: dữ liệu có thể truy vấn lâm sàng

- `chan_doan.*` -> Condition sau khi mở resource/profile và bác sĩ xác minh dữ liệu.
- Kết quả khám/xét nghiệm -> Observation khi có khái niệm, thời điểm, đơn vị/giá trị phù hợp; không tự ép đoạn văn thành số đo.
- Thủ thuật -> Procedure chỉ khi có sự kiện thực hiện được xác nhận và đủ dữ liệu bắt buộc.
- Thuốc trong đoạn văn chưa đủ suy ra MedicationRequest hay MedicationDispense. Không tạo đơn thuốc/cấp phát chỉ từ tên thuốc đã nhắc.
- Tuổi trong audio không đủ suy ra ngày sinh. Giới tính/nhân khẩu học AI không được tự ghi đè Patient chuẩn.
- Tiền sử, diễn biến, kết cục chưa có mapping an toàn thì giữ trong tài liệu, không tạo extension tùy ý.

## 6. Schema bền vững tối thiểu cần bổ sung

Các bảng sau là đề xuất cho kho do MeliVoice sở hữu, không phải bảng hiện có trong MeliData.

| Bảng | Dữ liệu cần giữ |
|---|---|
| `voice_records` | `tenant_id`, UUID record, legacy ID, đủ 21 trường cũ hoặc mapping tương đương, schema version, created/updated time có timezone, created/updated actor, clinical status, confirmed actor/time, Patient/Practitioner/Organization/Encounter refs, revision, deleted_at |
| `voice_record_revisions` | Snapshot bất biến theo tenant/record/revision, GT2/EMR/transcript và metadata tương ứng, người sửa/duyệt, thời điểm, lý do, content hash |
| `voice_assets` | tenant/record/asset ID, object key/version, loại original/document/derived, MIME, byte size, SHA-256, duration, tên gốc, upload/verification state |
| `voice_processing_runs` | tenant/record/run ID, model, prompt/schema version/hash, bắt đầu/kết thúc, trạng thái, lỗi đã lọc, usage/latency của từng bước, tham chiếu output |
| `voice_fhir_links` | tenant/record/revision, resource type/ref, version/ETag, identifier, published content hash, published_at và trạng thái từng resource |
| `voice_integration_outbox` | event ID, tenant, record/revision, action, thời điểm, attempts, next_retry_at, lease/locked_until, error code, processed_at |
| `voice_sync_checkpoints` | tenant/consumer, cursor bền vững, thời điểm xử lý; cần khi pull changes từ MeliData |

Unique keys phải bao gồm tenant; ví dụ `(tenant_id, record_id, revision)`, `(tenant_id, event_id)`. Mọi read/write phải scope tenant và kiểm tra reference/asset cũng thuộc tenant đó.

Outbox chỉ chứa metadata/ref đến snapshot bất biến; không đưa transcript/bệnh án vào log, event metadata hoặc audit. Snapshot có PHI nằm trong bảng nghiệp vụ được phân quyền.

Trong SQLite bổ sung record cache version/remote refs, trạng thái lưu từ xa, trạng thái công bố FHIR, last_synced_at và local outbox. Không gộp `confirmed`, `archived`, `published` vào một status.

## 7. Cơ chế tự đồng bộ

### 7.1 Lưu và đẩy lên

1. Người dùng tạo/chỉnh sửa: transaction SQLite ghi record, snapshot revision và local outbox cùng lúc. Outbox trỏ revision bất biến, không chỉ trỏ row đang bị ghi đè.
2. Worker có lease lấy công việc, upload asset theo object key ổn định có tenant/record/asset; kiểm tra byte size và checksum.
3. Ghi record/revision/asset metadata vào kho nghiệp vụ trung tâm bằng key idempotent và kiểm soát revision. Snapshot cũ đến muộn không được ghi đè revision mới.
4. Cùng transaction ở kho nghiệp vụ, nếu revision đã được duyệt, ghi integration outbox để công bố FHIR. Khi mất máy cache, worker trung tâm vẫn tiếp tục được phần đã lưu bền vững.
5. Chỉ sau khi dữ liệu và file đều được kho bền vững xác nhận, local outbox mới được đánh dấu hoàn tất. Nếu sửa tiếp trong lúc sync, chỉ ACK đúng revision đã gửi.
6. Worker FHIR tạo/cập nhật DocumentReference và ghi ref/version/hash vào kho nghiệp vụ. Không tự chuyển draft/GT2 thành dữ liệu lâm sàng đã duyệt.

Đây là nhiều giao dịch nối bằng outbox/retry, không phải dual-write đồng bộ trong request hoặc transaction phân tán. Nếu crash giữa upload và lưu metadata, retry nhận ra object đã có; object chưa có metadata chỉ được dọn sau grace period và đối soát.

### 7.2 Idempotency và xung đột

- Create FHIR: search `identifier=system|value` trước; nếu chưa có thì POST kèm identifier này.
- Nếu POST timeout không biết đã commit chưa: search lại identifier trước khi POST lại.
- Khi 2 worker cùng tạo: unique identifier của MeliData chặn trùng; nhận 409 thì lookup lại và kiểm tra đúng nguồn nghiệp vụ trước khi ghi mapping.
- Update FHIR bằng PUT resource hiện có với `If-Match: W/"version"`. Server hiện trả 428 nếu thiếu header, 412 nếu version cũ.
- 412: đọc version mới, so với snapshot/hash đã công bố, xác định field/service sở hữu; không ghi đè mù hoặc tự merge Patient.
- Retry lỗi mạng/5xx/429 theo exponential backoff + jitter, tôn trọng Retry-After. Tự refresh token khi 401; 403 cần sửa grant; lỗi validation đưa vào hàng cần xử lý thay vì retry nóng.
- Worker có lease timeout để công việc đang chạy được nhận lại sau crash; deduplicate theo tenant/record/revision/action.

### 7.3 Đọc và dựng lại cache

- Chi tiết record: đọc cache; khi miss/stale thì tải record + revision từ kho nghiệp vụ, tải Patient/shared references từ MeliData theo quyền.
- Lịch sử: phân trang từ kho trung tâm; không chỉ liệt kê các row tình cờ còn trong SQLite.
- Audio: ưu tiên cache, nếu thiếu thì tải từ object storage qua endpoint xác thực; không tạo phụ thuộc URL cũ của máy cache.
- Tìm kiếm transcript/EMR/GT2: kho nghiệp vụ duy trì index/read model phù hợp. FHIR hiện chưa cung cấp tìm kiếm tương đương.
- Dọn cache chỉ khi remote revision/hash/asset đều đã xác nhận và không còn event pending. Giữ riêng retention của bản clinical đã công bố.
- Không lấy “không có trong một trang kết quả” làm tín hiệu xóa. Cần tombstone rõ ràng.
- `_lastUpdated` hiện có thể dùng để refresh resource sống với cửa sổ chồng lấn và dedupe theo id/version. Chưa đủ làm change feed đáng tin cậy: không thấy deletion, offset có thể dịch chuyển, không có stable cursor/high-watermark.
- Nếu cần đồng bộ thay đổi/xóa đầy đủ từ MeliData, bổ sung endpoint outbox theo tenant + cursor. Client chỉ commit cursor sau khi áp dụng thành công toàn batch. Việc endpoint chưa có không được che bằng cách giả định polling timestamp là tương đương.

### 7.4 Ý nghĩa “cache” và cam kết lưu

- Khi remote đã ACK, có thể xóa cache và dựng lại toàn bộ phần đó.
- Khi đang offline/chưa sync, SQLite + file local chứa dữ liệu chưa có bản khác, chưa thể coi là dữ liệu bỏ được. UI phải hiện “đã lưu trên máy, chờ đồng bộ”.
- Nếu yêu cầu không mất dữ liệu ngay cả khi máy cache hỏng tức thì, chỉ báo “đã lưu bền vững” sau remote ACK; hoặc ghi durable store trước khi hoàn tất request.
- Hiển thị riêng “đã bác sĩ duyệt”, “đã lưu trung tâm”, “đã công bố MeliData”; chỉ dùng nhãn “đã nhập EMR” khi đích đó thực sự xác nhận ghi thành công.

## 8. Object storage và phục hồi

Object key đề xuất: `tenants/<tenant-id>/melivoice/<record-uuid>/<asset-uuid>/original.<ext>`. Tên gốc để trong metadata, không dùng tên người bệnh làm key.

Giữ tối thiểu audio gốc và bản EMR revision đã duyệt; transcript và GT2/revision cần được giữ trong kho nghiệp vụ để khôi phục đúng lịch sử. Có thể xuất thêm manifest/snapshot JSON lên object storage phục vụ disaster recovery, nhưng object JSON đơn lẻ không thay được index/query nghiệp vụ nếu muốn tra cứu nhanh.

Lưu SHA-256 trong metadata asset để kiểm tra toàn vẹn. Nếu điền FHIR R4 `Attachment.hash`, trường chuẩn đó dùng SHA-1 base64, không đưa SHA-256 vào cùng trường mà gắn nhãn sai.

Bucket private; endpoint tải kiểm tra tenant/quyền rồi stream hoặc cấp URL ngắn hạn. Định danh asset và URL chuẩn phải tồn tại độc lập với máy MeliVoice. Không lưu JWT/client secret trong object hay record.

Backup PostgreSQL, object versioning/backup và diễn tập restore phải bao phủ cả kho nghiệp vụ lẫn FHIR. Storage bền vững không tự thay thế backup. Retention cụ thể cho audio, drafts, revisions và lỗi vận hành cần quy định theo mục đích sử dụng; không tự áp TTL lâm sàng từ TTL cache.

## 9. Lộ trình chuyển dữ liệu hiện có

1. Backup SQLite và audio nhất quán trước khi migration. Dùng SQLite backup API khi đang chạy; tránh copy file DB giữa lúc ghi rồi coi là snapshot chắc chắn.
2. Chốt tenant, nguồn định danh Patient và quyền người duyệt. Không tự gán 27 record sang tenant thật hay Patient giả từ mã BA.
3. Tạo kho nghiệp vụ, object storage, schema/version và API/adapter; sửa xác thực + tenant isolation MeliVoice, cấu hình service client MeliAuth cho MeliData.
4. Backfill 27 record và toàn bộ audio gốc vào kho bền vững; giữ nguyên legacy ID và mã cũ, tạo UUID/mapping ổn định. Import revision hiện tại làm baseline; không bịa model/người duyệt/thời gian cũ chưa có dữ liệu.
5. 23 record processed được lưu trong kho nghiệp vụ, chưa công bố lâm sàng. 4 record confirmed chỉ công bố sau khi xác minh tenant, Patient, người có thẩm quyền và nội dung; không suy ra việc được duyệt hợp lệ chỉ từ flag cũ.
6. Chạy worker outbox cho thay đổi mới; chống backfill ghi đè update phát sinh trong lúc chạy bằng revision/checkpoint hoặc cửa sổ dừng ghi ngắn khi cutover.
7. Đối soát số lượng, hash JSON/bytes audio, số record theo trạng thái, các trường metadata và foreign refs; không log dữ liệu bệnh nhân.
8. Kiểm thử xóa một cache thử nghiệm rồi mở lại đầy đủ hồ sơ, lịch sử và audio từ nguồn bền vững.
9. Chỉ bật eviction/TTL SQLite sau khi các bước kiểm chứng phục hồi thành công. Không xóa dữ liệu cũ trong quá trình khảo sát này.

## 10. Kiểm chứng cần có khi triển khai

- Mất mạng khi upload, khi commit trung tâm, khi POST FHIR đã commit nhưng response timeout.
- Worker crash/restart; 2 worker cùng xử lý một revision; retry không tạo resource/asset trùng.
- Sửa record trong lúc revision trước đang sync; ACK cũ không đánh dấu revision mới đã lưu.
- Version FHIR xung đột trả 412; không mất cập nhật của service khác.
- Tenant A không đọc/ghi/tải audio/nhận event của tenant B.
- Confirmed không bị sửa âm thầm; amendment có actor/time/reason và revision mới.
- Xóa cache không mất dữ liệu đã ACK; record đã tombstone không xuất hiện lại.
- Tất cả 27 record, 4 EMR hiện có và audio gốc được đối soát sau migration.
- Không có PHI/token/secret trong audit/outbox metadata và log.

## 11. Kết nối khi triển khai Docker

`localhost:3200` có tác dụng khi gọi từ host. Trong container MeliVoice, localhost là chính container MeliVoice. Phải dùng tên service/alias trên shared Docker network hoặc địa chỉ host được cấu hình rõ; không hardcode localhost vào worker container rồi kỳ vọng gọi được MeliData.

Các cấu hình mới dự kiến: MELIDATA_FHIR_BASE_URL, MeliAuth token endpoint/client credentials, durable store DSN riêng của MeliVoice, object storage endpoint/bucket, timeout/retry và cache retention. Tenant được lấy từ danh tính đã xác minh/grant, không tin tenant gửi tùy ý từ frontend.

## 12. Nguồn đối chiếu

- MeliVoice: `app/main.py`, `app/gpt_audio.py`, `app/P4_PROMPT.txt`, `static/assets/melivoice-api.js`, `static/assets/melivoice-auth.js`, `docker-compose.yml`.
- MeliData: `AGENTS.md`, `src/fhir/profile-registry.ts`, `src/fhir/fhir.controller.ts`, `src/fhir/fhir.service.ts`, `src/entities/`, migration ban đầu, auth/config và tài liệu trong `docs/`.
- Runtime: schema/thống kê tổng hợp SQLite, information_schema PostgreSQL, health, CapabilityStatement và Swagger.
- FHIR R4 DocumentReference: https://hl7.org/fhir/R4/documentreference.html
- FHIR R4 Attachment: https://hl7.org/fhir/R4/datatypes-definitions.html#Attachment.url
