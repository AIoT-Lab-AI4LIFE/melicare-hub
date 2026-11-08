#!/usr/bin/env python3
"""ONE-OFF trial migration. Not imported or called by the application.

Run inside the MeliVoice container with --apply after deploying the archive API.
Only the existing fixture batch is seeded. A mismatched row count aborts the run.
"""
import argparse
import json
import shutil
import sqlite3
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import main  # noqa: E402
from archive_sync import queue_record  # noqa: E402


def fhir(method, path, payload=None):
    data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    headers = main.archive._headers()
    headers["Content-Type"] = "application/fhir+json"
    request = urllib.request.Request(main.archive.base + "/fhir/r4/" + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-records", type=int, default=27)
    options = parser.parse_args()
    with main.db() as connection:
        records = connection.execute("SELECT * FROM records ORDER BY created_at,id").fetchall()
    if len(records) != options.expected_records:
        raise SystemExit("Record count changed; review the fixture batch before seeding")
    if not main.archive.enabled:
        raise SystemExit("MELIDATA_URL must point to the authorized trial archive")
    if not options.apply:
        print(json.dumps({"dry_run": True, "records": len(records), "tenant": main.archive.tenant}))
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = main.DATA / "backups" / ("before-trial-seed-" + stamp)
    backup.mkdir(parents=True, exist_ok=False)
    with main.db() as source, sqlite3.connect(backup / "meli_voice.db") as target:
        source.backup(target)
    shutil.copytree(main.AUDIO_DIR, backup / "audio")
    failures = 0
    for number, record in enumerate(records, 1):
        if record["is_test_data"] and record["patient_id"]:
            continue
        patient_id = record["patient_id"] or "TMP-MV-" + record["id"].upper()
        identifier = {"system": "https://meliq.ai/id/patient", "value": patient_id}
        matches = fhir("GET", "Patient?" + urllib.parse.urlencode({"identifier": identifier["system"] + "|" + patient_id}))
        patient_name = record["patient_name"] or f"Bệnh nhân thử nghiệm {number:02d}"
        if matches["total"] == 0:
            fhir("POST", "Patient", {"resourceType": "Patient", "identifier": [identifier],
                 "name": [{"text": patient_name}], "meta": {"tag": [{
                     "system": "https://meliq.ai/CodeSystem/data-origin", "code": "synthetic-trial",
                     "display": "Dữ liệu thử nghiệm giả lập"}]}})
        elif matches["total"] != 1:
            raise SystemExit("Ambiguous trial Patient identifier; migration stopped")
        fields = [key for key in ("patient_id", "patient_name", "doctor", "department") if not record[key]]
        consent = record["status"] == "confirmed" and bool(record["emr"])
        with main.db() as connection:
            connection.execute("UPDATE records SET patient_id=?,patient_id_temporary=?,patient_name=?,doctor=?,"
                               "department=?,is_test_data=1,simulated_fields=?,melidata_consent=?,consented_at=? WHERE id=?",
                               (patient_id, int(not bool(record["patient_id"])), patient_name,
                                record["doctor"] or "BS. Thử nghiệm", record["department"] or "Khoa thử nghiệm",
                                json.dumps(fields), int(consent), datetime.now(timezone.utc).isoformat() if consent else None,
                                record["id"]))
            queue_record(connection, record["id"])
        if not main.archive.sync_one(record["id"]):
            failures += 1
    print(json.dumps({"records": len(records), "pending_retry": failures, "backup": str(backup), "tenant": main.archive.tenant}))


if __name__ == "__main__":
    run()
