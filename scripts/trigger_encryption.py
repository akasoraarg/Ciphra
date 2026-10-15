import os, sys
# Permite importar los módulos de backend/ al correr: python scripts/<script>.py (desde la raíz)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
import main
main.save_users(main.load_users())
main.save_chats(main.load_chats())
print("Files encrypted successfully!")
