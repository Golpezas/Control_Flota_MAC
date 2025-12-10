# routers_costos.py
from fastapi import APIRouter, Query, HTTPException
from bson import ObjectId
import logging
from datetime import datetime

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
async def get_gastos_unificados(
    patente: str,
    start_date: str = Query(None, description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(None, description="Fecha fin (YYYY-MM-DD)")
):
    patente_norm = normalize_patente(patente)
    logger.info(f"Reporte unificado para {patente_norm} (rango: {start_date} - {end_date})")

    try:
        costos_collection = get_db_collection("Mantenimiento")
        finanzas_collection = get_db_collection("Finanzas")
    except Exception as e:
        logger.error(f"Error conectando colecciones: {e}")
        raise HTTPException(500, "Error de base de datos")

    # Filtro fecha común (si proporcionado)
    date_filter = {}
    if start_date:
        date_filter["$gte"] = datetime.fromisoformat(start_date)
    if end_date:
        date_filter["$lte"] = datetime.fromisoformat(end_date)

    # ==================== MANTENIMIENTOS ====================
    mantenimientos = []
    try:
        query = {"patente": patente_norm}
        if date_filter:
            query["fecha"] = date_filter
        raw = await costos_collection.find(query).to_list(100)
        logger.info(f"Mantenimientos encontrados: {len(raw)}")
        for m in raw:
            try:
                fecha_str = m.get("fecha", "1970-01-01T00:00:00")
                fecha = safe_parse_date(fecha_str)

                tipo = m.get("motivo") or m.get("tipo_registro") or "Mantenimiento General"
                monto = float(m.get("costo_monto") or 0)
                descripcion = m.get("descripcion") or ""
                mantenimientos.append({
                    "id": str(m["_id"]),
                    "fecha": fecha.isoformat(),
                    "tipo": tipo.strip(),
                    "monto": monto,
                    "descripcion": descripcion,
                    "comprobante_file_id": m.get("comprobante_file_id"),
                    "origen": "mantenimiento",
                    "status": "Pendiente"  # Asumir no pagados para mantenimiento
                })
            except Exception as e:
                logger.warning(f"Mantenimiento corrupto {m.get('_id')}: {e}")
    except Exception as e:
        logger.error(f"Error leyendo Mantenimiento: {e}")
        mantenimientos = []

    # ==================== MULTAS (CON FILTRO PAGADAS) ====================
    multas = []
    try:
        query = {"patente": patente_norm, "MONTO": {"$gt": 0}}
        if date_filter:
            query["$or"] = [{"fecha_infraccion": date_filter}, {"FECHA_INFRACCIN": date_filter}, {"fecha": date_filter}]
        raw = await finanzas_collection.find(query).to_list(100)
        logger.info(f"Finanzas encontrados: {len(raw)}")

        for f in raw:
            try:
                fecha_str = f.get("fecha_infraccion") or f.get("FECHA_INFRACCIN") or f.get("fecha") or "1970-01-01T00:00:00"
                fecha = safe_parse_date(fecha_str)

                # Clasificar multa
                combined = (str(f.get("motivo", "")) + " " + str(f.get("tipo_registro", ""))).lower()
                es_multa = any(word in combined for word in ["multa", "infracci", "exceso", "velocidad", "semaforo", "gastos", "administrativo", "acta", "rojo", "respetar", "límites", "reglamentarios", "previstos", "77", "44", "51", "28", "22"])

                tipo = "Multa" if es_multa else "Otro Financiero"

                # Chequear si pagada
                status = f.get("STATUS", "Pendiente").lower()
                pago_vol = f.get("PAGO_VOLUNTARIO", "N/A").lower()
                vcmto = f.get("FECHA_DE_VCMTO", "N/A")
                vcmto_date = safe_parse_date(vcmto) if vcmto != "N/A" else None
                es_pagada = (status == "pagada" or pago_vol != "n/a" or (vcmto_date and vcmto_date < datetime.now()))

                status_label = "Pagada" if es_pagada else "Pendiente"

                monto = float(f.get("MONTO") or 0)
                descripcion = str(f.get("motivo") or "Infracción de tránsito").strip()

                multas.append({
                    "id": str(f["_id"]),
                    "fecha": fecha.isoformat(),
                    "tipo": tipo,
                    "monto": monto,
                    "descripcion": descripcion,
                    "comprobante_file_id": f.get("comprobante_file_id"),
                    "origen": "finanzas",
                    "status": status_label
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
        todos.sort(key=lambda x: safe_parse_date(x["fecha"]), reverse=True)

        # Totales solo pendientes
        total_multas_pendientes = sum(g["monto"] for g in todos if g["tipo"] == "Multa" and g["status"] == "Pendiente")

        respuesta = {
            "gastos": todos,
            "total_general": sum(g["monto"] for g in todos if g["status"] == "Pendiente"),
            "total_mantenimiento": sum(g["monto"] for g in todos if g["origen"] == "mantenimiento" and g["status"] == "Pendiente"),
            "total_multas": total_multas_pendientes
        }
        logger.info(f"Reporte exitoso {patente_norm}: {len(todos)} items, total pendiente {respuesta['total_general']}")
        return respuesta
    except Exception as e:
        logger.error(f"Error final {patente_norm}: {e}")
        return {"gastos": [], "total_general": 0, "total_mantenimiento": 0, "total_multas": 0}

# Función helper para parseo seguro
def safe_parse_date(fecha_str):
    if fecha_str == "N/A" or not fecha_str:
        return datetime.min
    try:
        return datetime.fromisoformat(fecha_str)
    except ValueError:
        try:
            return datetime.strptime(fecha_str, '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            return datetime.min

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