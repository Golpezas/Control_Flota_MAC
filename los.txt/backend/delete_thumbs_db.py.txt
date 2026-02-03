# delete_thumbs_db.py
# Elimina todos los Thumbs.db que se colaron en GridFS
# 100% seguro - solo borra archivos cuyo nombre sea exactamente Thumbs.db

from pymongo import MongoClient
import os
import gridfs

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb+srv://antoniohernandezmm_db_user:VhNG9h2rfXAy2xxv@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster"
)
DB_NAME = "MacSeguridadFlota"

print("Conectando a MongoDB Atlas...")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
fs = gridfs.GridFS(db)

print("Buscando y eliminando Thumbs.db...")

# Busca solo archivos cuyo filename sea exactamente Thumbs.db (case insensitive)
deleted = 0
for grid_file in fs.find({"filename": {"$regex": "^Thumbs\\.db$", "$options": "i"}}):
    print(f"Eliminando → {grid_file.filename} (id: {grid_file._id})")
    fs.delete(grid_file._id)
    deleted += 1

print("\n" + "="*60)
if deleted == 0:
    print("No se encontraron Thumbs.db → Todo limpio")
else:
    print(f"¡ÉXITO! Se eliminaron {deleted} archivos Thumbs.db basura")
    print("Tu GridFS ahora está 100% limpio y profesional")
print("="*60)

client.close()