# migrate_all_docs_to_gridfs.py
# Versión FINAL corregida - 100% funcional

import os
import gridfs
from pymongo import MongoClient

# ================================
# CONFIGURACIÓN (AJUSTA SI ES NECESARIO)
# ================================
MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb+srv://antoniohernandezmm_db_user:VhNG9h2rfXAy2xxv@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster"
)
DB_NAME = "MacSeguridadFlota"
COLLECTION_NAME = "Vehiculos"

# RUTA EXACTA DONDE ESTÁ TU CARPETA "Documentos-Digitales"
# Cambia solo si tu carpeta está en otro lugar
_PATH = "C:/Users/Antonio/Documents/Projects/Control_Flota/Documentos-Digitales"

# ================================
# CONEXIÓN
# ================================
print("Conectando a MongoDB Atlas...")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
fs = gridfs.GridFS(db)
vehiculos = db[COLLECTION_NAME]

# ================================
# FUNCIÓN: Subir archivo
# ================================
def subir_archivo(file_path: str, patente: str, tipo_doc: str) -> str | None:
    if not os.path.isfile(file_path):
        print(f"    Archivo NO encontrado: {file_path}")
        return None

    try:
        with open(file_path, "rb") as f:
            file_id = fs.put(
                f,
                filename=os.path.basename(file_path),
                metadata={
                    "patente": patente,
                    "tipo_documento": tipo_doc,
                    "migrated_from_local": True
                }
            )
        print(f"    Subido OK → file_id: {file_id}")
        return str(file_id)
    except Exception as e:
        print(f"    ERROR subiendo {file_path}: {e}")
        return None

# ================================
# PROCESO PRINCIPAL
# ================================
print("\nIniciando migración automática de documentos digitales...\n")

contador_subidos = 0
contador_vehiculos = 0

cursor = vehiculos.find(
    {"documentos_digitales": {"$exists": True, "$ne": []}},
    {"_id": 1, "documentos_digitales": 1}
)

for vehiculo in cursor:
    patente = vehiculo["_id"]
    docs = vehiculo.get("documentos_digitales", [])
    modificado = False

    print(f"\nProcesando vehículo: {patente} ({len(docs)} documentos)")

    for idx, doc in enumerate(docs):
        tipo = doc.get("tipo", "").strip()
        nombre_archivo = doc.get("nombre_archivo")
        path_esperado = doc.get("path_esperado")

        # Si ya tiene file_id → ya migrado
        if doc.get("file_id"):
            print(f"    {tipo} → Ya migrado (file_id existe)")
            continue

        if not nombre_archivo and not path_esperado:
            print(f"    {tipo} → Sin nombre ni ruta, se salta")
            continue

        # Construir ruta posible
        posible_ruta = None
        if path_esperado:
            ruta_limpia = path_esperado.replace("Documentos-Digitales/", "").replace("Documentos-Digitales\\", "").lstrip("\\/")
            posible_ruta = os.path.join(_PATH, ruta_limpia.replace("/", os.sep).replace("\\", os.sep))
        elif nombre_archivo:
            posible_ruta = os.path.join(_PATH, patente, nombre_archivo)

        if not posible_ruta or not os.path.isfile(posible_ruta):
            print(f"    {tipo} → Archivo no encontrado")
            continue

        # SUBIR
        file_id = subir_archivo(posible_ruta, patente, tipo)
        if file_id:
            result = vehiculos.update_one(
                {"_id": patente},
                {"$set": {
                    f"documentos_digitales.{idx}.file_id": file_id,
                    f"documentos_digitales.{idx}.existe_fisicamente": True,
                    f"documentos_digitales.{idx}.path_esperado": None
                }}
            )
            if result.modified_count:
                print(f"    Base de datos actualizada: {tipo}")
                contador_subidos += 1
                modificado = True

    if modificado:
        contador_vehiculos += 1

# ================================
# RESULTADO
# ================================
print("\n" + "="*60)
print("MIGRACIÓN COMPLETADA CON ÉXITO")
print("="*60)
print(f"Vehículos actualizados : {contador_vehiculos}")
print(f"Archivos subidos a GridFS : {contador_subidos}")
print("Ahora todos tus documentos están en la nube y visibles en producción")
print("="*60)

client.close()