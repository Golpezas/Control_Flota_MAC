from fastapi import APIRouter, Depends
from bson import ObjectId
from datetime import datetime
# =================================================================
# IMPORTS CORRECTOS PARA TU PROYECTO REAL
# =================================================================
from fastapi import APIRouter
from dependencies import get_db_collection   # ← ESTO SÍ FUNCIONA PERFECTO

def normalize_patente(patente: str) -> str:
    if not patente:
        return ""
    return patente.strip().upper().replace(" ", "").replace("-", "")

router = APIRouter(prefix="/costos", tags=["Costos"])

@router.get("/unificado/{patente}")
async def get_gastos_unificados(patente: str):
    patente_norm = normalize_patente(patente)

    # USAMOS get_db_collection (la función que ya tenés y que NO genera circular import)
    costos_collection = get_db_collection("Mantenimiento")
    finanzas_collection = get_db_collection("Finanzas")

    # MANTENIMIENTOS
    mantenimientos_raw = await costos_collection.find({"patente": patente_norm}).to_list(1000)
    mantenimientos = []
    for m in mantenimientos_raw:
        mantenimientos.append({
            "id": str(m["_id"]),
            "fecha": m["fecha"],
            "tipo": m.get("motivo") or "Mantenimiento General",
            "monto": float(m.get("costo_monto") or 0),
            "descripcion": m.get("descripcion") or "",
            "comprobante_file_id": m.get("comprobante_file_id"),
            "origen": "mantenimiento"
        })

    # MULTAS
    multas_raw = await finanzas_collection.find({
        "patente": patente_norm,
        "motivo": "Multa"
    }).to_list(1000)
    
    multas = []
    for f in multas_raw:
        multas.append({
            "id": str(f["_id"]),
            "fecha": f["fecha"],
            "tipo": "Multa",
            "monto": float(f.get("MONTO") or 0),
            "descripcion": f.get("descripcion") or "",
            "comprobante_file_id": f.get("comprobante_file_id"),
            "origen": "finanzas"
        })

    todos = mantenimientos + multas
    todos.sort(key=lambda x: x["fecha"], reverse=True)

    return {
        "gastos": todos,
        "total_general": sum(g["monto"] for g in todos),
        "total_mantenimiento": sum(g["monto"] for g in todos if g["origen"] == "mantenimiento"),
        "total_multas": sum(g["monto"] for g in todos if g["tipo"] == "Multa")
    }