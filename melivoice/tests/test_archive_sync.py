import copy
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from archive_sync import ArchiveSync, initialize, queue_record


class MemoryArchive(ArchiveSync):
    def __init__(self, connect, audio_dir):
        super().__init__(connect, audio_dir, "http://synthetic.invalid")
        self.records = {}
        self.assets = {}
        self.failure = None
        self.before_ack = None

    def request(self, path, method="GET", payload=None, raw=False, content_type=None):
        if self.failure:
            raise urllib.error.HTTPError("http://synthetic.invalid", self.failure, "synthetic", None, None)
        rid = path.split("/")[1]
        if method == "PUT" and "/assets/" in path:
            self.assets[rid] = bytes(payload)
            return {"sha256": path.split("/")[-1]}
        if method == "PUT":
            result = dict(copy.deepcopy(payload), publication_status="deleted" if payload["snapshot"].get("deleted_at") else "temporary", document_ref=None)
            self.records[rid] = result
            if self.before_ack:
                self.before_ack()
                self.before_ack = None
            return result
        if path.endswith("/audio"):
            return self.assets[rid]
        return self.records[rid]


class ArchiveSyncTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.audio = self.root / "audio"
        self.audio.mkdir()
        self.database = self.root / "cache.db"
        with self.connect() as c:
            c.execute("CREATE TABLE records(id TEXT PRIMARY KEY,created_at TEXT,audio_file TEXT,file_name TEXT,status TEXT,emr TEXT)")
            initialize(c)
            c.execute("INSERT INTO records(id,created_at,audio_file,status,emr) VALUES(?,?,?,?,?)",
                      ("fixture", "2026-10-25T00:00:00Z", "fixture.wav", "draft", json.dumps({"ket_cuc": "synthetic"})))
            queue_record(c, "fixture")
        self.original = b"synthetic fixture audio"
        (self.audio / "fixture.wav").write_bytes(self.original)
        self.archive = MemoryArchive(self.connect, self.audio)

    def tearDown(self):
        self.directory.cleanup()

    def connect(self):
        c = sqlite3.connect(self.database)
        c.row_factory = sqlite3.Row
        return c

    def record(self):
        with self.connect() as c:
            return c.execute("SELECT * FROM records WHERE id='fixture'").fetchone()

    def test_sync_preserves_missing_patient_id_and_acknowledges_exact_revision(self):
        self.assertTrue(self.archive.sync_one("fixture"))
        self.assertEqual(self.record()["sync_state"], "synced")
        self.assertEqual(self.archive.records["fixture"]["snapshot"]["patient_id"], "")
        self.assertEqual(self.archive.assets["fixture"], self.original)
        self.assertEqual(self.archive.records["fixture"]["snapshot"]["audio_sha256"], hashlib.sha256(self.original).hexdigest())

    def test_older_ack_never_discards_edit_made_during_network_request(self):
        def edit():
            with self.connect() as c:
                c.execute("UPDATE records SET emr=? WHERE id='fixture'", (json.dumps({"ket_cuc": "new revision"}),))
                queue_record(c, "fixture")
        self.archive.before_ack = edit
        self.assertTrue(self.archive.sync_one("fixture"))
        self.assertEqual(self.record()["revision"], 2)
        self.assertEqual(self.record()["synced_revision"], 0)
        with self.connect() as c:
            job = c.execute("SELECT * FROM sync_outbox").fetchone()
            self.assertEqual(job["revision"], 2)
            self.assertEqual(json.loads(job["snapshot"])["emr"]["ket_cuc"], "new revision")
        self.assertTrue(self.archive.sync_one("fixture"))
        self.assertEqual(self.record()["synced_revision"], 2)

    def test_network_failure_and_conflict_retain_local_data_and_outbox(self):
        for status in (503, 409):
            self.archive.failure = status
            self.assertFalse(self.archive.sync_one("fixture"))
            self.assertTrue((self.audio / "fixture.wav").is_file())
            self.assertEqual(self.record()["revision"], 1)
            with self.connect() as c:
                self.assertIsNotNone(c.execute("SELECT * FROM sync_outbox").fetchone())
        self.assertEqual(self.record()["sync_state"], "conflict")

    def test_restore_record_and_audio_into_a_fresh_cache(self):
        self.assertTrue(self.archive.sync_one("fixture"))
        # Simulate a replacement cache; the acknowledged original cache is untouched.
        replacement = self.root / "replacement.db"
        def connect_replacement():
            c = sqlite3.connect(replacement)
            c.row_factory = sqlite3.Row
            return c
        with connect_replacement() as c:
            c.execute("CREATE TABLE records(id TEXT PRIMARY KEY,created_at TEXT,audio_file TEXT,file_name TEXT,status TEXT,emr TEXT)")
            initialize(c)
        recovered_audio = self.root / "recovered-audio"
        recovered_audio.mkdir()
        recovered = MemoryArchive(connect_replacement, recovered_audio)
        recovered.records, recovered.assets = self.archive.records, self.archive.assets
        record = recovered.restore("fixture")
        self.assertEqual(json.loads(record["emr"])["ket_cuc"], "synthetic")
        recovered.download("fixture", recovered_audio / "fixture.wav", record["audio_sha256"])
        self.assertEqual((recovered_audio / "fixture.wav").read_bytes(), self.original)

    def test_remote_refresh_does_not_replace_unsent_local_changes(self):
        self.archive.sync_one("fixture")
        with self.connect() as c:
            c.execute("UPDATE records SET patient_id='PHYSICIAN-ENTERED' WHERE id='fixture'")
            queue_record(c, "fixture")
        self.archive.accept_remote(self.archive.records["fixture"])
        self.assertEqual(self.record()["patient_id"], "PHYSICIAN-ENTERED")

    def test_over_capacity_only_reports_and_never_removes_data(self):
        self.archive.max_audio_bytes = 1
        self.archive.max_records = 0
        self.assertTrue(self.archive.cache_status()["over_capacity"])
        self.assertTrue((self.audio / "fixture.wav").is_file())
        self.assertIsNotNone(self.record())

    def test_explicit_draft_deletion_is_acked_before_hiding_and_cancels_pending_sync(self):
        self.archive.sync_one("fixture")
        with self.connect() as c:
            queue_record(c, "fixture")
        self.archive.delete_draft("fixture", "fixture.wav")
        self.assertTrue(self.record()["deleted_at"])
        self.assertEqual(self.record()["synced_revision"], self.record()["revision"])
        self.assertIsNone(self.archive.restore("fixture"))
        with self.connect() as c:
            self.assertIsNone(c.execute("SELECT * FROM sync_outbox").fetchone())
        self.assertEqual(self.archive.assets["fixture"], self.original)
        self.assertTrue((self.audio / "fixture.wav").is_file())

    def test_failed_or_conflicting_deletion_retains_record_and_pending_edits(self):
        for code in (503, 409):
            self.archive.failure = code
            with self.assertRaises(urllib.error.HTTPError):
                self.archive.delete_draft("fixture", "fixture.wav")
            self.assertIsNone(self.record()["deleted_at"])
            self.assertEqual(self.record()["revision"], 1)
            with self.connect() as c:
                self.assertIsNotNone(c.execute("SELECT * FROM sync_outbox").fetchone())

    def test_deletion_retry_after_lost_ack_accepts_archived_tombstone(self):
        def lose_ack():
            raise urllib.error.HTTPError("http://synthetic.invalid", 504, "synthetic", None, None)
        self.archive.before_ack = lose_ack
        with self.assertRaises(urllib.error.HTTPError):
            self.archive.delete_draft("fixture", "fixture.wav")
        self.assertIsNone(self.record()["deleted_at"])
        archived = self.archive.records["fixture"]
        put = self.archive.request
        def conflict_on_new_stamp(path, method="GET", payload=None, **kwargs):
            if method == "PUT":
                raise urllib.error.HTTPError("http://synthetic.invalid", 409, "synthetic", None, None)
            return put(path, method, payload, **kwargs)
        self.archive.request = conflict_on_new_stamp
        self.archive.delete_draft("fixture", "fixture.wav")
        self.assertEqual(self.record()["deleted_at"], archived["snapshot"]["deleted_at"])
        self.assertEqual(self.record()["synced_revision"], archived["revision"])

    def test_conflict_without_archived_tombstone_is_not_treated_as_deleted(self):
        self.assertTrue(self.archive.sync_one("fixture"))
        put = self.archive.request
        def conflict(path, method="GET", payload=None, **kwargs):
            if method == "PUT":
                raise urllib.error.HTTPError("http://synthetic.invalid", 409, "synthetic", None, None)
            return put(path, method, payload, **kwargs)
        self.archive.request = conflict
        with self.assertRaises(urllib.error.HTTPError):
            self.archive.delete_draft("fixture", "fixture.wav")
        self.assertIsNone(self.record()["deleted_at"])

    def test_remote_publication_status_is_persisted_without_overwriting_unsent_edits(self):
        self.assertTrue(self.archive.sync_one("fixture"))
        remote = dict(copy.deepcopy(self.archive.records["fixture"]), publication_status="published",
                      document_ref="DocumentReference/synthetic")
        self.archive.accept_remote(remote)
        self.assertEqual(self.record()["publication_status"], "published")
        self.assertEqual(self.record()["document_ref"], "DocumentReference/synthetic")
        with self.connect() as c:
            c.execute("UPDATE records SET emr=? WHERE id='fixture'", (json.dumps({"ket_cuc": "unsent"}),))
            queue_record(c, "fixture")
        self.archive.accept_remote(dict(remote, publication_status="retry"))
        self.assertEqual(json.loads(self.record()["emr"])["ket_cuc"], "unsent")
        self.assertEqual(self.record()["publication_status"], "published")

    def test_confirmed_record_and_incorrect_filename_cannot_be_deleted(self):
        with self.assertRaises(ValueError):
            self.archive.delete_draft("fixture", "incorrect.wav")
        with self.connect() as c:
            c.execute("UPDATE records SET status='confirmed' WHERE id='fixture'")
        with self.assertRaises(PermissionError):
            self.archive.delete_draft("fixture", "fixture.wav")
        self.assertIsNone(self.record()["deleted_at"])


if __name__ == "__main__":
    unittest.main()
