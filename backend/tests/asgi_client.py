"""Small HTTP/ASGI test adapter using only the existing backend dependencies."""
import asyncio
import json
from urllib.parse import urlsplit


class Response:
    def __init__(self, status: int, body: bytes):
        self.status_code = status
        self.text = body.decode("utf-8")

    def json(self):
        return json.loads(self.text)


class ASGIClient:
    def __init__(self, app):
        self.app = app

    def request(self, method, url, json=None):
        async def run():
            parsed = urlsplit(url)
            body = b"" if json is None else __import__("json").dumps(json).encode("utf-8")
            messages = []
            delivered = False
            async def receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": body, "more_body": False}
                await asyncio.Event().wait()
            async def send(message):
                messages.append(message)
            await self.app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                "method": method, "scheme": "http", "path": parsed.path, "raw_path": parsed.path.encode(),
                "query_string": parsed.query.encode(), "root_path": "", "headers": [(b"content-type", b"application/json")],
                "client": ("127.0.0.1", 1234), "server": ("127.0.0.1", 8000)}, receive, send)
            status = next(message["status"] for message in messages if message["type"] == "http.response.start")
            return Response(status, b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body"))
        return asyncio.run(run())

    def get(self, url):
        return self.request("GET", url)

    def post(self, url, json):
        return self.request("POST", url, json)

    def patch(self, url, json):
        return self.request("PATCH", url, json)
