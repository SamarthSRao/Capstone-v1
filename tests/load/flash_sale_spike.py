from locust import HttpUser, task, constant


class FlashSaleUser(HttpUser):
    wait_time = constant(0)
    host = "http://localhost:8081"

    @task
    def checkout(self):
        self.client.post(
            "/api/checkout",
            json={
                "product_id": 1,
                "quantity": 1,
                "session_id": "locust-spike",
            },
            headers={"Content-Type": "application/json"},
        )