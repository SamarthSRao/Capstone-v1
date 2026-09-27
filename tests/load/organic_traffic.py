import random
from locust import HttpUser, task, between


class OrganicUser(HttpUser):
    wait_time = between(3, 5)
    host = "http://localhost:8080"

    @task(3)
    def browse(self):
        self.client.get("/api/products")

    @task(1)
    def checkout(self):
        product_id = random.randint(1, 12)
        self.client.post(
            "/api/checkout",
            json={
                "product_id": product_id,
                "quantity": 1,
                "session_id": f"locust-organic-{product_id}",
            },
            headers={"Content-Type": "application/json"},
        )
