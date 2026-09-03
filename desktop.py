import threading
import subprocess
import time
import webview
import sys
import urllib.request
import os
from dotenv import load_dotenv

# Cargar .env desde la carpeta del proyecto
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

def start_server():
    print("🚀 Starting uvicorn server...")
    env = os.environ.copy()
    
    # Cargar .env manualmente y pasarlo al subproceso
    env_file = os.path.join(BASE_DIR, ".env")
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    env[key.strip()] = val.strip()
    
    subprocess.Popen([
        os.path.join(BASE_DIR, "venv/bin/uvicorn"),
        "main:app",
        "--host", "127.0.0.1",
        "--port", "8000"
    ], env=env)

def wait_for_server(url, timeout=15):
    """Espera hasta que el servidor responda, con timeout."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except:
            time.sleep(0.3)
    return False

if __name__ == "__main__":
    print("🔥 Ciphra Desktop Booting...")

    t = threading.Thread(target=start_server)
    t.daemon = True
    t.start()

    print("⏳ Waiting for server...")
    ready = wait_for_server("http://127.0.0.1:8000")

    if not ready:
        print("❌ Server did not start in time.")
        sys.exit(1)

    url = "http://127.0.0.1:8000/index.html"
    print("🌐 Opening:", url)

    try:
        webview.create_window(
            "Ciphra",
            url,
            width=1400,
            height=850,
            min_size=(800, 600)
        )
        webview.start()
    except Exception as e:
        print("❌ WEBVIEW ERROR:", e)
        sys.exit(1)
