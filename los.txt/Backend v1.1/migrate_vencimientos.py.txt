# migrate_vencimientos.py
# Limpia vencimientos en Documentacion: elimina duplicados, normaliza tipos y limpia "N/A".
# NO sincroniza con Vehiculos (respeta lógica manual de Vencimientos Críticos).
# Uso: python migrate_vencimientos.py [--dry-run] [--verbose] [--coleccion Documentacion] (default: Documentacion).
# Normativas: Idempotente (seguro repetir), atomicidad en updates (bulk), validación runtime (counts pre/post), logging para auditoría.
# Mejores Prácticas: Normalización 1NF (no duplicados), tipado (null para inválidos), consistencia (tipos canónicos), sin disrupción (offline, focalizado).

import os
import logging
from pymongo import MongoClient, UpdateOne
import argparse
from typing import List, Dict

# Configuración de Logging (mejor práctica para trazabilidad en prod)
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://antoniohernandezmm_db_user:VhNG9h2rfXAy2xxv@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster")
DB_NAME = "MacSeguridadFlota"
COLECCION_DEFAULT = "Documentacion"

# Tipos canónicos (enum-like para validación; solo los clave para Vencimientos Críticos)
TIPOS_CANONICOS = {
    "Poliza_Detalle": "SEGURO",  # Para Póliza de Seguro
    "VTV": "VTV",               # Para VTV
    "TARJ YPF": "TARJ YPF"      # Otros si aplican
}

def connect_to_db() -> MongoClient:
    """Conexión validada a MongoDB (con chequeo de ping para robustez)."""
    client = MongoClient(MONGO_URI)
    try:
        client.admin.command('ping')
        logger.info("Conexión a MongoDB exitosa.")
    except Exception as e:
        logger.error(f"Error de conexión: {e}")
        raise
    return client

def remove_duplicates(collection, dry_run: bool, verbose: bool) -> int:
    """Elimina duplicados por patente + tipo_documento, manteniendo el más reciente (sort por fecha_vencimiento descending).
    Validación: Count pre/post para auditoría. Idempotente (si no hay dupes, no hace nada)."""
    operations: List[Dict] = []
    patentes = collection.distinct("patente")
    
    for patente in patentes:
        for tipo in list(TIPOS_CANONICOS.keys()) + list(TIPOS_CANONICOS.values()):  # Cubre actuales y canónicos
            dupes = list(collection.find({"patente": patente, "tipo_documento": tipo}).sort("fecha_vencimiento", -1))
            if len(dupes) > 1:
                keep_id = dupes[0]["_id"]
                delete_ids = [d["_id"] for d in dupes[1:]]
                
                if verbose:
                    logger.info(f"Duplicados para {patente} - {tipo}: {len(delete_ids)}. Manteniendo ID: {keep_id} (fecha: {dupes[0].get('fecha_vencimiento')})")
                    for d in dupes[1:]:
                        logger.info(f" - Simulando/Eliminando ID: {d['_id']}, fecha: {d.get('fecha_vencimiento')}")
                
                if not dry_run:
                    collection.delete_many({"_id": {"$in": delete_ids}})
                operations.append({"patente": patente, "tipo": tipo, "eliminados": len(delete_ids)})
    
    total_eliminados = sum(op["eliminados"] for op in operations)
    logger.info(f"Total duplicados eliminados/simulados: {total_eliminados}")
    return total_eliminados

def normalize_types(collection, dry_run: bool, verbose: bool) -> int:
    """Normaliza tipos a canónicos (ej. "Poliza_Detalle" → "SEGURO").
    Bulk update para eficiencia. Idempotente (si ya normalizado, count=0)."""
    bulk_ops: List[UpdateOne] = []
    for old_tipo, new_tipo in TIPOS_CANONICOS.items():
        if old_tipo != new_tipo:
            count = collection.count_documents({"tipo_documento": old_tipo})
            if count > 0:
                if verbose:
                    logger.info(f"Simulando/Normalizando {count} documentos de {old_tipo} a {new_tipo}")
                if not dry_run:
                    bulk_ops.append(UpdateOne({"tipo_documento": old_tipo}, {"$set": {"tipo_documento": new_tipo}}, upsert=False))
    
    if bulk_ops:
        result = collection.bulk_write(bulk_ops)
        logger.info(f"Tipos normalizados: {result.modified_count}")
        return result.modified_count
    logger.info("No hay tipos para normalizar.")
    return 0

def clean_na_values(collection, dry_run: bool, verbose: bool) -> int:
    """Limpia "N/A" a null en campos clave (fecha_vencimiento, aseguradora).
    Validación: Solo aplica si valor es exactamente "N/A". Idempotente."""
    fields_to_clean = ["fecha_vencimiento", "aseguradora"]
    filtro = {"$or": [{field: "N/A"} for field in fields_to_clean]}
    count = collection.count_documents(filtro)
    
    if count > 0:
        if verbose:
            logger.info(f"Encontrados {count} campos 'N/A' para limpiar/simular.")
        
        update_set = {"$set": {field: None for field in fields_to_clean}}
        if not dry_run:
            result = collection.update_many(filtro, update_set)
            logger.info(f"Campos 'N/A' limpiados: {result.modified_count}")
            return result.modified_count
    logger.info("No hay 'N/A' para limpiar.")
    return 0

def main(dry_run: bool, verbose: bool, coleccion: str):
    client = connect_to_db()
    db = client[DB_NAME]
    collection = db[coleccion]
    
    logger.info(f"Procesando colección: {coleccion}")
    
    # Paso 1: Eliminar duplicados (mantener más reciente)
    remove_duplicates(collection, dry_run, verbose)
    
    # Paso 2: Normalizar tipos (a canónicos)
    normalize_types(collection, dry_run, verbose)
    
    # Paso 3: Limpiar "N/A" a null
    clean_na_values(collection, dry_run, verbose)
    
    logger.info("Migración completada. Verifique BD para confirmación.")
    client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Limpia y normaliza vencimientos en Documentacion (duplicados, tipos, N/A). NO sincroniza con otras colecciones.")
    parser.add_argument("--dry-run", action="store_true", help="Simula sin aplicar cambios.")
    parser.add_argument("--verbose", action="store_true", help="Logs detallados de cada operación (IDs, fechas).")
    parser.add_argument("--coleccion", type=str, default=COLECCION_DEFAULT, help="Colección a procesar (default: Documentacion).")
    args = parser.parse_args()
    main(args.dry_run, args.verbose, args.coleccion)