import random
from locust import HttpUser, task, constant


class FlashSaleUser(HttpUser):
    wait_time = constant(0)
    host = "http://localhost:8080"

    @task
    def checkout(self):
        # Rotate across all 12 products so stock is not exhausted on one SKU
        product_id = random.randint(1, 12)
        self.client.post(
            "/api/checkout",
            json={
                "product_id": product_id,
                "quantity": 1,
                "session_id": f"locust-spike-{product_id}",
            },
            headers={"Content-Type": "application/json"},
        )
