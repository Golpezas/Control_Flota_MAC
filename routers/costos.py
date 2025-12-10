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
        logger.info(f"Mantenimientos encontrados: {len(raw)}")
        for m in raw:
            try:
                tipo = m.get("motivo") or m.get("tipo_registro") or "Mantenimiento General"
                mantenimientos.append({
                    "id": str(m["_id"]),
                    "fecha": m.get("fecha", "1970-01-01T00:00:00"),
                    "tipo": tipo.strip(),
                    "monto": float(m.get("costo_monto") or 0),
                    "descripcion": m.get("descripcion") or m.get("DESCRIPCIN") or "",
                    "comprobante_file_id": m.get("comprobante_file_id"),
                    "origen": "mantenimiento"
                })
            except Exception as e:
                logger.warning(f"Mantenimiento corrupto {m.get('_id')}: {e}")
    except Exception as e:
        logger.error(f"Error leyendo Mantenimiento: {e}")
        mantenimientos = []

    # ==================== MULTAS (CAPTURA TODOS + CLASIFICA) ====================
    multas = []
    try:
        raw = await finanzas_collection.find({
            "patente": patente_norm,
            "MONTO": {"$gt": 0}
        }).to_list(1000)
        logger.info(f"Finanzas encontrados: {len(raw)}")

        for f in raw:
            try:
                # Regex expandido para detectar multas (cubrimos TODOS tus casos)
                motivo_str = str(f.get("motivo") or "").lower()
                tipo_reg = str(f.get("tipo_registro") or "").lower()
                es_multa = any(word in (motivo_str + tipo_reg) for word in [
                    "multa", "infracci", "exceso", "velocidad", "semaforo", "semáforo",
                    "gastos administrativo", "acta", "rojo", "no respetar"
                ])

                tipo = "Multa" if es_multa else "Otro Financiero"

                fecha = (
                    f.get("fecha_infraccion") or
                    f.get("FECHA_INFRACCIN") or
                    f.get("fecha") or
                    "1970-01-01T00:00:00"
                )

                descripcion = str(f.get("motivo") or f.get("descripcion") or "Infracción de tránsito").strip()

                multas.append({
                    "id": str(f["_id"]),
                    "fecha": fecha,
                    "tipo": tipo,  # Siempre definido
                    "monto": float(f.get("MONTO") or 0),
                    "descripcion": descripcion,
                    "comprobante_file_id": f.get("comprobante_file_id"),
                    "origen": "finanzas"
                })
            except Exception as e:
                logger.warning(f"Finanza corrupta {f.get('_id')}: {e}")
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
        logger.info(f"Reporte exitoso {patente_norm}: {len(todos)} items, total {respuesta['total_general']}")
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