import json
import hashlib
import base64
from cryptography.fernet import Fernet

class CiphraEncrypter:
    def __init__(self, master_key: str):
        raw = hashlib.sha256(master_key.encode()).digest()
        self.fernet = Fernet(base64.urlsafe_b64encode(raw))

    def encrypt(self, data: dict) -> bytes:
        return self.fernet.encrypt(json.dumps(data).encode())

    def decrypt(self, data: bytes) -> dict:
        try:
            return json.loads(self.fernet.decrypt(data).decode())
        except Exception:
            try:
                return json.loads(data.decode())
            except Exception:
                return {}
