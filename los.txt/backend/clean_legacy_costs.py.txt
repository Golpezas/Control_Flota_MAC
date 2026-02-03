# clean_legacy_costs.py
# Limpia costos legacy desorganizados en Finanzas/Mantenimiento (sin patente, monto <=0, etc.)
# Uso: python clean_legacy_costs.py [--dry-run] [--verbose] [--coleccion Finanzas] (o Mantenimiento, o ambas por default)

import os
from pymongo import MongoClient
import argparse

MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://antoniohernandezmm_db_user:VhNG9h2rfXAy2xxv@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster")
DB_NAME = "MacSeguridadFlota"
COLECCIONES = ["Finanzas", "Mantenimiento"]  # Ambas por default

def normalize_patente(patente: str) -> str:
    """Normalización de patentes (coincide con dependencies.py)"""
    if not patente:
        return ""
    return patente.strip().upper().replace(" ", "").replace("-", "")

def is_valid_patente(patente: str) -> bool:
    """Validación lógica: Al menos 6 caracteres alfanuméricos"""
    norm = normalize_patente(patente)
    return len(norm) >= 6 and norm.isalnum()

def main(dry_run: bool, verbose: bool, coleccion: str):
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    
    if coleccion:
        cols = [coleccion]
    else:
        cols = COLECCIONES
    
    for col_name in cols:
        collection = db[col_name]
        print(f"\nProcesando colección: {col_name}")
        
        # Filtro para inválidos: Sin patente o inválida, o monto <=0
        # Ajusta campos de monto según colección (de Estructura_CSV.txt)
        monto_field = "MONTO" if col_name == "Finanzas" else "costo_monto"
        filtro = {
            "$or": [
                {"patente": {"$exists": False}},  # Sin patente
                {"patente": ""},  # Patente vacía
                {"patente": None},  # Null
                {monto_field: {"$lte": 0}},  # Monto inválido
            ]
        }
        
        # Preview: Encuentra y lista
        cursor = collection.find(filtro)
        invalid_docs = list(cursor)
        print(f"Documentos inválidos encontrados: {len(invalid_docs)}")
        
        if verbose:
            for doc in invalid_docs:
                patente = doc.get('patente', 'MISSING')
                monto = doc.get(monto_field, 'MISSING')
                print(f"ID: {doc['_id']}, Patente: {patente} (válida? {is_valid_patente(patente)}), Monto: {monto}")
        
        if not dry_run:
            # Eliminación bulk
            if invalid_docs:
                ids_to_delete = [doc['_id'] for doc in invalid_docs]
                result = collection.delete_many({"_id": {"$in": ids_to_delete}})
                print(f"Eliminados: {result.deleted_count}")
            else:
                print("Nada que eliminar.")
        else:
            print("[DRY] Simulación: No se eliminó nada.")

    client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Limpia costos legacy inválidos.")
    parser.add_argument("--dry-run", action="store_true", help="Simula sin eliminar.")
    parser.add_argument("--verbose", action="store_true", help="Lista documentos inválidos.")
    parser.add_argument("--coleccion", type=str, choices=["Finanzas", "Mantenimiento"], help="Colección específica (default: ambas).")
    args = parser.parse_args()
    main(args.dry_run, args.verbose, args.coleccion)