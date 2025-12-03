from fastapi import APIRouter, Depends
from bson import ObjectId
from datetime import datetime
# =================================================================
# IMPORTS CORRECTOS PARA TU PROYECTO REAL
# =================================================================
from fastapi import APIRouter
from main import database  # ← CORRECTO: main.py está en la raíz

# normalize_patente NO existe en Python → la definimos aquí mismo
def normalize_patente(patente: str) -> str:
    """Normaliza patente: mayúsculas, sin espacios ni guiones"""
    if not patente:
        return ""
    return patente.strip().upper().replace(" ", "").replace("-", "")

# Router
router = APIRouter(prefix="/costos", tags=["Costos"])

# =================================================================
# RUTA UNIFICADA 100% FUNCIONAL (SIN ERRORES)
# =================================================================
@router.get("/unificado/{patente}")
async def get_gastos_unificados(patente: str):
    patente_norm = normalize_patente(patente)

    # === MANTENIMIENTOS ===
    mantenimientos_raw = await database.costos.find({"patente": patente_norm}).to_list(1000)
    mantenimientos = []
    for m in mantenimientos_raw:
        mantenimientos.append({
            "id": str(m["_id"]),
            "fecha": m["fecha"],
            "tipo": m.get("motivo") or "Mantenimiento General",
            "monto": float(m.get("costo_monto") or m.get("monto", 0)),
            "descripcion": m.get("descripcion") or "",
            "comprobante_file_id": m.get("comprobante_file_id"),
            "origen": "mantenimiento"
        })

    # === MULTAS ===
    multas_raw = await database.finanzas.find({
        "patente": patente_norm,
        "motivo": "Multa"
    }).to_list(1000)
    
    multas = []
    for f in multas_raw:
        multas.append({
            "id": str(f["_id"]),
            "fecha": f["fecha"],
            "tipo": "Multa",
            "monto": float(f.get("MONTO") or f.get("monto", 0)),
            "descripcion": f.get("descripcion") or "",
            "comprobante_file_id": f.get("comprobante_file_id"),
            "origen": "finanzas"
        })

    # === UNIFICAR Y ORDENAR ===
    todos = mantenimientos + multas
    todos.sort(key=lambda x: x["fecha"], reverse=True)

    # === TOTALES ===
    return {
        "gastos": todos,
        "total_general": sum(g["monto"] for g in todos),
        "total_mantenimiento": sum(g["monto"] for g in todos if g["origen"] == "mantenimiento"),
        "total_multas": sum(g["monto"] for g in todos if g["tipo"] == "Multa")
    }