import os
import subprocess
import shutil

print("🚀 Starting Ciphra macOS App Packaging System...")

# Paths
# Raíz del proyecto (este script vive en desktop/).
workspace_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app_name = "Ciphra"

app_bundle = f"{workspace_dir}/{app_name}.app"
contents_dir = f"{app_bundle}/Contents"
macos_dir = f"{contents_dir}/MacOS"
resources_dir = f"{contents_dir}/Resources"

dmg_name = f"{workspace_dir}/{app_name}.dmg"

# 1. Clean previous builds
if os.path.exists(app_bundle):
    print("🧹 Cleaning existing .app bundle...")
    shutil.rmtree(app_bundle)

if os.path.exists(dmg_name):
    print("🧹 Cleaning existing .dmg installer...")
    os.remove(dmg_name)

# 2. Create directory structure
print("📁 Creating bundle folder structure...")
os.makedirs(macos_dir, exist_ok=True)
os.makedirs(resources_dir, exist_ok=True)

# 3. Create Info.plist
print("🧾 Writing Info.plist...")

info_plist_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>{app_name}</string>

    <key>CFBundleIconFile</key>
    <string>ciphra.icns</string>

    <key>CFBundleIdentifier</key>
    <string>com.ciphra.desktop</string>

    <key>CFBundleName</key>
    <string>{app_name}</string>

    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <key>CFBundleShortVersionString</key>
    <string>1.2</string>

    <key>CFBundleVersion</key>
    <string>1</string>

    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>

    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
"""

with open(f"{contents_dir}/Info.plist", "w") as f:
    f.write(info_plist_content)

# 4. Copy project files into Resources/app
print("📦 Copying project files into app bundle...")

app_resource_dir = f"{resources_dir}/app"

if os.path.exists(app_resource_dir):
    shutil.rmtree(app_resource_dir)

os.makedirs(app_resource_dir, exist_ok=True)

# Carpetas del proyecto que van dentro del bundle (se copian enteras).
dirs_to_copy = ["backend", "frontend", "desktop"]

# Archivos sueltos de la raíz. NUNCA incluir datos de usuarios (users.json, chats.json,
# sessions.json, users_plain.json...) ni .env: el .dmg es descargable públicamente.
# La app arranca con datos vacíos y los crea al usarse.
files_to_copy = []

for d in dirs_to_copy:
    src = f"{workspace_dir}/{d}"
    dst = f"{app_resource_dir}/{d}"
    if os.path.exists(src):
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        print(f"✅ Copied folder: {d}/")
    else:
        print(f"⚠️ Missing folder (skipped): {d}/")

for file in files_to_copy:
    src = f"{workspace_dir}/{file}"
    dst = f"{app_resource_dir}/{file}"

    if os.path.exists(src):
        shutil.copy2(src, dst)
        print(f"✅ Copied: {file}")
    else:
        print(f"⚠️ Missing file (skipped): {file}")

# Copy venv (portable build)
venv_src = f"{workspace_dir}/venv"
venv_dst = f"{app_resource_dir}/venv"

if os.path.exists(venv_src):
    print("🐍 Copying venv into app bundle (this may take a while)...")

    if os.path.exists(venv_dst):
        shutil.rmtree(venv_dst)

    shutil.copytree(venv_src, venv_dst)
    print("✅ venv copied successfully.")
else:
    print("⚠️ venv folder not found. App will not be portable.")

# 5. Create Launch Script inside Contents/MacOS
print("⚙️ Creating launch script...")

launch_script_content = f"""#!/bin/bash
DIR="$( cd "$( dirname "${{BASH_SOURCE[0]}}" )" && pwd )"
APP_DIR="$DIR/../Resources/app"
cd "$APP_DIR"

# Matar cualquier instancia previa en el puerto 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null

# Detectar arquitectura
if [ "$(sysctl -in hw.optional.arm64)" = "1" ]; then
    ARCH_CMD="arch -arm64"
else
    ARCH_CMD="arch -x86_64"
fi

# Arrancar uvicorn con working directory explícito
cd "$APP_DIR"
$ARCH_CMD "$APP_DIR/venv/bin/python3" "$APP_DIR/desktop/desktop.py" > /tmp/ciphra_desktop.log 2>&1

exit 0
"""

launch_script_path = f"{macos_dir}/{app_name}"

with open(launch_script_path, "w") as f:
    f.write(launch_script_content)

os.chmod(launch_script_path, 0o755)
print("🔑 Launch script written + marked executable.")

# 6. Generate ciphra.icns icon
favicon_path = f"{workspace_dir}/frontend/assets/favicon.png"
iconset_dir = f"{workspace_dir}/ciphra.iconset"

if os.path.exists(favicon_path):
    print("🎨 favicon.png found! Converting to native macOS ciphra.icns...")

    try:
        os.makedirs(iconset_dir, exist_ok=True)
        sizes = [16, 32, 64, 128, 256, 512]

        for s in sizes:
            subprocess.run([
                "sips", "-z", str(s), str(s), favicon_path,
                "--out", f"{iconset_dir}/icon_{s}x{s}.png"
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            subprocess.run([
                "sips", "-z", str(s*2), str(s*2), favicon_path,
                "--out", f"{iconset_dir}/icon_{s}x{s}@2x.png"
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            "iconutil", "-c", "icns", iconset_dir,
            "-o", f"{resources_dir}/ciphra.icns"
        ], check=True)

        print("🎉 Successfully generated ciphra.icns!")

    except Exception as e:
        print(f"⚠️ Error creating icon: {e}")

    finally:
        if os.path.exists(iconset_dir):
            shutil.rmtree(iconset_dir)

else:
    print("⚠️ favicon.png not found. Continuing without custom icon bundle.")

# 7. Package into DMG
print("💿 Packaging Ciphra.app into Ciphra.dmg installer...")

try:
    tmp_dmg_dir = f"{workspace_dir}/tmp_dmg"

    if os.path.exists(tmp_dmg_dir):
        shutil.rmtree(tmp_dmg_dir)

    os.makedirs(tmp_dmg_dir, exist_ok=True)

    shutil.copytree(app_bundle, f"{tmp_dmg_dir}/{app_name}.app")
    os.symlink("/Applications", f"{tmp_dmg_dir}/Applications")

    subprocess.run([
        "hdiutil", "create",
        "-volname", "Ciphra Installer",
        "-srcfolder", tmp_dmg_dir,
        "-ov",
        "-format", "UDZO",
        dmg_name
    ], check=True)

    print("🎉 Success! Standalone installer Ciphra.dmg generated successfully!")

    shutil.rmtree(tmp_dmg_dir)

except Exception as e:
    print(f"⚠️ Error packaging DMG: {e}")

print("✨ All packaging procedures completed successfully!")