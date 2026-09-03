import os
import json
from dotenv import load_dotenv
from ciphra_encrypter import CiphraEncrypter

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
VAULT_KEY = os.getenv("VAULT_KEY", "MISSING_VAULT_KEY")

print(f"GEMINI_API_KEY: {api_key[:10] if api_key else 'None'}...")
print(f"VAULT_KEY: {VAULT_KEY}")

CHATS_FILE = "chats.json"

if os.path.exists(CHATS_FILE):
    with open(CHATS_FILE, "rb") as f:
        data = f.read()
    
    decrypted = None
    
    # Try CiphraEncrypter with correct master_key
    master_key = f"{api_key if api_key else 'CIPHRA_FALLBACK'}::{VAULT_KEY}"
    ce = CiphraEncrypter(master_key)
    try:
        decrypted = ce.decrypt(data)
        if decrypted:
            print("Successfully decrypted chats using CiphraEncrypter (with env VAULT_KEY)!")
        else:
            print("CiphraEncrypter returned empty dict for chats")
    except Exception as e:
        print("Failed to decrypt chats using CiphraEncrypter (with env VAULT_KEY):", e)
            
    # Try CiphraEncrypter with MISSING_VAULT_KEY
    if decrypted is None or decrypted == {}:
        master_key_fallback = f"{api_key if api_key else 'CIPHRA_FALLBACK'}::MISSING_VAULT_KEY"
        ce_fallback = CiphraEncrypter(master_key_fallback)
        try:
            decrypted = ce_fallback.decrypt(data)
            if decrypted:
                print("Successfully decrypted chats using CiphraEncrypter (with MISSING_VAULT_KEY)!")
            else:
                print("CiphraEncrypter (fallback) returned empty dict for chats")
        except Exception as e:
            print("Failed to decrypt chats using CiphraEncrypter (with MISSING_VAULT_KEY):", e)

    # 2. If successfully decrypted and it was using fallback, re-encrypt using correct CiphraEncrypter and save
    if decrypted and decrypted != {}:
        print("Chats count:", len(decrypted))
        
        # Save backup
        with open("chats.json.bak", "wb") as f:
            f.write(data)
        print("Backup saved to chats.json.bak")
        
        # Re-encrypt with correct CE
        master_key = f"{api_key if api_key else 'CIPHRA_FALLBACK'}::{VAULT_KEY}"
        ce = CiphraEncrypter(master_key)
        encrypted_data = ce.encrypt(decrypted)
        
        with open(CHATS_FILE, "wb") as f:
            f.write(encrypted_data)
        print("chats.json successfully re-encrypted and saved!")
    else:
        print("ERROR or chats was already empty/could not decrypt")
else:
    print("chats.json does not exist!")
