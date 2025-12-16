# routers/archivos.py
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool   # ← NUEVO IMPORT
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
import gridfs
import gridfs.errors
from io import BytesIO
from datetime import datetime
import logging
from dependencies import normalize_patente, get_gridfs_bucket  # ← Asegura imports

logger = logging.getLogger(__name__)  # ← Definición clave que resuelve Pylance

router = APIRouter(prefix="/api/archivos", tags=["Archivos Digitales"])

client = MongoClient(os.getenv("MONGO_URI"))
db = client["MacSeguridadFlota"]
fs = gridfs.GridFS(db)  # Instancia global

@router.post("/subir-documento", status_code=status.HTTP_201_CREATED)
async def subir_documento(patente: str = Form(...), file: UploadFile = File(...)):
    logger.info(f"Intentando subir documento para patente: {patente}, archivo: {file.filename if file else 'None'}")
    
    normalized_patente = normalize_patente(patente)

    # Validaciones (ya existentes, pero normalizadas)
    allowed_types = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
    if file.content_type not in allowed_types:
        logger.warning(f"Tipo inválido: {file.content_type}")
        raise HTTPException(400, "Solo PDF, JPG o PNG")

    if file.size > 50 * 1024 * 1024:
        logger.warning(f"Archivo grande: {file.size}")
        raise HTTPException(413, "Archivo muy grande")

    try:
        content = await file.read()
        bucket = await get_gridfs_bucket()
        file_id = bucket.put(
            content,
            filename=file.filename,
            content_type=file.content_type,
            metadata={"patente": normalized_patente, "uploaded_at": datetime.utcnow()}
        )
        logger.info(f"Subida exitosa: file_id={file_id}, patente={normalized_patente}")
        return {
            "message": "Archivo subido correctamente",
            "file_id": str(file_id),
            "filename": file.filename,
            "content_type": file.content_type
        }
    except Exception as e:
        logger.error(f"Error en subida: {str(e)}")
        raise HTTPException(500, f"Error interno: {str(e)}")


@router.get("/descargar/{file_id}")
async def descargar_archivo(
    file_id: str,
    preview: bool = Query(False, description="True = vista previa inline")
):
    try:
        # Ejecutamos en threadpool porque GridFS es bloqueante
        grid_out = await run_in_threadpool(fs.get, ObjectId(file_id))
        
        # LEEMOS TODO EL ARCHIVO
        content = await run_in_threadpool(grid_out.read)
        
        # RECUPERAMOS EL NOMBRE Y TIPO ORIGINAL
        filename = grid_out.filename or "documento"
        content_type = grid_out.content_type or "application/octet-stream"

        disposition = "inline" if preview else "attachment"

        headers = {
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Content-Type": content_type,           # ← ESTO ES CLAVE
            "Cache-Control": "no-cache",
        }

        return StreamingResponse(
            BytesIO(content),
            headers=headers,
            media_type=content_type                    # ← DOBLE SEGURO
        )

    except gridfs.errors.NoFile:
        raise HTTPException(404, "Archivo no encontrado")
    except InvalidId:
        raise HTTPException(400, "ID inválido")
    except Exception as e:
        print(f"ERROR DESCARGA GRIDFS: {type(e).__name__}: {e}")
        raise HTTPException(500, "Error al leer el archivo")


@router.delete("/eliminar/{file_id}")
async def eliminar_archivo(file_id: str):
    try:
        await run_in_threadpool(fs.delete, ObjectId(file_id))
        return {"message": "Eliminado"}
    except:
        raise HTTPException(404, "No encontrado")