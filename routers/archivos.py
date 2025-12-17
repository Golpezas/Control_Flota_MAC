# routers/archivos.py
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool   # ← NUEVO IMPORT
from gridfs.errors import NoFile as GridFSNoFile
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
import gridfs
import gridfs.errors
from io import BytesIO
from datetime import datetime
import logging
from dependencies import normalize_patente, get_gridfs_bucket, get_db_collection  # ← Asegura imports
import gridfs  # si usas gridfs.errors.NoFile

logger = logging.getLogger(__name__)  # ← Definición clave que resuelve Pylance

router = APIRouter(prefix="/api/archivos", tags=["Archivos Digitales"])

client = MongoClient(os.getenv("MONGO_URI"))
db = client["MacSeguridadFlota"]
fs = gridfs.GridFS(db)  # Instancia global

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

        # === ACTUALIZAR EL VEHÍCULO EN LA COLECCIÓN ===
        vehiculos_collection = get_db_collection("Vehiculos")  # Cambia si tu colección tiene otro nombre

        result = await vehiculos_collection.update_one(
            {"_id": normalized_patente},
            {
                "$set": {
                    "documentos_digitales.$[doc].file_id": str(file_id),
                    "documentos_digitales.$[doc].nombre_archivo": file.filename,
                    "documentos_digitales.$[doc].existe_fisicamente": True
                }
            },
            array_filters=[{"doc.tipo": tipo}]
        )

        if result.modified_count == 0:
            logger.warning(f"No se encontró el tipo {tipo} en documentos_digitales de {normalized_patente}")
            # Opcional: si no existe, podrías crearlo con $push, pero por ahora asumimos que ya está definido

        logger.info(f"Vehículo actualizado: {result.modified_count} documentos modificados")

        return {
            "message": "Documento subido correctamente",
            "file_id": str(file_id),
            "tipo": tipo,
            "filename": file.filename
        }

    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(500, "Error al subir el documento")

@router.get("/descargar/{file_id}")
async def descargar_archivo(
    file_id: str,
    preview: bool = Query(False, description="True = vista previa inline")
):
    try:
        object_id = ObjectId(file_id)
    except InvalidId:
        raise HTTPException(400, "ID de archivo inválido")

    try:
        # fs es tu GridFS bucket (asumiendo que lo tienes global o inyectado)
        grid_out = await run_in_threadpool(fs.get, object_id)
    except GridFSNoFile:
        raise HTTPException(404, "Archivo no encontrado")

    try:
        # Leemos todo el contenido
        content = await run_in_threadpool(grid_out.read)

        filename = grid_out.filename or "documento"
        content_type = grid_out.content_type or "application/octet-stream"

        # FORZAMOS PREVIEW CON HEADERS ESPECÍFICOS
        if preview:
            disposition = "inline"
            extra_headers = {
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
                "Accept-Ranges": "bytes",
            }
        else:
            disposition = "attachment"
            extra_headers = {}

        headers = {
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Content-Type": content_type,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            **extra_headers
        }

        return StreamingResponse(
            BytesIO(content),
            headers=headers,
            media_type=content_type
        )

    except Exception as e:
        logger.error(f"ERROR DESCARGA GRIDFS: {type(e).__name__}: {e}")
        raise HTTPException(500, "Error al leer el archivo")


@router.delete("/eliminar/{file_id}")
async def eliminar_archivo(file_id: str):
    try:
        await run_in_threadpool(fs.delete, ObjectId(file_id))
        return {"message": "Eliminado"}
    except:
        raise HTTPException(404, "No encontrado")