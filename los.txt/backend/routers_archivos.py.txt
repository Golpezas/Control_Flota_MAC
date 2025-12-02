# routers/archivos.py
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse
from pymongo import MongoClient
from bson import ObjectId
import gridfs
from io import BytesIO
from dependencies import normalize_patente  # Asegúrate de que esta función exista

router = APIRouter(prefix="/api/archivos", tags=["Archivos Digitales"])

# Cliente MongoDB usando la misma URI que el resto de la app
client = MongoClient(os.getenv("MONGO_URI"))
db = client["MacSeguridadFlota"]           # Cambia si tu DB tiene otro nombre
fs = gridfs.GridFS(db)

@router.post("/subir-documento", status_code=status.HTTP_201_CREATED)
async def subir_documento(patente: str = Form(...), file: UploadFile = File(...)):
    normalized_patente = normalize_patente(patente)

    # Validaciones de seguridad
    allowed_types = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Solo se permiten PDF, JPG o PNG")

    if file.size and file.size > 50 * 1024 * 1024:  # 50 MB
        raise HTTPException(status_code=413, detail="Archivo demasiado grande (máx 50 MB)")

    try:
        file_id = fs.put(
            await file.read(),
            filename=file.filename,
            content_type=file.content_type,
            metadata={"patente": normalized_patente, "tipo": file.filename.rsplit(".", 1)[0]}
        )
        return {
            "message": "Archivo subido con éxito",
            "file_id": str(file_id),
            "filename": file.filename,
            "patente": normalized_patente
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar: {str(e)}")


@router.get("/descargar/{file_id}")
async def descargar_archivo(file_id: str):
    try:
        grid_file = fs.get(ObjectId(file_id))
        return StreamingResponse(
            BytesIO(grid_file.read()),
            media_type=grid_file.content_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{grid_file.filename}"'}
        )
    except gridfs.errors.NoFile:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al descargar: {str(e)}")


@router.delete("/eliminar/{file_id}")
async def eliminar_archivo(file_id: str):
    try:
        fs.delete(ObjectId(file_id))
        return {"message": "Archivo eliminado correctamente"}
    except gridfs.errors.NoFile:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {str(e)}")