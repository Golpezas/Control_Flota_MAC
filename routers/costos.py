# routers_costos.py
from fastapi import APIRouter, Query, HTTPException
from bson import ObjectId
import logging

# =================================================================
# IMPORTS CORRECTOS PARA TU PROYECTO REAL
# =================================================================
from dependencies import get_db_collection

logger = logging.getLogger(__name__)

def normalize_patente(patente: str) -> str:
    if not patente:
        return ""
    return patente.strip().upper().replace(" ", "").replace("-", "")

router = APIRouter(prefix="/costos", tags=["Costos"])


@router.get("/unificado/{patente}")
async def get_gastos_unificados(patente: str):
    patente_norm = normalize_patente(patente)
    logger.info(f"Generando reporte unificado para patente: {patente_norm}")

    # === COLECCIONES ===
    try:
        costos_collection = get_db_collection("Mantenimiento")
        finanzas_collection = get_db_collection("Finanzas")
    except Exception as e:
        logger.error(f"Error obteniendo colecciones DB: {e}")
        raise HTTPException(500, "Error interno del servidor")

    # ==================== MANTENIMIENTOS ====================
    mantenimientos = []
    try:
        mantenimientos_raw = await costos_collection.find({"patente": patente_norm}).to_list(1000)
        for m in mantenimientos_raw:
            try:
                mantenimientos.append({
                    "id": str(m["_id"]),
                    "fecha": m.get("fecha", "1970-01-01T00:00:00"),
                    "tipo": m.get("motivo") or "Mantenimiento General",
                    "monto": float(m.get("costo_monto") or 0),
                    "descripcion": m.get("descripcion") or "",
                    "comprobante_file_id": m.get("comprobante_file_id"),
                    "origen": "mantenimiento"
                })
            except Exception as e:
                logger.warning(f"Documento mantenimiento corrupto {m.get('_id')}: {e}")
                continue
    except Exception as e:
        logger.error(f"Error leyendo colección Mantenimiento: {e}")
        mantenimientos = []

    # ==================== MULTAS (ROBUSTO) ====================
    multas = []
    try:
        multas_raw = await finanzas_collection.find({
            "patente": patente_norm,
            "MONTO": {"$gt": 0},
            "$or": [
                {"tipo_registro": {"$regex": "infracci[óo]n", "$options": "i"}},
                {"motivo": {"$regex": "(multa|infracci[óo]n|exceso.*velocidad|semaforo|estacionamiento)", "$options": "i"}}
            ]
        }).to_list(1000)

        for f in multas_raw:
            try:
                # Fecha más confiable posible
                fecha = (
                    f.get("fecha_infraccion") or
                    f.get("FECHA_INFRACCIN") or
                    f.get("fecha") or
                    "1970-01-01T00:00:00"
                )

                multas.append({
                    "id": str(f["_id"]),
                    "fecha": fecha,
                    "tipo": "Multa",
                    "monto": float(f.get("MONTO") or 0),
                    "descripcion": str(f.get("motivo") or f.get("descripcion") or "Infracción de tránsito").strip(),
                    "comprobante_file_id": f.get("comprobante_file_id"),
                    "origen": "finanzas"
                })
            except Exception as e:
                logger.warning(f"Documento multa corrupto {f.get('_id')}: {e}")
                continue
    except Exception as e:
        logger.error(f"Error leyendo colección Finanzas (multas): {e}")
        multas = []

    # ==================== RESPUESTA FINAL SEGURA ====================
    try:
        todos = mantenimientos + multas
        todos.sort(key=lambda x: x["fecha"], reverse=True)

        respuesta = {
            "gastos": todos,
            "total_general": sum(g["monto"] for g in todos),
            "total_mantenimiento": sum(g["monto"] for g in todos if g["origen"] == "mantenimiento"),
            "total_multas": sum(g["monto"] for g in todos if g["tipo"] == "Multa")
        }
        logger.info(f"Reporte unificado generado correctamente para {patente_norm}: {len(todos)} registros")
        return respuesta

    except Exception as e:
        logger.error(f"Error crítico generando respuesta para {patente_norm}: {e}")
        # Nunca devolvemos null → siempre un objeto válido
        return {
            "gastos": [],
            "total_general": 0,
            "total_mantenimiento": 0,
            "total_multas": 0
        }


# ==================== ELIMINAR GASTO UNIVERSAL ====================
@router.delete("/universal/{gasto_id}")
async def borrar_gasto_universal(
    gasto_id: str,
    origen: str = Query(..., description="Colección: 'costos' (mantenimiento) o 'finanzas' (multas)")
):
    try:
        obj_id = ObjectId(gasto_id)
    except Exception as e:
        logger.error(f"ID inválido: {gasto_id} - Error: {e}")
        raise HTTPException(400, "ID inválido")

    collection_name = "costos" if origen.lower() == "costos" else "finanzas"
    collection = get_db_collection("Mantenimiento" if collection_name == "costos" else "Finanzas")

    result = await collection.delete_one({"_id": obj_id})
    if result.deleted_count == 0:
        logger.warning(f"Gasto no encontrado: {gasto_id} en {collection_name}")
        raise HTTPException(404, "Gasto no encontrado")

    logger.info(f"Gasto eliminado correctamente: {gasto_id} ({collection_name})")
    return {"message": "Gasto eliminado correctamente"}