# routers/archivos.py
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from gridfs.errors import NoFile as GridFSNoFile
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
import gridfs
import gridfs.errors
from io import BytesIO
from datetime import datetime
import logging
from dependencies import normalize_patente, get_gridfs_bucket, get_db_collection
import gridfs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/archivos", tags=["Archivos Digitales"])

# Nota: Es mejor usar get_db_collection de dependencies, pero mantenemos tu init global por ahora si te funciona
client = MongoClient(os.getenv("MONGO_URI"))
db = client["MacSeguridadFlota"]
fs = gridfs.GridFS(db)

@router.post("/subir-documento", status_code=status.HTTP_201_CREATED)
async def subir_documento(
    patente: str = Form(...),
    tipo: str = Form(...),
    file: UploadFile = File(...)
):
    logger.info(f"Subiendo {tipo} para patente: {patente}, archivo: {file.filename}")

    normalized_patente = normalize_patente(patente)

    # Validaciones
    allowed_types = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Solo PDF, JPG o PNG")

    if file.size > 50 * 1024 * 1024:
        raise HTTPException(413, "Archivo muy grande")

    try:
        # 1. Verificar si el vehículo existe antes de subir nada
        vehiculos_collection = get_db_collection("Vehiculos")
        vehiculo = await vehiculos_collection.find_one({"_id": normalized_patente})
        if not vehiculo:
            raise HTTPException(404, f"Vehículo {normalized_patente} no encontrado")

        # 2. Subir archivo a GridFS
        content = await file.read()
        bucket = await get_gridfs_bucket()
        file_id = await bucket.upload_from_stream(
            file.filename,
            content,
            metadata={
                "patente": normalized_patente,
                "tipo": tipo,
                "uploaded_at": datetime.utcnow()
            }
        )

        logger.info(f"Documento {tipo} subido a GridFS: file_id={file_id}")

        # === 3. LÓGICA DE ACTUALIZACIÓN DEL ARRAY (CORREGIDA) ===
        
        # INTENTO A: Actualizar si ya existe el tipo en el array
        # Usamos el operador posicional $ para actualizar el elemento que coincida
        result_update = await vehiculos_collection.update_one(
            {
                "_id": normalized_patente, 
                "documentos_digitales.tipo": tipo  # Busca si existe este tipo específico dentro del array
            },
            {
                "$set": {
                    "documentos_digitales.$.file_id": str(file_id),
                    "documentos_digitales.$.nombre_archivo": file.filename,
                    "documentos_digitales.$.fecha_subida": datetime.utcnow(),
                    "documentos_digitales.$.existe_fisicamente": True
                }
            }
        )

        # INTENTO B: Si no se modificó nada (matched_count == 0), significa que no existía. Lo agregamos (PUSH).
        if result_update.matched_count == 0:
            logger.info(f"Tipo {tipo} no existía en {normalized_patente}. Creando nueva entrada...")
            
            nuevo_doc = {
                "tipo": tipo,
                "file_id": str(file_id),
                "nombre_archivo": file.filename,
                "path_esperado": None,
                "existe_fisicamente": True,
                "fecha_subida": datetime.utcnow(),
                "fecha_vencimiento": None # Se llenará después desde el frontend si aplica
            }
            
            await vehiculos_collection.update_one(
                {"_id": normalized_patente},
                {"$push": {"documentos_digitales": nuevo_doc}}
            )

        logger.info(f"Vehículo {normalized_patente} actualizado correctamente.")

        return {
            "message": "Documento subido correctamente",
            "file_id": str(file_id),
            "tipo": tipo,
            "filename": file.filename
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(500, f"Error al subir el documento: {str(e)}")

@router.get("/descargar/{file_id}")
async def descargar_archivo(
    file_id: str,
    preview: bool = Query(False, description="True = vista previa inline")
):
    try:
        object_id = ObjectId(file_id)
    except InvalidId:
        raise HTTPException(400, "ID de archivo inválido")

    bucket = await get_gridfs_bucket()

    try:
        grid_out = await bucket.open_download_stream(object_id)
    except:
        raise HTTPException(404, "Archivo no encontrado")

    filename = grid_out.filename or "comprobante"
    content_type = grid_out.metadata.get("content_type") if grid_out.metadata else None
    
    # Fallback si GridFS no guardó el content_type
    if not content_type:
         content_type = "application/pdf" if filename.lower().endswith(".pdf") else "image/jpeg"

    if preview:
        disposition = "inline"
        headers = {
            "Content-Disposition": f'inline; filename="{filename}"',
            "Content-Type": content_type,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": "bytes",
        }
    else:
        disposition = "attachment"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": content_type,
        }

    return StreamingResponse(
        grid_out,
        headers=headers,
        media_type=content_type
    )

@router.delete("/eliminar/{file_id}")
async def eliminar_archivo(file_id: str):
    try:
        await run_in_threadpool(fs.delete, ObjectId(file_id))
        return {"message": "Eliminado"}
    except:
        raise HTTPException(404, "No encontrado")