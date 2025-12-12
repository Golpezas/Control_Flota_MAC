# routers/costos.py → VERSIÓN CORREGIDA PARA GRIDFS ASÍNCRONO (2025-12-12)
# Eliminamos gridfs síncrono → usamos AsyncIOMotorGridFS de Motor (nativo y compatible)

import os
from datetime import datetime, date

from fastapi import APIRouter, Query, HTTPException, Form, UploadFile, File, Request
from pydantic import BaseModel

from bson import ObjectId
import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket  # ← NUEVO: GridFS async
# from gridfs import GridFS  ← ELIMINADO (era síncrono e incompatible)

from dependencies import get_db_collection, CostoManualInput

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/costos", tags=["Costos"])

# =================================================================
# CONFIGURACIÓN GLOBAL DE GRIDFS ASÍNCRONO (recomendado por Motor)
# =================================================================
_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = _client["MacSeguridadFlota"]

# ← CORREGIDO: Usamos AsyncIOMotorGridFSBucket (async nativo)
fs = AsyncIOMotorGridFSBucket(db)  # ¡Esto es async y compatible con Motor!

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

@router.post("/manual", response_model=CreateCostoResponse)
async def create_costo_manual(
    request: Request,
    patente: str = Form(...),
    tipo_costo: str = Form(...),
    fecha: str = Form(...),
    descripcion: str = Form(...),
    importe: float = Form(..., gt=0),
    origen: str = Form(..., pattern="^(Finanzas|Mantenimiento)$"),
    comprobante: UploadFile | None = File(None),
):
    """
    Crea un costo manual con recibo digital opcional.
    - Validación manual (requerida para multipart con UploadFile).
    - Logging completo para trazabilidad.
    - Atomicidad y manejo seguro de binarios.
    """
    logger.info("=== NUEVA SOLICITUD POST /costos/manual ===")
    logger.info(f"IP: {request.client.host if request.client else 'unknown'}")
    logger.info(f"Content-Type: {request.headers.get('content-type')}")

    if comprobante:
        logger.info(f"Archivo recibido: filename='{comprobante.filename}', type='{comprobante.content_type}', size={comprobante.size}")
    else:
        logger.warning("Sin archivo adjunto")

    # ← VALIDACIÓN MANUAL (reemplaza CostoManualInput)
    try:
        fecha_parsed = date.fromisoformat(fecha)
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida (formato YYYY-MM-DD requerido)")

    if importe <= 0:
        raise HTTPException(status_code=400, detail="Importe debe ser mayor a 0")

    if origen not in ["Finanzas", "Mantenimiento"]:
        raise HTTPException(status_code=400, detail="Origen debe ser 'Finanzas' o 'Mantenimiento'")

    # Datos normalizados para insert
    insert_data = {
        "patente": patente.strip().upper(),
        "tipo_costo": tipo_costo,
        "fecha": datetime.combine(fecha_parsed, datetime.min.time()),
        "descripcion": descripcion,
        "importe": importe,
        "origen": origen,
        "origen_manual": True,
    }

    collection = get_db_collection("Mantenimiento" if origen == "Mantenimiento" else "Finanzas")

    file_id = None
    if comprobante:
        allowed_types = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
        if comprobante.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Tipo de archivo no permitido (solo PDF, JPG, PNG)")

        if comprobante.size > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Archivo demasiado grande (máx 50MB)")

        try:
            content = await comprobante.read()
            logger.info(f"Archivo leído: {len(content)} bytes")

            grid_in = await fs.put(
                content,
                filename=comprobante.filename,
                content_type=comprobante.content_type,
                metadata={
                    "patente": patente,
                    "tipo": "comprobante_costo",
                    "uploaded_at": datetime.utcnow(),
                },
            )
            file_id = str(grid_in)
            logger.info(f"✅ Archivo subido a GridFS: {file_id}")
        except Exception as e:
            logger.error(f"Error en GridFS: {e}")
            raise HTTPException(status_code=500, detail="Error al guardar el comprobante")

    if file_id:
        insert_data["comprobante_file_id"] = file_id

    try:
        result = await collection.insert_one(insert_data)
        logger.info(f"✅ Costo creado: _id={result.inserted_id}, file_id={file_id}")
    except Exception as e:
        logger.error(f"Error insertando en MongoDB: {e}")
        raise HTTPException(status_code=500, detail="Error al guardar el costo")

    return CreateCostoResponse(
        message="Costo creado correctamente",
        costo_id=str(result.inserted_id),
        file_id=file_id,
    )
    
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