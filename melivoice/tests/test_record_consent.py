"""Run in the application image (FastAPI/OpenAI dependencies required)."""
import importlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))


class RecordConsentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        os.environ["DATA_DIR"] = cls.directory.name
        os.environ["MELIDATA_URL"] = ""
        cls.app = importlib.import_module("main")

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def setUp(self):
        with self.app.db() as c:
            c.execute("DELETE FROM sync_outbox")
            c.execute("DELETE FROM records")
            c.execute("INSERT INTO records(id,created_at,audio_file,status,patient_id,patient_id_temporary) VALUES(?,?,?,?,?,?)",
                      ("consent-fixture", "2026-10-25T00:00:00Z", "fixture.wav", "processed", "", 0))

    def test_confirm_without_patient_id_is_explicit_consent_but_remains_incomplete(self):
        result = self.app.patch_record("consent-fixture", self.app.Patch(status="confirmed", emr={"ket_cuc": "synthetic"}))
        self.assertTrue(result["melidata_consent"])
        self.assertTrue(result["consented_at"])
        self.assertTrue(result["data_incomplete"])
        self.assertEqual(result["patient_id"], "")
        self.assertFalse(result["melidata_saved"])

    def test_draft_does_not_grant_consent_or_generate_patient_id(self):
        result = self.app.patch_record("consent-fixture", self.app.Patch(status="draft", emr={"ket_cuc": "synthetic"}))
        self.assertFalse(result["melidata_consent"])
        self.assertEqual(result["patient_id"], "")

    def test_physician_can_replace_trial_patient_id_and_clear_temporary_flag(self):
        with self.app.db() as c:
            c.execute("UPDATE records SET patient_id='TMP-FIXTURE',patient_id_temporary=1 WHERE id='consent-fixture'")
        result = self.app.patch_record("consent-fixture", self.app.Patch(patient_id="DOCTOR-001"))
        self.assertEqual(result["patient_id"], "DOCTOR-001")
        self.assertFalse(result["patient_id_temporary"])
        self.assertFalse(result["data_incomplete"])

    def test_upload_api_preserves_blank_patient_id_and_queues_original_audio(self):
        with patch.object(self.app.gpt_audio, "duration", return_value=1.25), \
                patch.object(self.app, "process_record"), TestClient(self.app.app) as client:
            response = client.post("/api/records", files={"file": ("synthetic.wav", b"synthetic audio bytes", "audio/wav")})
        self.assertEqual(response.status_code, 200)
        value = response.json()
        self.assertEqual(value["patient_id"], "")
        self.assertTrue(value["data_incomplete"])
        self.assertFalse(value["patient_id_temporary"])
        self.assertTrue((self.app.AUDIO_DIR / value["audio_file"]).is_file())
        with self.app.db() as c:
            self.assertIsNotNone(c.execute("SELECT * FROM sync_outbox WHERE record_id=?", (value["id"],)).fetchone())

    def archive_for_deletion(self):
        with self.app.db() as c:
            self.app.archive_sync.queue_record(c, "consent-fixture")
        return self.app.archive_sync.ArchiveSync(self.app.db, self.app.AUDIO_DIR, "http://synthetic.invalid")

    def test_processed_record_can_be_deleted_with_melidata_enabled(self):
        archive = self.archive_for_deletion()
        receipt = {}
        def acknowledge(path, method="GET", payload=None, **kwargs):
            if method == "PUT":
                receipt.update(payload, publication_status="deleted", document_ref=None)
            return receipt
        with patch.object(self.app, "archive", archive), patch.object(archive, "request", side_effect=acknowledge), \
                patch.object(archive, "start"), \
                TestClient(self.app.app) as client:
            response = client.delete("/api/records/consent-fixture?confirm=fixture.wav")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(client.get("/api/records/consent-fixture").status_code, 404)

    def test_saved_emr_cannot_be_deleted_even_before_fhir_publication(self):
        archive = self.archive_for_deletion()
        with self.app.db() as c:
            c.execute("UPDATE records SET status='confirmed',melidata_consent=1 WHERE id='consent-fixture'")
        with patch.object(self.app, "archive", archive), patch.object(archive, "request") as remote, \
                patch.object(archive, "start"), \
                TestClient(self.app.app) as client:
            self.assertEqual(client.delete("/api/records/consent-fixture?confirm=fixture.wav").status_code, 409)
            remote.assert_not_called()

    def test_deletion_outage_does_not_report_success_or_hide_record(self):
        archive = self.archive_for_deletion()
        failure = urllib.error.HTTPError("http://synthetic.invalid", 503, "synthetic", None, None)
        with patch.object(self.app, "archive", archive), patch.object(archive, "request", side_effect=failure), \
                patch.object(archive, "start"), \
                TestClient(self.app.app) as client:
            self.assertEqual(client.delete("/api/records/consent-fixture?confirm=fixture.wav").status_code, 503)
        with self.app.db() as c:
            self.assertIsNone(c.execute("SELECT deleted_at FROM records WHERE id='consent-fixture'").fetchone()[0])

    def test_history_list_persists_central_publication_status_for_offline_use(self):
        archive = self.archive_for_deletion()
        with self.app.db() as c:
            c.execute("UPDATE records SET synced_revision=revision,sync_state='synced',publication_status='pending' "
                      "WHERE id='consent-fixture'")
            local = self.app.archive_sync.wire_record(
                c.execute("SELECT * FROM records WHERE id='consent-fixture'").fetchone())
        remote = {"records": [{"snapshot": local, "revision": local["revision"], "publication_status": "published",
                               "document_ref": "DocumentReference/synthetic"}], "next_offset": None}
        with patch.object(self.app, "archive", archive), patch.object(archive, "request", return_value=remote), \
                patch.object(archive, "start"), \
                TestClient(self.app.app) as client:
            self.assertEqual(client.get("/api/records").json()[0]["publication_status"], "published")
        with self.app.db() as c:
            self.assertEqual(c.execute("SELECT publication_status,document_ref FROM records WHERE id='consent-fixture'")
                             .fetchone()[:], ("published", "DocumentReference/synthetic"))
