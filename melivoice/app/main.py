"""MELI Voice backend: upload/ghi âm -> transcript -> GT2 (hồ sơ EMR), lưu SQLite + audio trên volume."""
import csv, hashlib, io, json, logging, os, shutil, sqlite3, subprocess, time, urllib.error, uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import gpt_audio
import archive_sync

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("DATA_DIR", ROOT.parent / "data"))
AUDIO_DIR = DATA / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA / "meli_voice.db"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("meli_voice")

@asynccontextmanager
async def lifespan(app):
    archive.start()
    yield
    archive.close()


app = FastAPI(title="MELI Voice API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def revalidate_static(request, call_next):
    """Giao diện (html/js/css) không gắn phiên bản vào tên file -> bắt trình duyệt hỏi lại server mỗi lần
    (không đổi thì chỉ nhận 304), để bản cập nhật tới người dùng ngay mà không phải xoá cache."""
    resp = await call_next(request)
    if not request.url.path.startswith("/api/") and "cache-control" not in resp.headers:
        resp.headers["Cache-Control"] = "no-cache"
    return resp


def db():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    return c


with db() as c:
    c.execute("""CREATE TABLE IF NOT EXISTS records(
        id TEXT PRIMARY KEY, created_at TEXT, patient_name TEXT, patient_code TEXT, doctor TEXT,
        department TEXT, source TEXT, duration REAL, audio_file TEXT, status TEXT, error TEXT,
        gt2 TEXT, emr TEXT, transcript TEXT, usage TEXT, latency REAL)""")
    cols = [x[1] for x in c.execute("PRAGMA table_info(records)")]
    # file_name: tên file gốc người dùng tải lên
    # transcript_status: ok | audio_error (AI báo âm thanh có vấn đề, bác sĩ nghe lại và tự nhập) | error (lỗi hệ thống)
    # audio_note: lý do lỗi âm thanh do AI ghi
    # error_kind (khi xử lý thất bại): bad_format | system (chỉ ghi log, không hiện cho người dùng)
    for col in ("file_name", "transcript_status", "transcript_error", "error_kind", "audio_note"):
        if col not in cols:
            c.execute(f"ALTER TABLE records ADD COLUMN {col} TEXT")
    # Bản ghi cũ: phân loại lại transcript / lỗi đã lưu
    for r in c.execute("SELECT id, transcript FROM records WHERE status!='pending' AND transcript_status IS NULL "
                       "AND transcript != ''").fetchall():  # transcript rỗng ở bản cũ = chưa từng chép lời, không phân loại
        c.execute("UPDATE records SET transcript_status=? WHERE id=?",
                  ("audio_error" if gpt_audio.is_audio_error(r[1]) else "ok", r[0]))
    # Trước đây lưu chữ giả "Chưa nhập tên" / "—" vào DB -> đổi về rỗng, giao diện tự hiển thị ô trống thống nhất
    c.execute("UPDATE records SET patient_name='' WHERE patient_name='Chưa nhập tên'")
    c.execute("UPDATE records SET doctor='' WHERE doctor='—'")
    c.execute("UPDATE records SET department='' WHERE department='—'")
    c.execute("UPDATE records SET error_kind='system' WHERE status='pending' AND error IS NOT NULL AND error_kind IS NULL")
    # Bản ghi cũ chưa có thời lượng (mp3 / xử lý lỗi): tính bù một lần khi khởi động
    for r in c.execute("SELECT id, audio_file FROM records WHERE duration IS NULL").fetchall():
        if (AUDIO_DIR / r[1]).is_file():
            c.execute("UPDATE records SET duration=? WHERE id=?", (gpt_audio.duration(AUDIO_DIR / r[1]), r[0]))
    archive_sync.initialize(c)
    for r in c.execute("SELECT id FROM records WHERE revision=0").fetchall():
        archive_sync.queue_record(c, r[0])

archive = archive_sync.ArchiveSync(db, AUDIO_DIR)


def row(r):
    d = dict(r)
    d["file_name"] = d.get("file_name") or d["audio_file"]  # bản ghi cũ không lưu tên gốc
    # Lỗi hệ thống chỉ nằm trong log server, không trả chi tiết ra ngoài
    d.pop("transcript_error", None)
    if d.get("transcript_status") == "error":
        d["transcript_status"] = None
    if d.get("error_kind") != "bad_format":
        d["error"] = None
    for k in archive_sync.JSON_FIELDS:
        if isinstance(d.get(k), str):
            d[k] = json.loads(d[k]) if d[k] else None
    d["patient_id"] = d.get("patient_id") or ""
    d["data_incomplete"] = not d["patient_id"].strip()
    d["missing_fields"] = ["patient_id"] if d["data_incomplete"] else []
    d["melidata_saved"] = d.get("sync_state") == "synced" and d.get("synced_revision") == d.get("revision")
    d["archive_enabled"] = archive.enabled
    for key in ("patient_id_temporary", "is_test_data", "melidata_consent"):
        d[key] = bool(d.get(key))
    d.pop("last_accessed_at", None)
    return d


def process_record(rid: str):
    """Chép lời audio (gpt-transcribe) rồi cấu trúc hoá transcript thành GT2 (gpt-5.6-sol); lưu kết quả."""
    with db() as c:
        r = c.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()
    if not r or r["deleted_at"] or r["status"] == "confirmed":
        return
    src = AUDIO_DIR / r["audio_file"]
    if not os.environ.get("OPENAI_API_KEY"):
        log.error("Server thiếu OPENAI_API_KEY, không xử lý được bản ghi %s", rid)
        _fail(rid, "Server thiếu OPENAI_API_KEY")
        return
    asr_audio = None
    try:
        dur = gpt_audio.duration(src)
        try:
            asr_audio = str(gpt_audio.to_asr_audio(src))
        except subprocess.CalledProcessError:
            _fail(rid, "Định dạng file không phù hợp, không đọc được âm thanh", "bad_format")
            return
        t0 = time.time()
        transcript, t_usage = gpt_audio.transcribe(asr_audio)
        t_lat = time.time() - t0
        res = None
        if gpt_audio.is_audio_error(transcript):
            # Im lặng/chỉ có tiếng ồn: ASR trả rỗng -> không gọi bước cấu trúc hoá để tránh GT2 bịa
            gt2, t_status, note = None, "audio_error", "không nhận diện được lời nói trong bản ghi"
            transcript = None
        else:
            res = gpt_audio.extract_gt2(transcript)
            if not res["json_parse_valid"]:
                raise RuntimeError(f"Model trả JSON không hợp lệ: {res['parse_error']}")
            gt2, t_status, note = res["parsed_gt2"], "ok", None
            if res["status"] == "loi_am_thanh":
                # Giữ transcript để bác sĩ thấy AI đã nghe được gì, GT2 để trống
                gt2, t_status, note = None, "audio_error", res["reason"]
            elif res["status"] == "khong_phai_benh_an":
                log.info("Bản ghi %s: nội dung không phải bệnh án (%s)", rid, res["reason"] or "không rõ")
                gt2 = None
        if t_status == "audio_error":
            log.info("Bản ghi %s: AI báo lỗi âm thanh (%s)", rid, note or "không rõ lý do")
        usage = {"transcribe": {"model": gpt_audio.TRANSCRIBE_MODEL, "usage": t_usage, "latency_sec": round(t_lat, 2)},
                 "structure": res and {"model": res["model"], "usage": res["usage"], "latency_sec": res["latency_sec"]}}
        latency = round(t_lat + (res["latency_sec"] if res else 0), 2)
        with db() as c:
            changed = c.execute("UPDATE records SET status='processed', error=NULL, error_kind=NULL, gt2=?, transcript=?, "
                      "transcript_status=?, transcript_error=?, audio_note=?, usage=?, latency=?, "
                      "duration=COALESCE(?,duration) WHERE id=? AND deleted_at IS NULL AND status!='confirmed'",
                      (json.dumps(gt2, ensure_ascii=False) if gt2 else None, transcript, t_status, None, note,
                       json.dumps(usage), latency, dur, rid))
            if changed.rowcount:
                archive_sync.queue_record(c, rid)
    except Exception as e:
        log.exception("Xử lý bản ghi %s thất bại", rid)
        _fail(rid, str(e)[:500])
    finally:
        if asr_audio:
            shutil.rmtree(Path(asr_audio).parent, ignore_errors=True)


def _fail(rid, msg, kind="system"):
    with db() as c:
        changed = c.execute("UPDATE records SET status='pending', error=?, error_kind=? "
                            "WHERE id=? AND deleted_at IS NULL AND status!='confirmed'", (msg, kind, rid))
        if changed.rowcount:
            archive_sync.queue_record(c, rid)


def next_code():
    pref = "BA-" + datetime.now().strftime("%y%m%d") + "-"
    with db() as c:
        n = c.execute("SELECT COUNT(*) FROM records WHERE patient_code LIKE ?", (pref + "%",)).fetchone()[0]
    return f"{pref}{n + 1:03d}"


@app.get("/api/health")
def health():
    return {"ok": True, "openai_key": bool(os.environ.get("OPENAI_API_KEY")), "model": {"transcribe": gpt_audio.TRANSCRIBE_MODEL, "structure": gpt_audio.STRUCTURE_MODEL},
            "melidata_configured": archive.enabled, "cache": archive.cache_status()}


@app.post("/api/records")
async def create_record(file: UploadFile = File(...), patient_name: str = Form(""), patient_code: str = Form(""),
                        doctor: str = Form(""), department: str = Form(""), source: str = Form("file"),
                        patient_id: str = Form("")):
    if len(patient_id.strip()) > 128:
        raise HTTPException(400, "Patient ID tối đa 128 ký tự")
    rid = uuid.uuid4().hex[:12]
    suffix = Path(file.filename or "a.wav").suffix or ".wav"
    name = rid + suffix
    audio = await file.read(64 * 1024 * 1024 + 1)
    if len(audio) > 64 * 1024 * 1024:
        raise HTTPException(413, "File ghi âm tối đa 64 MB")
    (AUDIO_DIR / name).write_bytes(audio)
    dur = await run_in_threadpool(gpt_audio.duration, AUDIO_DIR / name)  # có ngay cả khi xử lý lỗi
    if dur is None:  # ffmpeg không giải mã được -> không phải file âm thanh hợp lệ, không tạo bản ghi
        (AUDIO_DIR / name).unlink(missing_ok=True)
        raise HTTPException(400, "Định dạng file không phù hợp: không đọc được âm thanh. "
                                 "Hãy dùng file MP3, WAV, M4A, WEBM hoặc OGG.")
    with db() as c:
        c.execute("INSERT INTO records(id,created_at,patient_name,patient_code,doctor,department,source,"
                  "audio_file,file_name,duration,patient_id,audio_sha256,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'pending')",
                  (rid, datetime.now().isoformat(timespec="seconds"), patient_name.strip(),
                   patient_code.strip() or next_code(), doctor.strip(), department.strip(),
                   "mic" if source == "mic" else "file", name,
                   Path(file.filename or name).name.strip() or name, dur, patient_id.strip(), hashlib.sha256(audio).hexdigest()))
        archive_sync.queue_record(c, rid)
    await run_in_threadpool(process_record, rid)
    return get_record(rid)


@app.post("/api/records/{rid}/process")
async def reprocess(rid: str):
    record = get_record(rid)
    if record["status"] == "confirmed":
        raise HTTPException(409, "Bản ghi đã chốt (đã nhập EMR), không thể xử lý lại")
    ensure_audio(record)
    await run_in_threadpool(process_record, rid)
    return get_record(rid)


@app.get("/api/records")
def list_records(q: str = "", status: str = ""):
    if archive.enabled:
        try:
            # Persist central state (e.g. publication_status) so an outage still shows the latest known status;
            # accept_remote never replaces a local unsent edit.
            for remote in archive.remote_list():
                archive.accept_remote(remote)
        except Exception:
            log.warning("MeliData history unavailable; serving local cache")
    with db() as c:
        local = {r["id"]: dict(r) for r in c.execute("SELECT * FROM records").fetchall()}
    matches = []
    for record in local.values():
        if record.get("deleted_at") or (status and record["status"] != status):
            continue
        if q and q.casefold() not in " ".join(str(record.get(k) or "") for k in
                ("patient_name", "patient_code", "patient_id", "doctor", "department", "transcript", "gt2", "emr")).casefold():
            continue
        matches.append({k: v for k, v in row(record).items() if k != "usage"})
    return sorted(matches, key=lambda record: record["created_at"], reverse=True)


@app.get("/api/records/{rid}")
def get_record(rid: str):
    with db() as c:
        r = c.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()
    if archive.enabled and (not r or r["revision"] == r["synced_revision"]):
        try:
            r = archive.restore(rid)
        except urllib.error.HTTPError as error:
            if error.code == 404 and not r:
                raise HTTPException(404, "Không tìm thấy bản ghi")
        except Exception:
            log.warning("MeliData record unavailable; serving local cache")
    if not r or r["deleted_at"]:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    with db() as c:
        c.execute("UPDATE records SET last_accessed_at=? WHERE id=?", (time.time(), rid))
    return row(r)


def ensure_audio(record):
    source = AUDIO_DIR / record["audio_file"]
    if not source.is_file() and archive.enabled:
        try:
            archive.download(record["id"], source, record.get("audio_sha256"))
        except Exception:
            raise HTTPException(503, "Chưa tải được bản ghi âm từ MeliData, vui lòng thử lại") from None
    if not source.is_file():
        raise HTTPException(404, "Không tìm thấy bản ghi âm")
    return source


class Patch(BaseModel):
    emr: Optional[dict] = None
    status: Optional[str] = None  # draft | confirmed
    patient_name: Optional[str] = None
    patient_code: Optional[str] = None
    doctor: Optional[str] = None
    department: Optional[str] = None
    patient_id: Optional[str] = None


@app.patch("/api/records/{rid}")
def patch_record(rid: str, p: Patch):
    r = get_record(rid)
    sets, args = [], []
    if p.emr is not None:
        sets.append("emr=?"); args.append(json.dumps(p.emr, ensure_ascii=False))
    if p.status:
        if p.status not in ("draft", "confirmed"):
            raise HTTPException(400, "status chỉ nhận draft/confirmed")
        if r["status"] == "confirmed" and p.status != "confirmed":
            raise HTTPException(409, "Bản ghi đã chốt (đã nhập EMR), không thể chuyển lại thành bản nháp")
        sets.append("status=?"); args.append(p.status)
        if p.status == "confirmed":
            if not (p.emr if p.emr is not None else r.get("emr")):
                raise HTTPException(400, "Hãy nhập nội dung EMR trước khi lưu")
            sets.extend(("melidata_consent=1", "consented_at=?"))
            args.append(datetime.now().astimezone().isoformat(timespec="seconds"))
    for k in ("patient_name", "patient_code", "doctor", "department", "patient_id"):
        if getattr(p, k) is not None:
            value = getattr(p, k).strip()
            if k == "patient_id":
                if len(value) > 128:
                    raise HTTPException(400, "Patient ID tối đa 128 ký tự")
                if value != r.get("patient_id"):
                    sets.append("patient_id_temporary=0")
            sets.append(f"{k}=?"); args.append(value)
    if sets:
        with db() as c:
            c.execute("BEGIN IMMEDIATE")
            current = c.execute("SELECT status,deleted_at FROM records WHERE id=?", (rid,)).fetchone()
            if not current or current["deleted_at"]:
                raise HTTPException(404, "Không tìm thấy bản ghi")
            if current["status"] == "confirmed" and p.status and p.status != "confirmed":
                raise HTTPException(409, "Bản ghi đã lưu EMR, không thể chuyển lại thành bản nháp")
            c.execute(f"UPDATE records SET {','.join(sets)} WHERE id=?", args + [rid])
            archive_sync.queue_record(c, rid)
        archive.sync_one(rid)
    return get_record(rid)


@app.delete("/api/records/{rid}")
def delete_record(rid: str, confirm: str = ""):
    r = get_record(rid)
    if r["status"] == "confirmed":  # đã chốt (đã nhập EMR) thì giữ lại, chỉ bản chưa chốt mới được xoá
        raise HTTPException(409, "Bản ghi đã chốt (đã nhập EMR), không được phép xoá")
    if confirm.strip() != r["file_name"]:  # phải gõ đúng tên file mới được xoá
        raise HTTPException(400, "Tên file xác nhận không khớp, bản ghi chưa bị xoá")
    if archive.enabled:
        try:
            archive.delete_draft(rid, confirm)
        except PermissionError:
            raise HTTPException(409, "Bản ghi đã lưu EMR, không được phép xóa") from None
        except ValueError:
            raise HTTPException(400, "Tên file xác nhận không khớp, bản ghi chưa bị xóa") from None
        except KeyError:
            raise HTTPException(404, "Không tìm thấy bản ghi") from None
        except urllib.error.HTTPError as error:
            if error.code == 409:
                raise HTTPException(409, "Bản ghi đã thay đổi hoặc đã lưu EMR. Hãy tải lại lịch sử trước khi xóa.") from None
            raise HTTPException(503, "Chưa xóa được bản ghi tại MeliData. Bản ghi vẫn được giữ, vui lòng thử lại.") from None
        except Exception:
            raise HTTPException(503, "Chưa xóa được bản ghi tại MeliData. Bản ghi vẫn được giữ, vui lòng thử lại.") from None
        return {"ok": True}
    (AUDIO_DIR / r["audio_file"]).unlink(missing_ok=True)
    (AUDIO_DIR / (rid + ".play.mp3")).unlink(missing_ok=True)
    with db() as c:
        c.execute("DELETE FROM sync_outbox WHERE record_id=?", (rid,))
        c.execute("DELETE FROM records WHERE id=?", (rid,))
    return {"ok": True}


@app.get("/api/records/{rid}/audio")
def record_audio(rid: str):
    r = get_record(rid)
    src = ensure_audio(r)
    if src.suffix.lower() == ".mp3":
        return FileResponse(src, media_type="audio/mpeg")
    if src.suffix.lower() == ".wav":
        return FileResponse(src, media_type="audio/wav")
    play = AUDIO_DIR / (rid + ".play.mp3")  # chuyển một lần, lần sau dùng lại
    if not play.is_file():
        try:
            gpt_audio.to_mp3(src, play)
        except Exception:
            log.exception("Không chuyển được audio bản ghi %s sang mp3 để phát", rid)
            play.unlink(missing_ok=True)
            return FileResponse(src)
    return FileResponse(play, media_type="audio/mpeg")


STATUS_VI = {"pending": "Chưa xử lý", "processed": "Chờ bác sĩ kiểm tra", "draft": "Đang chỉnh sửa", "confirmed": "Đã nhập EMR"}


@app.get("/api/export.csv")
def export_csv():
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Thời gian", "Mã hồ sơ", "Bệnh nhân", "Bác sĩ", "Khoa", "Nguồn", "Thời lượng (s)", "Trạng thái"])
    for r in list_records():
        w.writerow([r["created_at"], r["patient_code"], r["patient_name"], r["doctor"], r["department"],
                    "Ghi trực tiếp" if r["source"] == "mic" else "File", round(r["duration"] or 0),
                    STATUS_VI.get(r["status"], r["status"])])
    return Response("﻿" + out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="meli-voice-history.csv"'})


@app.get("/config.js", include_in_schema=False)
def web_config():
    """Cấu hình đăng nhập cho giao diện, nạp trước melivoice-auth.js."""
    cfg = {"authUrl": os.environ.get("AUTH_URL", "https://auth.meliq.ai"),
           "portalUrl": os.environ.get("PORTAL_URL", "https://melicare.meliq.ai/"),
           # chạy local: portal không trả token về localhost nên /login có nút đăng nhập giả
           "devLogin": os.environ.get("DEV_LOGIN", "").lower() in ("1", "true", "yes")}
    return Response(f"window.MELI_VOICE_CONFIG={json.dumps(cfg)};", media_type="application/javascript",
                    headers={"Cache-Control": "no-store"})


# Giao diện web: phục vụ cùng cổng với API để chạy độc lập chỉ bằng một lệnh
STATIC = Path(os.environ.get("STATIC_DIR", ROOT.parent / "static"))
if STATIC.is_dir():
    @app.get("/login", include_in_schema=False)
    def login_page():
        return FileResponse(STATIC / "login.html")

    # Các trang của giao diện một trang: tải lại hoặc mở link trực tiếp vẫn ra index.html
    @app.get("/history", include_in_schema=False)
    def history_page():
        return FileResponse(STATIC / "index.html")

    app.mount("/", StaticFiles(directory=STATIC, html=True), name="web")
