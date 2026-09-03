import os
import json
import base64
import hashlib
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from ciphra_encrypter import CiphraEncrypter

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
VAULT_KEY = os.getenv("VAULT_KEY", "MISSING_VAULT_KEY")

print(f"GEMINI_API_KEY: {api_key[:10] if api_key else 'None'}...")
print(f"VAULT_KEY: {VAULT_KEY}")

# 1. Try to decrypt users.json
if os.path.exists("users.json"):
    with open("users.json", "rb") as f:
        data = f.read()
    
    decrypted = None
    
    # Try Fernet from auth_api.py
    if api_key:
        fernet_key = base64.urlsafe_b64encode(hashlib.sha256(api_key.encode()).digest())
        fernet = Fernet(fernet_key)
        try:
            decrypted = json.loads(fernet.decrypt(data).decode())
            print("Successfully decrypted using auth_api Fernet!")
        except Exception as e:
            print("Failed to decrypt using auth_api Fernet:", e)
            
    # Try CiphraEncrypter with correct master_key
    if decrypted is None:
        master_key = f"{api_key if api_key else 'CIPHRA_FALLBACK'}::{VAULT_KEY}"
        ce = CiphraEncrypter(master_key)
        try:
            decrypted = ce.decrypt(data)
            if decrypted:
                print("Successfully decrypted using CiphraEncrypter (with env VAULT_KEY)!")
            else:
                print("CiphraEncrypter returned empty dict")
        except Exception as e:
            print("Failed to decrypt using CiphraEncrypter (with env VAULT_KEY):", e)
            
    # Try CiphraEncrypter with MISSING_VAULT_KEY
    if decrypted is None or decrypted == {}:
        master_key_fallback = f"{api_key if api_key else 'CIPHRA_FALLBACK'}::MISSING_VAULT_KEY"
        ce_fallback = CiphraEncrypter(master_key_fallback)
        try:
            decrypted = ce_fallback.decrypt(data)
            if decrypted:
                print("Successfully decrypted using CiphraEncrypter (with MISSING_VAULT_KEY)!")
            else:
                print("CiphraEncrypter (fallback) returned empty dict")
        except Exception as e:
            print("Failed to decrypt using CiphraEncrypter (with MISSING_VAULT_KEY):", e)

    # 2. If successfully decrypted, re-encrypt using correct CiphraEncrypter and save
    if decrypted and decrypted != {}:
        print("Users count:", len(decrypted))
        print("Sample user keys:", list(decrypted.keys()))
        
        # Save backup
        with open("users.json.bak", "wb") as f:
            f.write(data)
        print("Backup saved to users.json.bak")
        
        # Save plain for debugging (we can delete this later or keep it)
        with open("users_plain.json", "w") as f:
            json.dump(decrypted, f, indent=4)
        print("Plain users saved to users_plain.json")
        
        # Re-encrypt with correct CE
        master_key = f"{api_key if api_key else 'CIPHRA_FALLBACK'}::{VAULT_KEY}"
        ce = CiphraEncrypter(master_key)
        encrypted_data = ce.encrypt(decrypted)
        
        with open("users.json", "wb") as f:
            f.write(encrypted_data)
        print("users.json successfully re-encrypted and saved!")
    else:
        print("ERROR: Could not decrypt users.json with any key!")
else:
    print("users.json does not exist!")
