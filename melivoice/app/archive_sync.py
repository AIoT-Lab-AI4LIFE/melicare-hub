"""Durable MeliData archive with a transactional SQLite outbox and recoverable audio cache."""
import hashlib
import json
import logging
import mimetypes
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger("meli_voice.archive")
JSON_FIELDS = ("gt2", "emr", "usage", "simulated_fields")
WIRE_FIELDS = (
    "id", "created_at", "patient_name", "patient_code", "doctor", "department", "source", "duration",
    "audio_file", "file_name", "status", "error", "error_kind", "gt2", "emr", "transcript", "usage",
    "latency", "transcript_status", "transcript_error", "audio_note", "patient_id", "patient_id_temporary",
    "is_test_data", "simulated_fields", "revision", "updated_at", "melidata_consent", "consented_at",
    "audio_sha256", "deleted_at",
)


def initialize(c):
    columns = {r[1] for r in c.execute("PRAGMA table_info(records)")}
    additions = {
        "patient_id": "TEXT NOT NULL DEFAULT ''", "patient_id_temporary": "INTEGER NOT NULL DEFAULT 0",
        "is_test_data": "INTEGER NOT NULL DEFAULT 0", "simulated_fields": "TEXT",
        "revision": "INTEGER NOT NULL DEFAULT 0", "updated_at": "TEXT", "melidata_consent": "INTEGER NOT NULL DEFAULT 0",
        "consented_at": "TEXT", "audio_sha256": "TEXT", "deleted_at": "TEXT",
        "sync_state": "TEXT NOT NULL DEFAULT 'pending'", "synced_revision": "INTEGER NOT NULL DEFAULT 0",
        "publication_status": "TEXT NOT NULL DEFAULT 'temporary'", "document_ref": "TEXT",
        "last_accessed_at": "REAL NOT NULL DEFAULT 0",
    }
    for name, definition in additions.items():
        if name not in columns:
            c.execute(f"ALTER TABLE records ADD COLUMN {name} {definition}")
    c.execute("""CREATE TABLE IF NOT EXISTS sync_outbox (
        record_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, next_retry REAL NOT NULL DEFAULT 0)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_at)")


def wire_record(record):
    value = {k: record[k] for k in WIRE_FIELDS if k in record.keys()}
    for key in JSON_FIELDS:
        if isinstance(value.get(key), str):
            value[key] = json.loads(value[key])
    return value


def queue_record(c, rid):
    """Call inside the SAME transaction that changes the record."""
    c.execute("UPDATE records SET revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),"
              "sync_state='pending',last_accessed_at=? WHERE id=?", (time.time(), rid))
    record = c.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()
    snapshot = json.dumps(wire_record(record), ensure_ascii=False)
    c.execute("INSERT INTO sync_outbox(record_id,revision,snapshot) VALUES(?,?,?) "
              "ON CONFLICT(record_id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot,"
              "attempts=0,next_retry=0", (rid, record["revision"], snapshot))


class ArchiveSync:
    def __init__(self, connect, audio_dir, base_url=None):
        self.connect, self.audio_dir = connect, Path(audio_dir)
        self.base = (base_url if base_url is not None else os.getenv("MELIDATA_URL", "")).rstrip("/")
        self.tenant = os.getenv("MELIDATA_TENANT_ID", "development")
        self.token = os.getenv("MELIDATA_TOKEN", "")
        self.token_expiry = 0
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread = None
        self.max_audio_bytes = int(os.getenv("CACHE_AUDIO_MAX_MB", "512")) * 1024 * 1024
        self.max_records = int(os.getenv("CACHE_MAX_RECORDS", "1000"))

    @property
    def enabled(self):
        return bool(self.base)

    def _headers(self):
        client_id = os.getenv("MELIDATA_CLIENT_ID")
        if client_id and time.time() >= self.token_expiry:
            endpoint = os.environ["MELIDATA_TOKEN_URL"]
            payload = json.dumps({"grant_type": "client_credentials", "client_id": client_id,
                                  "client_secret": os.environ["MELIDATA_CLIENT_SECRET"],
                                  "tenant_id": self.tenant, "audience": "melidata"}).encode()
            request = urllib.request.Request(endpoint, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=10) as response:
                result = json.load(response)
            self.token = result["access_token"]
            self.token_expiry = time.time() + max(1, int(result.get("expires_in", 300)) - 30)
        headers = {"x-tenant-id": self.tenant, "x-client-id": "melivoice-backend"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        return headers

    def request(self, path, method="GET", payload=None, raw=False, content_type=None):
        headers = self._headers()
        if raw:
            data = payload
            headers["Content-Type"] = "application/octet-stream"
            headers["x-audio-content-type"] = content_type or "application/octet-stream"
        else:
            data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + "/api/v1/melivoice/records" + path,
                                         data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.read() if raw and method == "GET" else json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 401 and os.getenv("MELIDATA_CLIENT_ID"):
                self.token_expiry = 0
            raise

    def start(self):
        if not self.enabled:
            return
        self.thread = threading.Thread(target=self._loop, name="melidata-archive", daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=2)

    def _loop(self):
        while not self.stop.is_set():
            try:
                with self.connect() as c:
                    jobs = c.execute("SELECT record_id FROM sync_outbox WHERE next_retry<=? ORDER BY next_retry LIMIT 20",
                                     (time.time(),)).fetchall()
                for job in jobs:
                    if self.stop.is_set():
                        break
                    self.sync_one(job[0])
            except Exception:
                log.warning("Archive worker unavailable; local data retained")
            self.stop.wait(5)

    def sync_one(self, rid):
        if not self.enabled:
            return False
        with self.lock:
            with self.connect() as c:
                job = c.execute("SELECT * FROM sync_outbox WHERE record_id=?", (rid,)).fetchone()
            if not job:
                return True
            snapshot = json.loads(job["snapshot"])
            try:
                if not snapshot.get("deleted_at"):
                    source = self.audio_dir / snapshot["audio_file"]
                    if not source.is_file():
                        self.download(rid, source, snapshot.get("audio_sha256"))
                    audio = source.read_bytes()
                    digest = hashlib.sha256(audio).hexdigest()
                    if snapshot.get("audio_sha256") and snapshot["audio_sha256"] != digest:
                        raise ValueError("Audio checksum mismatch")
                    snapshot["audio_sha256"] = digest
                    with self.connect() as c:
                        c.execute("UPDATE records SET audio_sha256=? WHERE id=?", (digest, rid))
                        c.execute("UPDATE sync_outbox SET snapshot=? WHERE record_id=? AND revision=?",
                                  (json.dumps(snapshot, ensure_ascii=False), rid, job["revision"]))
                    self.request(f"/{rid}/assets/{digest}", "PUT", audio, raw=True,
                                 content_type="audio/webm" if source.suffix.lower() == ".webm" else mimetypes.guess_type(source.name)[0])
                result = self.request(f"/{rid}", "PUT", {"revision": job["revision"], "snapshot": snapshot})
                with self.connect() as c:
                    c.execute("UPDATE records SET synced_revision=?,sync_state='synced',publication_status=?,document_ref=? "
                              "WHERE id=? AND revision=?", (job["revision"], result["publication_status"],
                                                          result.get("document_ref"), rid, job["revision"]))
                    c.execute("DELETE FROM sync_outbox WHERE record_id=? AND revision=?", (rid, job["revision"]))
                return True
            except Exception as error:
                # Log codes only: upstream bodies, exception strings and snapshots can contain PHI.
                code = error.code if isinstance(error, urllib.error.HTTPError) else "unavailable"
                log.warning("MeliData archive retry scheduled (code=%s)", code)
                with self.connect() as c:
                    c.execute("UPDATE records SET sync_state=? WHERE id=? AND revision=?",
                              ("conflict" if code == 409 else "pending", rid, job["revision"]))
                    c.execute("UPDATE sync_outbox SET attempts=attempts+1,next_retry=? WHERE record_id=? AND revision=?",
                              (time.time() + min(300, 2 ** min(job["attempts"] + 1, 8)), rid, job["revision"]))
                return False

    def remote_list(self):
        if not self.enabled:
            return []
        records, offset = [], 0
        while True:
            page = self.request(f"?offset={offset}")
            records.extend(page["records"])
            offset = page["next_offset"]
            if offset is None:
                return records

    def delete_draft(self, rid, confirm):
        """Explicit user deletion: acknowledge a central tombstone before hiding the local record.

        Serialize against the sync worker and local writes. Preserve archive history and assets;
        this is not cache eviction or a physical purge of medical data.
        """
        with self.lock, self.connect() as c:
            c.execute("BEGIN IMMEDIATE")
            record = c.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()
            if not record:
                raise KeyError(rid)
            if record["status"] == "confirmed" or record["melidata_consent"] or record["document_ref"]:
                raise PermissionError("Confirmed EMR records cannot be deleted")
            if confirm.strip() != (record["file_name"] or record["audio_file"]):
                raise ValueError("File name does not match")
            if record["deleted_at"]:
                return
            snapshot = wire_record(record)
            stamp = datetime.now(timezone.utc).isoformat()
            snapshot.update(deleted_at=stamp, updated_at=stamp, revision=record["revision"] + 1)
            try:
                result = self.request(f"/{rid}", "PUT", {"revision": snapshot["revision"], "snapshot": snapshot})
            except urllib.error.HTTPError as error:
                # A lost ACK makes the retry carry a new deleted_at (409); accept the tombstone already archived.
                if error.code != 409:
                    raise
                result = self.request(f"/{rid}")
                if not result.get("snapshot", {}).get("deleted_at") or result.get("revision", 0) < snapshot["revision"]:
                    raise error from None
            if result.get("revision", 0) < snapshot["revision"] or not result.get("snapshot", {}).get("deleted_at"):
                raise RuntimeError("Deletion was not acknowledged")
            stamp, revision = result["snapshot"]["deleted_at"], result["revision"]
            c.execute("UPDATE records SET deleted_at=?,updated_at=?,revision=?,synced_revision=?,"
                      "sync_state='synced',publication_status='deleted' WHERE id=?",
                      (stamp, stamp, revision, revision, rid))
            c.execute("DELETE FROM sync_outbox WHERE record_id=?", (rid,))

    def restore(self, rid):
        if not self.enabled:
            return None
        remote = self.request(f"/{rid}")
        snapshot = remote["snapshot"]
        if snapshot.get("deleted_at"):
            return None
        self.accept_remote(remote)
        with self.connect() as c:
            return c.execute("SELECT * FROM records WHERE id=?", (rid,)).fetchone()

    def accept_remote(self, remote):
        snapshot = remote["snapshot"]
        values = {k: v for k, v in snapshot.items() if k in WIRE_FIELDS}
        for key in JSON_FIELDS:
            if key in values and values[key] is not None:
                values[key] = json.dumps(values[key], ensure_ascii=False)
        values.update(sync_state="synced", synced_revision=remote["revision"],
                      publication_status=remote["publication_status"], document_ref=remote.get("document_ref"),
                      last_accessed_at=time.time())
        with self.connect() as c:
            # A list refresh or cache miss must never replace a local unsent edit.
            local = c.execute("SELECT revision,synced_revision FROM records WHERE id=?", (snapshot["id"],)).fetchone()
            if local and (local["revision"] != local["synced_revision"] or local["revision"] > remote["revision"]):
                return
            keys = list(values)
            c.execute(f"INSERT INTO records({','.join(keys)}) VALUES({','.join('?' for _ in keys)}) "
                      f"ON CONFLICT(id) DO UPDATE SET {','.join(k+'=excluded.'+k for k in keys if k != 'id')}",
                      list(values.values()))

    def download(self, rid, destination, digest=None):
        audio = self.request(f"/{rid}/audio", raw=True)
        if digest and hashlib.sha256(audio).hexdigest() != digest:
            raise ValueError("Archived audio checksum mismatch")
        temporary = destination.with_name(destination.name + ".download")
        temporary.write_bytes(audio)
        temporary.replace(destination)

    def cache_status(self):
        """Read-only capacity report; this integration never automatically deletes cached data."""
        size = sum(p.stat().st_size for p in self.audio_dir.iterdir() if p.is_file())
        with self.connect() as c:
            count = c.execute("SELECT COUNT(*) FROM records").fetchone()[0]
            pending = c.execute("SELECT COUNT(*) FROM sync_outbox").fetchone()[0]
        return {"audio_bytes": size, "max_audio_bytes": self.max_audio_bytes,
                "records": count, "max_records": self.max_records, "pending_sync": pending,
                "over_capacity": size > self.max_audio_bytes or count > self.max_records}
