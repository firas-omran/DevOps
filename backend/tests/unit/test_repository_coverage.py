from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from backend.app.api.schemas.detection import DetectionResult, DetectionRunOut
from backend.app.api.schemas.detector import DetectorConfigCreate, DetectorConfigOut, DetectorConfigUpdate, DetectorStatus
from backend.app.api.schemas.generator import GeneratorJobCreate, GeneratorJobOut
from backend.app.api.schemas.traffic import TrafficPoint
from backend.app.core.postgres import PostgresUnavailableError, is_postgres_available, is_postgres_configured
from backend.app.repositories.detection_repository import DetectionRepository
from backend.app.repositories.detector_repository import DetectorRepository
from backend.app.repositories.generator_repository import GeneratorRepository
from backend.app.repositories.traffic_repository import TrafficRepository


class FakeCursor:
    def __init__(self, row=None, rows=None, rowcount=1):
        self.row = row
        self.rows = rows or []
        self.rowcount = rowcount
        self.executed = []
        self.params = None

    def execute(self, query, params=None):
        self.executed.append(query)
        self.params = params

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeConnection:
    def __init__(self, cursor: FakeCursor):
        self.cursor_obj = cursor
        self.committed = False
        self.closed = False

    def cursor(self, row_factory=None):
        return self.cursor_obj

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def fake_connection_context(cursor: FakeCursor):
    @contextmanager
    def _fake_conn() -> Iterator[FakeConnection]:
        yield FakeConnection(cursor)

    return _fake_conn


def test_is_postgres_configured_and_unavailable(monkeypatch):
    monkeypatch.setattr('backend.app.core.postgres.settings.postgres_dsn', 'sqlite://localhost')
    assert not is_postgres_configured()
    assert not is_postgres_available()


def test_postgres_available_when_query_succeeds(monkeypatch):
    cursor = FakeCursor()
    fake_conn = FakeConnection(cursor)

    @contextmanager
    def fake_get_conn():
        yield fake_conn

    monkeypatch.setattr('backend.app.core.postgres.settings.postgres_dsn', 'postgresql://test')
    monkeypatch.setattr('backend.app.core.postgres.get_postgres_connection', fake_get_conn)
    assert is_postgres_available()


def test_postgres_unavailable_when_connection_raises(monkeypatch):
    @contextmanager
    def raise_conn():
        raise RuntimeError('connection failure')
        yield

    monkeypatch.setattr('backend.app.core.postgres.settings.postgres_dsn', 'postgresql://test')
    monkeypatch.setattr('backend.app.core.postgres.get_postgres_connection', raise_conn)
    assert not is_postgres_available()


def test_detector_repository_create_and_read(monkeypatch):
    created_row = {
        'id': 'd1',
        'name': 'test',
        'description': 'desc',
        'status': 'active',
        'sensitivity': 0.5,
        'window_size_seconds': 60,
        'window_step_seconds': 10,
        'features': ['f1'],
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc),
    }
    cursor = FakeCursor(row=created_row)
    fake_get_conn = fake_connection_context(cursor)

    monkeypatch.setattr('backend.app.repositories.detector_repository.ensure_postgres_schema', lambda: None)
    monkeypatch.setattr('backend.app.repositories.detector_repository.get_postgres_connection', fake_get_conn)

    repo = DetectorRepository()
    result = repo.create(DetectorConfigCreate(
        name='test',
        description='desc',
        sensitivity=0.5,
        window_size_seconds=60,
        window_step_seconds=10,
        features=['f1'],
    ))

    assert result.name == 'test'
    assert cursor.params[1] == 'test'
    assert cursor.rowcount == 1

    cursor.row = created_row
    cursor.rows = [created_row]
    result_list = repo.list()
    assert len(result_list) == 1
    assert result_list[0].name == 'test'

    cursor.row = created_row
    assert repo.get('d1').id == 'd1'


def test_detector_repository_update_and_delete(monkeypatch):
    updated_row = {
        'id': 'd1',
        'name': 'test',
        'description': 'updated',
        'status': 'draft',
        'sensitivity': 0.5,
        'window_size_seconds': 60,
        'window_step_seconds': 10,
        'features': ['f1'],
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc),
    }
    cursor = FakeCursor(row=updated_row)
    fake_get_conn = fake_connection_context(cursor)

    monkeypatch.setattr('backend.app.repositories.detector_repository.ensure_postgres_schema', lambda: None)
    monkeypatch.setattr('backend.app.repositories.detector_repository.get_postgres_connection', fake_get_conn)

    repo = DetectorRepository()
    payload = DetectorConfigUpdate(description='updated')
    result = repo.update('d1', payload)
    assert result is not None
    assert result.description == 'updated'
    assert 'UPDATE detector_profiles SET' in cursor.executed[0]
    assert cursor.params[-1] == 'd1'

    cursor.rowcount = 1
    deleted = repo.delete('d1')
    assert deleted is True

    cursor.rowcount = 0
    assert repo.delete('d1') is False


def test_generator_repository_create_get_and_update(monkeypatch):
    now = datetime.now(timezone.utc)
    created_job = {
        'id': 'j1',
        'profile_name': 'profile',
        'status': 'running',
        'batch_size': 10,
        'interval_ms': 500,
        'duration_seconds': 10,
        'sent_batches': 0,
        'total_batches': 20,
        'last_error': None,
        'started_at': now,
        'finished_at': None,
    }
    cursor = FakeCursor(row=created_job)
    fake_get_conn = fake_connection_context(cursor)

    monkeypatch.setattr('backend.app.repositories.generator_repository.ensure_postgres_schema', lambda: None)
    monkeypatch.setattr('backend.app.repositories.generator_repository.get_postgres_connection', fake_get_conn)

    repo = GeneratorRepository()
    job = repo.create(GeneratorJobCreate(
        profile_name='profile',
        batch_size=10,
        interval_ms=500,
        duration_seconds=10,
    ))
    assert job.profile_name == 'profile'
    assert job.total_batches == 20

    cursor.row = created_job
    assert repo.get('j1').id == 'j1'

    cursor.row = created_job
    updated = repo.update('j1', {'status': 'stopped'})
    assert updated is not None
    assert updated.id == 'j1'
    assert updated.status == 'running'

    cursor.row = None
    assert repo.update('j1', {}) is None


def test_detection_repository_save_and_query(monkeypatch):
    now = datetime.now(timezone.utc)
    run_data = {
        'id': 'r1',
        'detector_config_id': 'd1',
        'window_start': now,
        'window_end': now,
        'initiated_by': 'user',
        'status': 'completed',
        'summary': {'count': 1},
        'created_at': now,
        'completed_at': now,
    }
    result_data = {
        'id': 'res1',
        'detection_run_id': 'r1',
        'timestamp': now,
        'anomaly_score': 0.9,
        'is_anomaly': True,
        'metrics_snapshot': {'m1': 1.0},
        'explanation': 'test',
    }
    cursor = FakeCursor()
    fake_get_conn = fake_connection_context(cursor)

    monkeypatch.setattr('backend.app.repositories.detection_repository.ensure_postgres_schema', lambda: None)
    monkeypatch.setattr('backend.app.repositories.detection_repository.get_postgres_connection', fake_get_conn)

    repo = DetectionRepository()
    run = DetectionRunOut(**run_data)
    saved_run = repo.save_run(run)
    assert saved_run.id == 'r1'

    cursor.row = run_data
    assert repo.get_run('r1').id == 'r1'

    cursor.rows = [run_data]
    runs = repo.list_runs('d1')
    assert len(runs) == 1

    cursor.rows = [result_data]
    latest = repo.latest_results('d1', limit=1)
    assert len(latest) == 1

    cursor.row = result_data
    assert repo.save_result(DetectionResult(**result_data)).id == 'res1'
    cursor.rows = [result_data]
    results = repo.get_results('r1')
    assert len(results) == 1


def test_traffic_repository_ingest_and_latest(monkeypatch):
    class FakePoint:
        def __init__(self):
            self.fields = {}
            self.tags = {}

        def time(self, timestamp):
            self.timestamp = timestamp
            return self

        def tag(self, key, value):
            self.tags[key] = value
            return self

        def field(self, key, value):
            self.fields[key] = value
            return self

    class FakeWriteAPI:
        def __init__(self):
            self.records = []

        def write(self, bucket, org, record):
            self.records.extend(record)

    class FakeQueryAPI:
        def __init__(self, tables):
            self.tables = tables

        def query(self, query, org=None):
            return self.tables

    class FakeClient:
        def __init__(self, tables):
            self._tables = tables
            self.write_api_obj = FakeWriteAPI()
            self.query_api_obj = FakeQueryAPI(tables)

        def write_api(self):
            return self.write_api_obj

        def query_api(self):
            return self.query_api_obj

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeRecord:
        def __init__(self, time, values):
            self._time = time
            self.values = values

        def get_time(self):
            return self._time

    class FakeTable:
        def __init__(self, records):
            self.records = records

    point = TrafficPoint(
        timestamp=datetime.now(timezone.utc),
        source_id='source-1',
        metrics={'bytes': 100},
        tags={'region': 'eu'},
    )

    fake_client = FakeClient([FakeTable([FakeRecord(point.timestamp, {
        'source_id': 'source-1',
        '_field': 'bytes',
        '_value': 100,
        'region': 'eu',
    })])])

    monkeypatch.setattr('backend.app.repositories.traffic_repository.get_influx_client', lambda: fake_client)
    repo = TrafficRepository()

    count = repo.ingest([point])
    assert count == 1

    latest = repo.latest(limit=1)
    assert latest[0].source_id == 'source-1'
    assert latest[0].metrics['bytes'] == 100.0
