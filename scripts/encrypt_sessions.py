import os, sys
# Permite importar los módulos de backend/ al correr: python scripts/<script>.py (desde la raíz)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
import json, os
from main import encrypt_data

if os.path.exists("sessions.json"):
    with open("sessions.json", "rb") as f:
        try:
            data = json.loads(f.read().decode())
            with open("sessions.json", "wb") as fw:
                fw.write(encrypt_data(data))
            print("sessions.json encrypted.")
        except Exception as e:
            print("Already encrypted or error:", e)
