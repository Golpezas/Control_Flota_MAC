# routers/polizas.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse
from dependencies import get_db_collection, get_gridfs_bucket, normalize_patente
from bson import ObjectId
from datetime import datetime
import logging
from pydantic import BaseModel, Field
from typing import Optional, List

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/polizas", tags=["Pólizas de Seguros"])

# ==========================================
# MODELOS
# ==========================================
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

class PolizaFinancieraUpdate(BaseModel):
    suma_asegurada: float
    costo_mensual: float
    costo_semestral: float
    monto_franquicia: float

# ==========================================
# ENDPOINTS DE ARCHIVOS (GridFS)
# ==========================================
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
    if file.content_type not in {"application/pdf", "image/jpeg", "image/jpg", "image/png"}:
        raise HTTPException(400, "Solo PDF, JPG o PNG")

    collection = get_db_collection("polizas_seguros")
    bucket = await get_gridfs_bucket()

    existing = await collection.find_one({"numero_poliza": numero_poliza})
    if existing:
        raise HTTPException(400, f"Póliza {numero_poliza} ya existe")

    content = await file.read()
    file_id = await bucket.upload_from_stream(
        file.filename,
        content,
        metadata={"empresa": empresa, "numero_poliza": numero_poliza}
    )

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

@router.put("/{poliza_id}")
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
        new_file_id = await bucket.upload_from_stream(
            file.filename,
            content,
            metadata={"empresa": empresa, "numero_poliza": numero_poliza}
        )
        update_data["filename"] = file.filename
        update_data["file_id"] = str(new_file_id)

    result = await collection.update_one(
        {"_id": ObjectId(poliza_id)},
        {"$set": update_data}
    )

    if result.modified_count == 0:
        raise HTTPException(404, "Póliza no encontrada")

    poliza = await collection.find_one({"_id": ObjectId(poliza_id)})
    return {
        "id": str(poliza["_id"]),
        "empresa": poliza["empresa"],
        "numero_poliza": poliza["numero_poliza"],
        "filename": poliza["filename"],
        "file_id": poliza["file_id"],
        "fecha_subida": poliza["fecha_subida"]
    }

@router.delete("/{poliza_id}")
async def eliminar_poliza(poliza_id: str):
    collection = get_db_collection("polizas_seguros")
    bucket = await get_gridfs_bucket()

    poliza = await collection.find_one({"_id": ObjectId(poliza_id)})
    if not poliza:
        raise HTTPException(404, "Póliza no encontrada")

    await bucket.delete(ObjectId(poliza["file_id"]))
    await collection.delete_one({"_id": ObjectId(poliza_id)})

    return {"message": "Póliza eliminada correctamente"}

# ==========================================
# ENDPOINT DE COSTOS FINANCIEROS POR VEHÍCULO
# ==========================================
@router.put("/vehiculo/{patente}/financiero", summary="Actualiza los datos financieros del seguro de un vehículo")
async def actualizar_poliza_financiera(patente: str, data: PolizaFinancieraUpdate):
    patente_norm = normalize_patente(patente)
    db_vehiculos = get_db_collection("Vehiculos")

    # Intentamos actualizar el documento existente
    result = await db_vehiculos.update_one(
        {"_id": patente_norm},
        {
            "$set": {
                "documentos_digitales.$[elem].suma_asegurada": data.suma_asegurada,
                "documentos_digitales.$[elem].costo_mensual": data.costo_mensual,
                "documentos_digitales.$[elem].costo_semestral": data.costo_semestral,
                "documentos_digitales.$[elem].monto_franquicia": data.monto_franquicia
            }
        },
        array_filters=[{"elem.tipo": {"$in": ["SEGURO", "Poliza_Detalle"]}}]
    )

    # Si no se modificó nada, podría ser porque no existe el array o no tiene el elemento "SEGURO"
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")

    if result.modified_count == 0:
        await db_vehiculos.update_one(
            {"_id": patente_norm},
            {
                "$push": {
                    "documentos_digitales": {
                        "tipo": "SEGURO",
                        "suma_asegurada": data.suma_asegurada,
                        "costo_mensual": data.costo_mensual,
                        "costo_semestral": data.costo_semestral,
                        "monto_franquicia": data.monto_franquicia
                    }
                }
            }
        )

    return {"message": "Datos financieros de la póliza actualizados correctamente"}