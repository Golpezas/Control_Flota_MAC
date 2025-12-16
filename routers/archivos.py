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
async def subir_documento(
    patente: str = Form(...),
    tipo: str = Form(...),  # ← NUEVO: obligatorio
    file: UploadFile = File(...)
):
    logger.info(f"Subiendo {tipo} para patente: {patente}, archivo: {file.filename}")

    normalized_patente = normalize_patente(patente)

    # Opcional: validación de tipos permitidos
    tipos_permitidos = {
        "TITULO_AUTOMOTOR", "CEDULA_AZUL", "CEDULA_VERDE",
        "POLIZA_SEGURO", "VTV", "RUTA", "OTRO"
    }
    if tipo not in tipos_permitidos:
        raise HTTPException(400, f"Tipo de documento no válido: {tipo}")

    allowed_types = {"application/pdf", "image/jpeg", "image/jpg", "image/png"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Solo PDF, JPG o PNG")

    if file.size > 50 * 1024 * 1024:
        raise HTTPException(413, "Archivo muy grande (máx 50MB)")

    try:
        content = await file.read()
        bucket = await get_gridfs_bucket()
        file_id = await bucket.upload_from_stream(  # ← Mejor usar upload_from_stream para async
            file.filename,
            content,
            metadata={
                "patente": normalized_patente,
                "tipo": tipo,  # ← Guardamos el tipo en metadata
                "uploaded_at": datetime.utcnow(),
                "original_filename": file.filename,
                "content_type": file.content_type
            }
        )

        logger.info(f"Documento {tipo} subido: file_id={file_id}")
        return {
            "message": "Documento subido correctamente",
            "file_id": str(file_id),
            "tipo": tipo,
            "filename": file.filename
        }

    except Exception as e:
        logger.error(f"Error subiendo documento: {str(e)}")
        raise HTTPException(500, "Error interno al subir el documento")


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