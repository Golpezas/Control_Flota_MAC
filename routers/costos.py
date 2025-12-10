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
    logger.info(f"Reporte unificado solicitado para: {patente_norm}")

    try:
        costos_collection = get_db_collection("Mantenimiento")
        finanzas_collection = get_db_collection("Finanzas")
    except Exception as e:
        logger.error(f"Error conectando colecciones: {e}")
        raise HTTPException(500, "Error de base de datos")

    # ==================== MANTENIMIENTOS ====================
    mantenimientos = []
    try:
        raw = await costos_collection.find({"patente": patente_norm}).to_list(1000)
        for m in raw:
            try:
                tipo = m.get("motivo") or m.get("tipo_registro") or "Mantenimiento General"
                mantenimientos.append({
                    "id": str(m["_id"]),
                    "fecha": m.get("fecha", "1970-01-01T00:00:00"),
                    "tipo": tipo.strip(),
                    "monto": float(m.get("costo_monto") or 0),
                    "descripcion": m.get("descripcion") or m.get("DESCRIPCION") or "",
                    "comprobante_file_id": m.get("comprobante_file_id"),
                    "origen": "mantenimiento"
                })
            except Exception as e:
                logger.warning(f"Mantenimiento corrupto {m.get('_id')}: {e}")
    except Exception as e:
        logger.error(f"Error leyendo Mantenimiento: {e}")
        mantenimientos = []

    # ==================== MULTAS (AHORA TIPO SIEMPRE CORRECTO) ====================
    multas = []
    try:
        raw = await finanzas_collection.find({
            "patente": patente_norm,
            "MONTO": {"$gt": 0}
        }).to_list(1000)  # Ya no filtramos por regex, todo con MONTO > 0 es potencial multa

        for f in raw:
            try:
                # Determinamos si es multa por varios campos posibles
                es_multa = (
                    str(f.get("tipo_registro", "")).lower().find("infracc") != -1 or
                    str(f.get("motivo", "")).lower().find("multa") != -1 or
                    str(f.get("motivo", "")).lower().find("exceso") != -1 or
                    str(f.get("motivo", "")).lower().find("velocidad") != -1
                )

                tipo = "Multa" if es_multa else "Otro Gasto Financiero"

                fecha = (
                    f.get("fecha_infraccion") or
                    f.get("FECHA_INFRACCIN") or
                    f.get("fecha") or
                    "1970-01-01T00:00:00"
                )

                multas.append({
                    "id": str(f["_id"]),
                    "fecha": fecha,
                    "tipo": tipo,  # ← Siempre llega "Multa" o algo claro
                    "monto": float(f.get("MONTO") or 0),
                    "descripcion": str(f.get("motivo") or f.get("descripcion") or "Infracción de tránsito").strip(),
                    "comprobante_file_id": f.get("comprobante_file_id"),
                    "origen": "finanzas"
                })
            except Exception as e:
                logger.warning(f"Multa corrupta {f.get('_id')}: {e}")
                continue
    except Exception as e:
        logger.error(f"Error leyendo Finanzas: {e}")
        multas = []

    # ==================== RESPUESTA FINAL ====================
    try:
        todos = mantenimientos + multas
        todos.sort(key=lambda x: x["fecha"], reverse=True)

        respuesta = {
            "gastos": todos,
            "total_general": sum(g["monto"] for g in todos),
            "total_mantenimiento": sum(g["monto"] for g in todos if g["origen"] == "mantenimiento"),
            "total_multas": sum(g["monto"] for g in todos if g["tipo"] == "Multa")
        }
        logger.info(f"Reporte exitoso {patente_norm}: {len(todos)} items")
        return respuesta
    except Exception as e:
        logger.error(f"Error final {patente_norm}: {e}")
        return {"gastos": [], "total_general": 0, "total_mantenimiento": 0, "total_multas": 0}


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