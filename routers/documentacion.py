# routers/documentacion.py

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
        raise HTTPException(status_code=404, detail="No se encontraron documentos para esta patente")

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
    tipo_documento: str = Path(..., description="Tipo de documento, ej: Poliza_Detalle"),
    data: VencimientoUpdate = None
):
    """
    Actualiza SOLO la fecha de vencimiento de un documento específico.
    Ideal para corregir alertas cuando se renueva una póliza.
    """
    normalized_patente = normalize_patente(patente)
    collection = get_db_collection("Documentacion")

    result = await collection.update_one(
        {
            "patente": normalized_patente,
            "tipo_documento": tipo_documento
        },
        {"$set": {"fecha_vencimiento": data.fecha_vencimiento}}
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró documento {tipo_documento} para la patente {patente}"
        )

    logger.info(f"Fecha de vencimiento actualizada: {patente} - {tipo_documento} → {data.fecha_vencimiento}")
    return {"message": "Fecha de vencimiento actualizada correctamente"}

# =============================================================================
# OPCIONAL: Agregar nuevo documento (si querés permitir crear desde la app)
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