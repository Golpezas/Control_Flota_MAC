# routers/archivos.py
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool   # ← NUEVO IMPORT
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
import gridfs
from io import BytesIO
from dependencies import normalize_patente

router = APIRouter(prefix="/api/archivos", tags=["Archivos Digitales"])

client = MongoClient(os.getenv("MONGO_URI"))
db = client["MacSeguridadFlota"]
fs = gridfs.GridFS(db)  # Instancia global


@router.post("/subir-documento", status_code=status.HTTP_201_CREATED)
async def subir_documento(patente: str = Form(...), file: UploadFile = File(...)):
    normalized_patente = normalize_patente(patente)
    allowed_types = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Solo PDF, JPG o PNG")
    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(413, "Archivo muy grande")

    file_id = fs.put(
        await file.read(),
        filename=file.filename,
        content_type=file.content_type,
        metadata={"patente": normalized_patente}
    )
    return {"message": "OK", "file_id": str(file_id), "filename": file.filename}


@router.get("/descargar/{file_id}")
async def descargar_archivo(
    file_id: str,
    preview: bool = Query(False, description="True = vista previa, False = descarga")
):
    try:
        grid_out = await run_in_threadpool(fs.get, ObjectId(file_id))
        content = await run_in_threadpool(grid_out.read)
        
        filename = grid_out.filename or "documento"
        disposition = "inline" if preview else "attachment"
        
        headers = {
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Content-Type": grid_out.content_type or "application/octet-stream",
        }

        return StreamingResponse(BytesIO(content), headers=headers, media_type=grid_out.content_type)

    except gridfs.errors.NoFile:
        raise HTTPException(404, "Archivo no encontrado")
    except InvalidId:
        raise HTTPException(400, "ID inválido")
    except Exception as e:
        print(f"ERROR DESCARGA: {e}")
        raise HTTPException(500, "Error al leer archivo")


@router.delete("/eliminar/{file_id}")
async def eliminar_archivo(file_id: str):
    try:
        await run_in_threadpool(fs.delete, ObjectId(file_id))
        return {"message": "Eliminado"}
    except:
        raise HTTPException(404, "No encontrado")