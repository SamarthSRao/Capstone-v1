from locust import HttpUser, task, between


class OrganicUser(HttpUser):
    wait_time = between(3, 5)
    host = "http://localhost:8081"

    @task(3)
    def browse(self):
        self.client.get("/api/products")

    @task(1)
    def checkout(self):
        self.client.post(
            "/api/checkout",
            json={
                "product_id": 1,
                "quantity": 1,
                "session_id": "locust-organic",
            },
            headers={"Content-Type": "application/json"},
        )