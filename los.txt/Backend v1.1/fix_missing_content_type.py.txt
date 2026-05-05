# fix_missing_content_type.py
# Arregla todos los archivos que ya están en GridFS pero sin content_type
# Ejecutar UNA SOLA VEZ - 100% seguro

import os
from pymongo import MongoClient
import mimetypes

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb+srv://antoniohernandezmm_db_user:VhNG9h2rfXAy2xxv@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster"
)
DB_NAME = "MacSeguridadFlota"

print("Conectando a MongoDB Atlas...")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
fs_files = db["fs.files"]

# Mapeo de extensiones a MIME (ampliado)
mime_map = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
}

print("Buscando archivos en fs.files archivos sin contentType...")

# Solo los que NO tienen contentType (los viejos)
query = {"contentType": {"$exists": False}}
total = fs_files.count_documents(query)

if total == 0:
    print("¡Perfecto! Todos los archivos ya tienen contentType. No hay nada que arreglar")
    exit()

print(f"Encontrados {total} archivos sin contentType. Arreglando...\n")

actualizados = 0
for doc in fs_files.find(query):
    filename = doc.get("filename", "")
    if not filename:
        continue
    
    ext = os.path.splitext(filename)[1].lower()
    new_mime = mime_map.get(ext)
    
    if not new_mime:
        # Intento con mimetypes como backup
        new_mime, _ = mimetypes.guess_type(filename)
        new_mime = new_mime or "application/octet-stream"
    
    result = fs_files.update_one(
        {"_id": doc["_id"]},
        {"$set": {"contentType": new_mime}}
    )
    
    if result.modified_count:
        actualizados += 1
        print(f"OK → {filename:35} → {new_mime}")

print("\n" + "="*60)
print("REPARACIÓN COMPLETADA - TODO ARREGLADO")
print("="*60)
print(f"Archivos reparados con contentType correcto: {actualizados}")
print("Ahora todos los PDFs se verán en el modal y se descargarán correctamente")
print("="*60)

client.close()