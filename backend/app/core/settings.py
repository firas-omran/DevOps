from __future__ import annotations

import os
from pydantic import BaseModel


class Settings(BaseModel):
    influx_url: str = os.getenv('INFLUX_URL', 'http://localhost:8086')
    influx_token: str = os.getenv('INFLUX_TOKEN', 'dev-token')
    influx_org: str = os.getenv('INFLUX_ORG', 'devops')
    influx_bucket: str = os.getenv('INFLUX_BUCKET', 'traffic')

    ml_service_url: str = os.getenv('ML_SERVICE_URL', 'http://localhost:8001')

    postgres_dsn: str = os.getenv('POSTGRES_DSN', '')


settings = Settings()
