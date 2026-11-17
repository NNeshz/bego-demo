from typing import Any

import pytest
from fastapi.testclient import TestClient

from retorno_ml.api import create_app
from retorno_ml.data import InMemoryRepository, ModelRecord

TOKEN = "s3cret-token"


@pytest.fixture
def repo(fake_api: Any) -> InMemoryRepository:
    from test_train import simulated_decisions

    return InMemoryRepository(simulated_decisions(fake_api, 1500))


@pytest.fixture
def client(repo: InMemoryRepository) -> TestClient:
    return TestClient(create_app(lambda: repo, TOKEN))


def test_health_before_any_model(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "database": True, "model": None}
    assert client.get("/weights").status_code == 404
    assert client.get("/model").status_code == 404


def test_training_requires_the_admin_token(client: TestClient) -> None:
    assert client.post("/train").status_code == 401
    assert client.post("/train", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_training_disabled_without_a_configured_token(repo: InMemoryRepository) -> None:
    response = TestClient(create_app(lambda: repo, None)).post("/train", headers={"Authorization": "Bearer x"})
    assert response.status_code == 503


def test_train_then_serve_personal_and_global_weights(client: TestClient) -> None:
    trained = client.post("/train", headers={"Authorization": f"Bearer {TOKEN}"})
    assert trained.status_code == 200
    body = trained.json()
    assert body["published"] is True
    assert body["truckers"] > 0
    assert {d["persona"] for d in body["demoTruckers"]} == {"casa", "espera", "dinero"}

    truck_id = body["demoTruckers"][0]["truckId"]
    personal = client.get("/weights", params={"truck_id": truck_id}).json()
    assert personal["scope"] == "trucker"
    assert personal["weights"] == body["demoTruckers"][0]["weights"]
    assert client.get("/weights", params={"truck_id": "nobody"}).json()["scope"] == "global"
    assert client.get("/model").json()["version"] == body["version"]


def test_unpublished_models_are_reported_but_not_served() -> None:
    repo = InMemoryRepository()
    repo.save_model(ModelRecord(weights={"home": 1.0}, coefficients={}, metrics={}, trained_on=10, published=False))
    client = TestClient(create_app(lambda: repo, TOKEN))
    assert client.get("/weights").status_code == 404
    assert client.get("/model").json()["published"] is False


def test_insufficient_data_is_a_clear_422() -> None:
    client = TestClient(create_app(lambda: InMemoryRepository(), TOKEN))
    response = client.post("/train", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 422
    assert "at least" in response.json()["detail"]


def test_without_database_the_service_degrades_gracefully() -> None:
    client = TestClient(create_app(lambda: None, TOKEN))
    assert client.get("/health").json()["database"] is False
    assert client.get("/weights").status_code == 503
