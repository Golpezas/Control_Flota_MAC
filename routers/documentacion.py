from fastapi import APIRouter, HTTPException, status, Path
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from dateutil.parser import parse
from dependencies import get_db_collection, normalize_patente
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/documentacion",
    tags=["Documentación y Vencimientos"]
)

# =============================================================================
# MODELOS PYDANTIC
# =============================================================================

class DocumentoResponse(BaseModel):
    tipo_documento: str
    fecha_vencimiento: Optional[datetime] = None
    aseguradora: Optional[str] = None
    numero_poliza: Optional[str] = None
    filename: Optional[str] = None  # si tiene archivo asociado
    file_id: Optional[str] = None

class VencimientoUpdate(BaseModel):
    fecha_vencimiento: datetime = Field(..., description="Nueva fecha de vencimiento en formato ISO o legible")

    @classmethod
    def __get_validators__(cls):
        yield cls.validate_fecha

    @classmethod
    def validate_fecha(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return parse(v)
            except Exception:
                raise ValueError("Formato de fecha inválido. Usa YYYY-MM-DD o similar")
        raise ValueError("Fecha debe ser string o datetime")

# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/{patente}", response_model=List[DocumentoResponse])
async def listar_documentos_vehiculo(patente: str = Path(..., description="Patente del vehículo")):
    """
    Lista todos los documentos de vencimiento del vehículo (usado para mostrar y editar fechas).
    """
    normalized_patente = normalize_patente(patente)
    collection = get_db_collection("Documentacion")

    documentos = await collection.find(
        {"patente": normalized_patente},
        {
            "tipo_documento": 1,
            "fecha_vencimiento": 1,
            "aseguradora": 1,
            "numero_poliza": 1,
            "filename": 1,
            "file_id": 1
        }
    ).to_list(None)

    if not documentos:
        # Ya no lanzamos 404 estricto para no romper el frontend si el vehículo no tiene documentos aún
        return []

    return [
        DocumentoResponse(
            tipo_documento=doc["tipo_documento"],
            fecha_vencimiento=doc.get("fecha_vencimiento"),
            aseguradora=doc.get("aseguradora"),
            numero_poliza=doc.get("numero_poliza"),
            filename=doc.get("filename"),
            file_id=doc.get("file_id")
        )
        for doc in documentos
    ]

@router.put("/{patente}/{tipo_documento}")
async def actualizar_fecha_vencimiento(
    patente: str = Path(..., description="Patente del vehículo"),
    tipo_documento: str = Path(..., description="Tipo de documento (SEGURO, Poliza_Detalle, etc.)"),
    data: VencimientoUpdate = None
):
    """
    Actualiza SOLO la fecha de vencimiento. Si el documento no existe en BD, lo crea automáticamente (Upsert).
    """
    normalized_patente = normalize_patente(patente)
    collection = get_db_collection("Documentacion")

    # ────────────────────────────────────────────────
    # Normalización / alias (compatible hacia atrás)
    # ────────────────────────────────────────────────
    tipo_normalizado = tipo_documento.strip()

    # Mapeo de alias conocidos → valor real guardado en BD. Todo apunta a SEGURO ahora.
    alias_to_real = {
        "Poliza_Detalle": "SEGURO",
        "Poliza detalle": "SEGURO",
        "poliza_detalle": "SEGURO",
        "POLIZA_DETALLE": "SEGURO",
        "SEGURO": "SEGURO",
        "VTV": "VTV"
    }

    tipo_busqueda = alias_to_real.get(tipo_normalizado, tipo_normalizado)

    logger.debug(f"PUT vencimiento (Upsert) - patente={normalized_patente}, tipo={tipo_busqueda}")

    # Operación UPSERT: Crea el registro si no existe, actualiza si existe
    result = await collection.update_one(
        {
            "patente": normalized_patente,
            "tipo_documento": tipo_busqueda
        },
        {
            "$set": {
                "fecha_vencimiento": data.fecha_vencimiento
            },
            "$setOnInsert": {
                "patente": normalized_patente,
                "tipo_documento": tipo_busqueda,
                "aseguradora": None,
                "numero_poliza": None,
                "filename": None,
                "file_id": None
            }
        },
        upsert=True
    )

    if result.upserted_id:
        logger.info(f"NUEVO documento creado en BD (Upsert): {normalized_patente} - {tipo_busqueda} → {data.fecha_vencimiento}")
    else:
        logger.info(f"Fecha actualizada en BD: {normalized_patente} - {tipo_busqueda} → {data.fecha_vencimiento}")

    return {"message": "Fecha de vencimiento actualizada correctamente"}

# =============================================================================
# OPCIONAL: Agregar nuevo documento explícitamente
# =============================================================================

class DocumentoCreate(BaseModel):
    tipo_documento: str
    fecha_vencimiento: Optional[datetime] = None
    aseguradora: Optional[str] = None
    numero_poliza: Optional[str] = None

@router.post("/{patente}")
async def crear_documento(
    patente: str,
    data: DocumentoCreate
):
    normalized_patente = normalize_patente(patente)
    collection = get_db_collection("Documentacion")

    doc = data.dict()
    doc["patente"] = normalized_patente

    result = await collection.insert_one(doc)
    logger.info(f"Nuevo documento creado: {normalized_patente} - {data.tipo_documento}")

    return {"id": str(result.inserted_id), "message": "Documento creado correctamente"}