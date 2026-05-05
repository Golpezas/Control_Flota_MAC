# clean_thumbs_db_references.py
# Elimina Thumbs.db de GridFS y limpia referencias en Vehiculos (atómico)
# Mejoras: Fix de scope, simulación precisa en dry-run, logging verbose.
# Uso: python clean_thumbs_db_references.py [--dry-run] [--verbose]

import os
import gridfs
from pymongo import MongoClient
from pymongo.errors import OperationFailure
import argparse
import re  # Para regex en simulación dry-run

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://antoniohernandezmm_db_user:VhNG9h2rfXAy2xxv@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster")
DB_NAME = "MacSeguridadFlota"
VEHICULOS_COLL = "Vehiculos"

def main(dry_run: bool, verbose: bool):
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    fs = gridfs.GridFS(db)
    vehiculos = db[VEHICULOS_COLL]

    print("Iniciando limpieza atómica de Thumbs.db...")

    # Paso 1: Eliminar de GridFS (con regex case-insensitive)
    deleted_gridfs = 0
    for grid_file in fs.find({"filename": {"$regex": "^Thumbs\\.db$", "$options": "i"}}):
        if verbose:
            print(f"{'[DRY] ' if dry_run else ''}Encontrado en GridFS: {grid_file.filename} (ID: {grid_file._id})")
        if not dry_run:
            fs.delete(grid_file._id)
        deleted_gridfs += 1

    print(f"Archivos GridFS procesados: {deleted_gridfs}")

    # Paso 2: Limpiar referencias en Vehiculos (pull de array)
    deleted_refs = 0
    cursor = vehiculos.find({"documentos_digitales.nombre_archivo": {"$regex": "^Thumbs\\.db$", "$options": "i"}})
    for vehiculo in cursor:
        if verbose:
            print(f"Procesando Vehiculo ID: {vehiculo['_id']}")

        with client.start_session() as session:
            def cb(s):
                update_result = vehiculos.update_one(
                    {"_id": vehiculo["_id"]},
                    {"$pull": {"documentos_digitales": {"nombre_archivo": {"$regex": "^Thumbs\\.db$", "$options": "i"}}}},
                    session=s
                )
                return update_result.modified_count  # Retornamos el conteo para capturarlo fuera

            if not dry_run:
                try:
                    modified_count = session.with_transaction(cb)  # Capturamos el retorno de cb
                    print(f"Limpieza referencias en Vehiculo {vehiculo['_id']}: {modified_count} entradas removidas")
                    deleted_refs += modified_count
                except OperationFailure as e:
                    print(f"Error en transacción para {vehiculo['_id']}: {e}")
            else:
                # Simulación dry-run: Contamos manualmente las entradas coincidentes
                docs = vehiculo.get('documentos_digitales', [])
                matching = [doc for doc in docs if re.match(r"^Thumbs\.db$", doc.get('nombre_archivo', ''), re.IGNORECASE)]
                sim_count = len(matching)
                print(f"[DRY] Simulando limpieza en Vehiculo {vehiculo['_id']}: {sim_count} entradas potenciales")
                deleted_refs += sim_count  # Simulamos la adición para resumen

    print("\nResumen Final:")
    print(f"Archivos GridFS eliminados/simulados: {deleted_gridfs}")
    print(f"Referencias Vehiculos limpiadas/simuladas: {deleted_refs}")
    if dry_run:
        print("Modo DRY-RUN: Ningún cambio real aplicado.")
    client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Limpia Thumbs.db de GridFS y referencias en Vehiculos.")
    parser.add_argument("--dry-run", action="store_true", help="Simula sin aplicar cambios.")
    parser.add_argument("--verbose", action="store_true", help="Muestra logs detallados.")
    args = parser.parse_args()
    main(args.dry_run, args.verbose)