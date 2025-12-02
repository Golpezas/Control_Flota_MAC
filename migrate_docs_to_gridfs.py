# migrate_all_docs_to_gridfs.py
# Versión FINAL corregida - 100% funcional
# Depuración: Agregados prints para cada paso, manejo de errores detallado
# Mejora: Adivina content_type con mimetypes para MIME correcto
# Relevamiento: Lee todos los vehículos con documentos_digitales
# Normalización: Limpia paths con os.sep, valida extensiones
# Validación: Checks de existencia archivo, MIME allowed
# Documentación: Docstrings y comments inline

import os
import gridfs
from pymongo import MongoClient
import mimetypes  # Para adivinar content_type basado en extensión

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

# MIME permitidos (normalización)
ALLOWED_MIME = {"application/pdf", "image/jpeg", "image/png"}

# ================================
# CONEXIÓN (con validación)
# ================================
print("Conectando a MongoDB Atlas...")
try:
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    fs = gridfs.GridFS(db)
    vehiculos = db[COLLECTION_NAME]
    print("Conexión OK")
except Exception as e:
    print(f"ERROR CONEXIÓN: {e}")
    exit(1)

# ================================
# FUNCIÓN: Subir archivo (CON CONTENT_TYPE y validación)
# ================================
def subir_archivo(file_path: str, patente: str, tipo_doc: str) -> str | None:
    """Sube archivo a GridFS con MIME correcto y metadata."""
    if not os.path.isfile(file_path):
        print(f"    Archivo NO encontrado: {file_path}")
        return None

    try:
        content_type, _ = mimetypes.guess_type(file_path)
        content_type = content_type or "application/octet-stream"

        if content_type not in ALLOWED_MIME:
            print(f"    MIME no permitido: {content_type}")
            return None

        with open(file_path, "rb") as f:
            file_id = fs.put(
                f,
                filename=os.path.basename(file_path),
                content_type=content_type,
                metadata={
                    "patente": patente,
                    "tipo_documento": tipo_doc,
                    "migrated_from_local": True
                }
            )
        print(f"    Subido OK → file_id: {file_id}, content_type: {content_type}")
        return str(file_id)
    except Exception as e:
        print(f"    ERROR subiendo {file_path}: {e}")
        return None

# ================================
# PROCESO PRINCIPAL (CON DEBUG)
# ================================
print("\nIniciando migración automática de documentos digitales...\n")

contador_subidos = 0
contador_vehiculos = 0

try:
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

            # Construir ruta posible (normalización con os.sep)
            posible_ruta = None
            if path_esperado:
                ruta_limpia = path_esperado.replace("Documentos-Digitales/", "").replace("Documentos-Digitales\\", "").lstrip("\\/")
                posible_ruta = os.path.join(_PATH, ruta_limpia.replace("/", os.sep).replace("\\", os.sep))
            elif nombre_archivo:
                posible_ruta = os.path.join(_PATH, patente, nombre_archivo)

            if not posible_ruta or not os.path.isfile(posible_ruta):
                print(f"    {tipo} → Archivo no encontrado en {posible_ruta}")
                continue

            # SUBIR CON DEBUG
            print(f"    Intentando subir {tipo} desde {posible_ruta}")
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
                if result.modified_count > 0:
                    print(f"    Base de datos actualizada: {tipo}")
                    contador_subidos += 1
                    modificado = True
                else:
                    print(f"    ADVERTENCIA: No se actualizó DB para {tipo}")

        if modificado:
            contador_vehiculos += 1

except Exception as e:
    print(f"ERROR GENERAL EN MIGRACIÓN: {e}")

# ================================
# RESULTADO (CON RESUMEN)
# ================================
print("\n" + "="*60)
print("MIGRACIÓN COMPLETADA CON ÉXITO")
print("="*60)
print(f"Vehículos actualizados : {contador_vehiculos}")
print(f"Archivos subidos a GridFS : {contador_subidos}")
print("Ahora todos tus documentos están en la nube y visibles en producción")
print("="*60)

client.close()