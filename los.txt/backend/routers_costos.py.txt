# routers/costos.py → VERSIÓN CORREGIDA Y DEFINITIVA (2025-12-13)
# Eliminamos inicialización top-level de fs → usamos función lazy async

import os
from datetime import datetime, date
from fastapi import APIRouter, Query, HTTPException, Form, UploadFile, File
from typing import Optional
from dependencies import normalize_patente, get_db_collection, _client, DB_NAME
from bson import ObjectId
import logging
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/costos", tags=["Costos"])

# =================================================================
# FUNCIÓN LAZY PARA OBTENER GRIDFS BUCKET (MEJOR PRÁCTICA MODERNA)
# =================================================================
async def get_gridfs_bucket() -> AsyncIOMotorGridFSBucket:
    """
    Obtiene una instancia de AsyncIOMotorGridFSBucket de forma segura.
    Solo se crea cuando _client ya está conectado (después del startup).
    """
    if _client is None:
        raise HTTPException(status_code=500, detail="Conexión a MongoDB no establecida. Intente más tarde.")
    
    db = _client[DB_NAME]
    return AsyncIOMotorGridFSBucket(db)

# =================================================================
# MODELO DE RESPUESTA
# =================================================================
class CreateCostoResponse(BaseModel):
    message: str
    costo_id: str
    file_id: str | None = None

    model_config = {"extra": "ignore"}

def normalize_patente(patente: str) -> str:
    if not patente:
        return ""
    return patente.strip().upper().replace(" ", "").replace("-", "")

def safe_parse_date(fecha_raw) -> datetime:
    """Parsea fechas con tolerancia extrema a formatos legacy"""
    if isinstance(fecha_raw, datetime):
        return fecha_raw
    if not isinstance(fecha_raw, str) or fecha_raw in ("N/A", "", "0001-01-01T00:00:00"):
        return datetime(1970, 1, 1)  # Fecha neutra para ordenar al final
    try:
        return datetime.fromisoformat(fecha_raw.replace("Z", "+00:00"))
    except:
        try:
            return datetime.strptime(fecha_raw, '%Y-%m-%dT%H:%M:%S')
        except:
            return datetime(1970, 1, 1)

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
        raw_mant = await costos_collection.find({"patente": patente_norm}).to_list(1000)
        for m in raw_mant:
            try:
                fecha = safe_parse_date(m.get("fecha", "1970-01-01T00:00:00"))
                tipo = (m.get("motivo") or m.get("tipo_registro") or "Mantenimiento General").strip()
                monto_raw = m.get("costo_monto") or m.get("COSTO_MONTO") or 0
                monto = float(monto_raw) if monto_raw else 0.0
                descripcion = (m.get("descripcion") or m.get("DESCRIPCIN") or "").strip()

                # FILTRADO ESTRICTO: solo positivos y no administrativos
                if monto <= 0:
                    continue
                if any(palabra in descripcion.lower() for palabra in ["administrativo", "correccion", "ajuste", "devolucion"]):
                    continue

                mantenimientos.append({
                    "id": str(m["_id"]),
                    "fecha": fecha.isoformat(),
                    "tipo": tipo,
                    "monto": monto,
                    "descripcion": descripcion,
                    "origen": "mantenimiento",
                    "coleccion": "Mantenimiento"
                })
            except Exception as e:
                logger.warning(f"Error procesando mantenimiento {m.get('_id')}: {e}")
                continue

    except Exception as e:
        logger.error(f"Error leyendo mantenimientos: {e}")

    # ==================== FINANZAS (Multas, etc.) ====================
    finanzas = []
    try:
        raw_fin = await finanzas_collection.find({"patente": patente_norm}).to_list(1000)
        for f in raw_fin:
            try:
                fecha_raw = f.get("dia") or f.get("FECHA_INFRACCION") or f.get("fecha_infraccion") or "1970-01-01"
                fecha = safe_parse_date(fecha_raw)
                tipo = f.get("tipo_registro", "Multa").strip()
                monto_raw = f.get("monto") or f.get("MONTO") or 0
                monto = float(monto_raw) if monto_raw else 0.0
                descripcion = (f.get("motivo") or f.get("MOTIVO") or "Sin descripción").strip()

                # FILTRADO ESTRICTO
                if monto <= 0:
                    continue
                if any(palabra in descripcion.lower() for palabra in ["administrativo", "correccion", "devolucion", "descuento", "ajuste"]):
                    continue

                finanzas.append({
                    "id": str(f["_id"]),
                    "fecha": fecha.isoformat(),
                    "tipo": tipo,
                    "monto": monto,
                    "descripcion": descripcion,
                    "origen": "finanzas",
                    "coleccion": "Finanzas"
                })
            except Exception as e:
                logger.warning(f"Error procesando finanza {f.get('_id')}: {e}")
                continue

    except Exception as e:
        logger.error(f"Error leyendo finanzas: {e}")

    # ==================== UNIFICACIÓN Y CÁLCULO FINAL ====================
    todos = mantenimientos + finanzas

    # Ordenar por fecha descendente
    todos.sort(key=lambda x: x["fecha"], reverse=True)

    # Cálculo FINAL con datos ya filtrados
    total_general = sum(g["monto"] for g in todos)
    total_mantenimiento = sum(g["monto"] for g in todos if g["origen"] == "mantenimiento")
    total_multas = sum(g["monto"] for g in todos if g["tipo"] in ["Multa", "INFRACCION", "Infracción"])

    respuesta = {
        "patente": patente_norm,
        "gastos": todos,
        "total_general": round(total_general, 2),
        "total_mantenimiento": round(total_mantenimiento, 2),
        "total_multas": round(total_multas, 2),
        "total_otras": round(total_general - total_mantenimiento - total_multas, 2)
    }

    logger.info(f"Reporte exitoso {patente_norm}: {len(todos)} items | Total: ${total_general:,.2f}")
    return respuesta

# =================================================================
# ENDPOINT: CREAR COSTO MANUAL (actualizado para usar get_gridfs_bucket)
# =================================================================
@router.post("/manual")
async def crear_costo_manual(
    patente: str = Form(..., description="Patente del vehículo"),
    tipo_costo: str = Form(..., description="Tipo de gasto"),
    fecha: date = Form(..., description="Fecha del gasto (YYYY-MM-DD)"),
    descripcion: str = Form(..., description="Descripción detallada"),
    importe: float = Form(..., gt=0, description="Monto mayor a cero"),
    origen: str = Form(..., regex="^(Finanzas|Mantenimiento)$", description="Colección destino"),
    comprobante: Optional[UploadFile] = File(None, description="Comprobante opcional")
):
    patente_norm = normalize_patente(patente)
    logger.info(f"Creando costo manual para patente: {patente_norm}")

    collection_name = "Mantenimiento" if origen == "Mantenimiento" else "Finanzas"
    collection = get_db_collection(collection_name)

    documento = {
        "patente": patente_norm,
        "tipo_costo": tipo_costo,
        "fecha": fecha.isoformat(),
        "descripcion": descripcion,
        "importe": round(importe, 2),
        "origen_manual": True,
        "fecha_creacion": datetime.utcnow().isoformat()
    }

    file_id = None
    try:
        if comprobante:
            # Validaciones
            if comprobante.content_type not in ["image/jpeg", "image/jpg", "image/png", "application/pdf"]:
                raise HTTPException(400, "Tipo de archivo no permitido. Solo PDF, JPG, PNG")

            if comprobante.size > 50 * 1024 * 1024:
                raise HTTPException(413, "Archivo demasiado grande (máx 50MB)")

            content = await comprobante.read()

            # ← AQUÍ OBTENEMOS EL BUCKET DE FORMA SEGURA
            fs = await get_gridfs_bucket()

            # Subida async moderna
            file_id = await fs.upload_from_stream(
                filename=comprobante.filename,
                source=content,
                metadata={
                    "patente": patente_norm,
                    "tipo": "comprobante_costo",
                    "tipo_costo": tipo_costo,
                    "fecha": fecha.isoformat()
                }
            )
            documento["comprobante_file_id"] = str(file_id)
            logger.info(f"Comprobante subido a GridFS: {file_id}")

        # Inserción
        result = await collection.insert_one(documento)
        logger.info(f"Costo creado: {result.inserted_id}")

        return {
            "message": "Costo creado exitosamente",
            "costo_id": str(result.inserted_id),
            "file_id": str(file_id) if file_id else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inesperado al crear costo: {type(e).__name__}: {e}")
        raise HTTPException(500, "Error interno al procesar el costo")
    
# ==================== BORRADO UNIVERSAL (CORREGIDO PARA IDs HÍBRIDOS) ====================
@router.delete("/universal/{gasto_id}")
async def borrar_gasto_universal(
    gasto_id: str,
    origen: str = Query(..., description="Colección: 'costos' (mantenimiento) o 'finanzas' (multas)")
):
    """
    Elimina un gasto por ID, manejando tanto ObjectId (costos manuales) como strings UUID (cargados vía ETL).
    - Valida origen estrictamente.
    - Loggea intentos y errores para trazabilidad.
    - Normativa: Cumple con idempotencia (si no existe, 404).
    """
    # Normalización y validación inicial (mejor práctica: early return en errores)
    collection_name = origen.lower()
    if collection_name not in ["costos", "finanzas"]:
        logger.warning(f"Origen inválido intentado: {origen}")
        raise HTTPException(400, "Origen inválido: debe ser 'costos' o 'finanzas'")

    collection = get_db_collection("Mantenimiento" if collection_name == "costos" else "Finanzas")
    
    # Lógica híbrida para _id (try ObjectId primero, fallback a string si falla)
    filter_query = {}
    try:
        obj_id = ObjectId(gasto_id)
        filter_query = {"_id": obj_id}
        logger.info(f"Intentando eliminar como ObjectId: {gasto_id} ({collection_name})")
    except Exception as e:
        filter_query = {"_id": gasto_id}  # Usar directamente como string (UUID u otro)
        logger.info(f"Fallback a string ID (no es ObjectId válido): {gasto_id} ({collection_name}) - Razón: {e}")
    
    # Ejecución asíncrona del delete
    result = await collection.delete_one(filter_query)
    
    if result.deleted_count == 0:
        logger.warning(f"Gasto no encontrado: {gasto_id} en {collection_name}")
        raise HTTPException(404, "Gasto no encontrado")
    
    logger.info(f"Gasto eliminado correctamente: {gasto_id} ({collection_name}) - Fecha: {datetime.now()}")
    return {"message": "Gasto eliminado correctamente"}