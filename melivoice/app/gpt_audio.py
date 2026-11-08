#!/usr/bin/env python3
"""Audio bệnh án tiếng Việt -> transcript (gpt-transcribe) -> GT2 JSON (gpt-5.6-sol, structured output)."""
import json, os, re, shutil, subprocess, tempfile, time
from pathlib import Path
from openai import OpenAI

HERE = Path(__file__).parent
def _ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg  # ffmpeg đóng gói sẵn trong pip (container không cần apt)
    return imageio_ffmpeg.get_ffmpeg_exe()


TRANSCRIBE_MODEL = os.environ.get("TRANSCRIBE_MODEL", "gpt-transcribe")
STRUCTURE_MODEL = os.environ.get("STRUCTURE_MODEL", "gpt-5.6-sol")
STRUCTURE_REASONING = os.environ.get("STRUCTURE_REASONING", "medium")  # low | medium | high
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # giới hạn file của API transcriptions
# Gợi ý từ vựng cho ASR: chỉ là bối cảnh chung, không chứa nội dung bệnh án cụ thể
ASR_PROMPT = ("Bác sĩ đọc bệnh án tiếng Việt: hành chính, lý do vào viện, quá trình bệnh lý, tiền sử, khám lúc vào viện, "
              "cận lâm sàng, chẩn đoán, phẫu thuật, phương pháp vô cảm, thuốc điều trị, diễn biến, ra viện. "
              "Thuật ngữ thường gặp: bàng quang, sonde, dẫn lưu, hậu phẫu, huyết động, tri giác, Glasgow, VAS, ASA, "
              "SpO2, mmHg, X-quang, CT, MRI, siêu âm, nội khí quản, tê tủy sống.")


def to_asr_audio(path: Path) -> Path:
    """Chuẩn hoá cho ASR: mono 16 kHz FLAC (không mất mát, ~1/2 dung lượng WAV -> audio dài hơn vẫn dưới 25 MB)."""
    out = Path(tempfile.mkdtemp()) / (path.stem + ".flac")
    # loudnorm: bản ghi điện thoại (m4a) thường nhỏ tiếng -> model "không nghe thấy" audio
    subprocess.run([_ffmpeg(), "-y", "-i", str(path), "-af", "loudnorm", "-ac", "1", "-ar", "16000", str(out)],
                   check=True, capture_output=True)
    return out


def to_mp3(path: Path, out: Path) -> Path:
    """Bản phát lại cho trình duyệt: m4a/webm/ogg không phát được ở mọi trình duyệt (Safari không phát webm)."""
    subprocess.run([_ffmpeg(), "-y", "-i", str(path), "-vn", "-ac", "1", "-b:a", "96k", str(out)],
                   check=True, capture_output=True)
    return out


def duration(path: Path):
    """Thời lượng (giây) bằng cách giải mã toàn bộ file: webm từ MediaRecorder không ghi Duration trong header."""
    try:
        err = subprocess.run([_ffmpeg(), "-i", str(path), "-f", "null", "-"], capture_output=True, text=True).stderr
        h, m, s = re.findall(r"time=(\d+):(\d+):([\d.]+)", err)[-1]
        return round(int(h) * 3600 + int(m) * 60 + float(s), 2)
    except Exception:
        return None


AUDIO_ERROR = "[LOI_AM_THANH]"  # model trả về khi âm thanh có vấn đề, theo sau là lý do ngắn


def clean_transcript(text) -> str:
    """Model hay bọc lời chép trong JSON: {"transcription": "..."}, {"Bệnh nhân..."} (thiếu ngoặc) hoặc {"hearing": true}.
    Bóc lấy phần chữ; JSON không chứa chữ nào thì coi là rỗng."""
    t = (text or "").strip()
    if not t.startswith(("{", "[")):
        return t
    try:
        j = json.loads(t)
        if isinstance(j, dict):
            items = [(k, v.strip()) for k, v in j.items() if isinstance(v, str) and v.strip()]
            if len(items) > 1:  # model tự chia thành nhiều trường -> giữ cả tên trường để không mất chữ
                return "\n".join(f"{k}: {v}" for k, v in items)
            return items[0][1] if items else ""
        vals = j if isinstance(j, list) else [j]
        return "\n".join(v.strip() for v in vals if isinstance(v, str) and v.strip())
    except ValueError:
        return re.sub(r'"?\s*[}\]]$', "", re.sub(r'^[{\[]\s*"?(\w+"\s*:\s*")?', "", t)).strip()


def audio_error_reason(text) -> str:
    """Lý do model ghi sau marker lỗi âm thanh (có thể rỗng)."""
    t = clean_transcript(text)
    i = t.find(AUDIO_ERROR.strip("[]"))
    return t[i + len(AUDIO_ERROR.strip("[]")):].strip(" ]:-–—.\n") if i >= 0 else ""


def is_audio_error(text) -> bool:
    """Âm thanh có vấn đề: model trả marker lỗi, trả rỗng, JSON không có chữ ({"hearing": true}) hoặc xin gửi audio."""
    t = clean_transcript(text)
    if not t or AUDIO_ERROR.strip("[]") in t:
        return True
    # rác model bịa ra khi không nghe được gì: chuỗi base64 (header WAV "UklGR..."), một từ tiếng Anh kiểu "silent"
    # hoặc câu tiếng Anh báo không có tiếng ("no speech detected", "no_speech_detected", "silence"...)
    if re.fullmatch(r"[A-Za-z0-9+/=]{24,}", t) or t.strip(".").lower() in ("none", "null", "n/a"):
        return True
    if re.search(r"\b(speech|silence|silent|noise|inaudible|unintelligible|no audio|no sound|no voice)\b",
                 t.replace("_", " ").lower()):
        return True
    return bool(re.search(r"(cung cấp|gửi|tải lên)[^.]{0,30}(audio|âm thanh|tệp|file)|"
                          r"không (nghe|nhận diện)[^.]{0,20}(lời nói|âm thanh)|không có (lời nói|âm thanh|tiếng nói)|"
                          r"^(audio |file )?chỉ có tiếng ồn|"
                          r"^(sorry|i'?m sorry|i can.?t|i cannot|i am unable|unable to)", t, re.I))


def _nullable(t):
    return {"type": [t, "null"]}


def _list_of(item):
    return {"type": ["array", "null"], "items": item}


def _obj(props):
    return {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}


S = _nullable("string")
GT2_SCHEMA = _obj({
    "hanh_chinh": _obj({"gioi_tinh": {"type": ["string", "null"], "enum": ["Nam", "Nữ", None]},
                        "tuoi": _nullable("integer")}),
    "ly_do_vao_vien": S,
    "qua_trinh_benh_ly": S,
    "tien_su": _obj({"ban_than": S, "gia_dinh": S}),
    "kham_luc_vao": S,
    "can_lam_sang_de_cap": _list_of(_obj({"ten": S, "ket_qua": S, "text": S})),
    "chan_doan": _obj({"chinh": S, "kem_theo": S}),
    "xu_tri": _obj({"thu_thuat": _list_of(_obj({"method": S, "phuong_phap_vo_cam": S, "text": S})),
                    "thuoc_dieu_tri": _list_of({"type": "string"})}),
    "dien_bien_bien_chung": S,
    "ket_cuc": S,
    "thuc_the_lam_sang": _list_of(_obj({"text": {"type": "string"}, "loai": {"type": "string", "enum": [
        "SINH_HIEU_XET_NGHIEM", "CHI_SO_LAM_SANG", "TEN_THUOC", "THUAT_NGU_CHUYEN_MON"]}})),
})
RESPONSE_SCHEMA = _obj({
    "trang_thai": {"type": "string", "enum": ["benh_an", "khong_phai_benh_an", "loi_am_thanh"]},
    "ly_do": S,
    "gt2": GT2_SCHEMA,
})


def _prune(v):
    """Chuỗi rỗng/khoảng trắng -> null, bỏ dấu chấm cuối; bỏ phần tử rỗng và trùng trong list."""
    if isinstance(v, str):
        return re.sub(r"(?<!\.)\.$", "", v.strip()) or None  # bỏ dấu chấm cuối (giữ "...")
    if isinstance(v, list):
        out = []
        for x in map(_prune, v):
            if x is not None and x not in out:
                out.append(x)
        return out or None
    if isinstance(v, dict):
        return {k: _prune(x) for k, x in v.items()}
    return v


def _prune_items(gt2):
    """Mục danh sách có cấu trúc mà mọi trường đều null (thực thể không có text) là mục rỗng -> bỏ."""
    for parent, key in ((gt2, "can_lam_sang_de_cap"), (gt2.get("xu_tri") or {}, "thu_thuat")):
        items = [it for it in parent.get(key) or [] if any(x is not None for x in it.values())]
        parent[key] = items or None
    gt2["thuc_the_lam_sang"] = [e for e in gt2.get("thuc_the_lam_sang") or [] if e["text"]] or None
    return gt2


def extract_gt2(transcript: str):
    """Transcript -> GT2. Trả về trang_thai (benh_an | khong_phai_benh_an | loi_am_thanh), ly_do và parsed_gt2."""
    prompt = (HERE / "P4_PROMPT.txt").read_text(encoding="utf-8")
    messages = [{"role": "system", "content": prompt},
                {"role": "user", "content": f"<transcript>\n{transcript}\n</transcript>"}]
    t0 = time.time()
    resp = OpenAI().chat.completions.create(
        model=STRUCTURE_MODEL, messages=messages, reasoning_effort=STRUCTURE_REASONING,
        response_format={"type": "json_schema",
                         "json_schema": {"name": "gt2_extraction", "strict": True, "schema": RESPONSE_SCHEMA}})
    msg = resp.choices[0].message
    raw = msg.content or ""
    try:
        out, err = json.loads(raw), None
        if getattr(msg, "refusal", None):
            raise ValueError(f"Model từ chối: {msg.refusal}")
    except ValueError as e:
        out, err = None, str(e)
    gt2 = None
    if out:
        gt2 = _prune_items(_prune(out["gt2"]))
    u = resp.usage
    return {"model": STRUCTURE_MODEL, "latency_sec": round(time.time() - t0, 2),
            "usage": u.model_dump() if u else None, "json_parse_valid": out is not None, "parse_error": err,
            "status": out and out["trang_thai"], "reason": out and _prune(out["ly_do"]),
            "parsed_gt2": gt2, "raw": raw}


def transcribe(audio_path: str):
    """Chép lời bằng model ASR chuyên dụng. Trả về (transcript, usage); im lặng/chỉ có tiếng ồn -> chuỗi rỗng."""
    src = Path(audio_path)
    if src.stat().st_size > MAX_UPLOAD_BYTES:
        raise RuntimeError(f"Bản ghi quá dài cho API chép lời ({src.stat().st_size // 2**20} MB > 25 MB)")
    with src.open("rb") as f:
        resp = OpenAI().audio.transcriptions.create(model=TRANSCRIBE_MODEL, file=f, language="vi", prompt=ASR_PROMPT)
    u = getattr(resp, "usage", None)
    return clean_transcript(resp.text), (u.model_dump() if u else None)
