# routers/polizas.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse
from dependencies import get_db_collection, get_gridfs_bucket, normalize_patente
from bson import ObjectId
from datetime import datetime
import logging
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/polizas", tags=["Pólizas de Seguros"])

# Modelo simple
class PolizaResponse(BaseModel):
    id: str
    empresa: str
    numero_poliza: str
    filename: str
    file_id: str
    fecha_subida: datetime

class PolizaInput(BaseModel):
    empresa: str = Field(..., description="Nombre de la empresa de seguros")
    numero_poliza: str = Field(..., description="Número único de póliza")

@router.get("/", response_model=list[PolizaResponse])
async def listar_polizas():
    collection = get_db_collection("polizas_seguros")
    polizas = await collection.find().sort("fecha_subida", -1).to_list(100)
    return [
        PolizaResponse(
            id=str(p["_id"]),
            empresa=p["empresa"],
            numero_poliza=p["numero_poliza"],
            filename=p["filename"],
            file_id=p["file_id"],
            fecha_subida=p["fecha_subida"]
        ) for p in polizas
    ]

@router.post("/", response_model=PolizaResponse)
async def agregar_poliza(
    empresa: str = Form(...),
    numero_poliza: str = Form(...),
    file: UploadFile = File(...)
):
    # Validación básica
    if file.content_type not in {"application/pdf", "image/jpeg", "image/jpg", "image/png"}:
        raise HTTPException(400, "Solo PDF, JPG o PNG")

    collection = get_db_collection("polizas_seguros")
    bucket = await get_gridfs_bucket()

    # Verificar si ya existe esa póliza (opcional, para evitar duplicados)
    existing = await collection.find_one({"numero_poliza": numero_poliza})
    if existing:
        raise HTTPException(400, f"Póliza {numero_poliza} ya existe")

    # Subir archivo
    content = await file.read()
    file_id = await bucket.upload_from_stream(
        file.filename,
        content,
        metadata={"empresa": empresa, "numero_poliza": numero_poliza}
    )

    # Guardar en colección
    poliza_doc = {
        "empresa": empresa.strip(),
        "numero_poliza": numero_poliza.strip(),
        "filename": file.filename,
        "file_id": str(file_id),
        "fecha_subida": datetime.utcnow()
    }

    result = await collection.insert_one(poliza_doc)

    return PolizaResponse(
        id=str(result.inserted_id),
        empresa=poliza_doc["empresa"],
        numero_poliza=poliza_doc["numero_poliza"],
        filename=poliza_doc["filename"],
        file_id=poliza_doc["file_id"],
        fecha_subida=poliza_doc["fecha_subida"]
    )

@router.put("/{poliza_id}", response_model=PolizaResponse)
async def modificar_poliza(
    poliza_id: str,
    empresa: str = Form(...),
    numero_poliza: str = Form(...),
    file: Optional[UploadFile] = File(None)
):
    collection = get_db_collection("polizas_seguros")

    update_data = {
        "empresa": empresa.strip(),
        "numero_poliza": numero_poliza.strip()
    }

    if file:
        if file.content_type not in {"application/pdf", "image/jpeg", "image/jpg", "image/png"}:
            raise HTTPException(400, "Solo PDF, JPG o PNG")

        bucket = await get_gridfs_bucket()
        content = await file.read()
        file_id = await bucket.upload_from_stream(
            file.filename,
            content,
            metadata={"empresa": empresa, "numero_poliza": numero_poliza}
        )
        update_data["filename"] = file.filename
        update_data["file_id"] = str(file_id)

    result = await collection.update_one(
        {"_id": ObjectId(poliza_id)},
        {"$set": update_data}
    )

    if result.modified_count == 0:
        raise HTTPException(404, "Póliza no encontrada")

    poliza = await collection.find_one({"_id": ObjectId(poliza_id)})
    return PolizaResponse(
        id=str(poliza["_id"]),
        **{k: poliza[k] for k in ["empresa", "numero_poliza", "filename", "file_id", "fecha_subida"]}
    )

@router.delete("/{poliza_id}")
async def eliminar_poliza(poliza_id: str):
    collection = get_db_collection("polizas_seguros")
    bucket = await get_gridfs_bucket()

    poliza = await collection.find_one({"_id": ObjectId(poliza_id)})
    if not poliza:
        raise HTTPException(404, "Póliza no encontrada")

    # Eliminar archivo de GridFS
    await bucket.delete(ObjectId(poliza["file_id"]))

    # Eliminar registro
    await collection.delete_one({"_id": ObjectId(poliza_id)})

    return {"message": "Póliza eliminada correctamente"}

# Reutiliza tu endpoint de descarga general
# No hace falta uno nuevo, usamos /api/archivos/descargar/{file_id}