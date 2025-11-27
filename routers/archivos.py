# routers/archivos.py

from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
import shutil
from pathlib import Path
from dependencies import normalize_patente

# RUTA BASE (perfecta como la tenías)
MEDIA_ROOT = "C:/Users/Antonio/Documents/Projects/Control_Flota"
DOC_RAIZ_RELATIVO = 'Documentos-Digitales'
DOC_RAIZ = Path(MEDIA_ROOT) / DOC_RAIZ_RELATIVO

# Prefijo correcto
router = APIRouter(
    prefix="/api/archivos",
    tags=["Archivos Digitales"]
)

# =========================================================================
# 1. DESCARGAR → TU CÓDIGO ORIGINAL + 2 PEQUEÑAS MEJORAS (prints + normalización)
# =========================================================================
@router.get("/descargar")
async def descargar_archivo(path_relativo: str = Query(..., alias="path_relativo")):
    # FIX DEFINITIVO: quitamos el prefijo si viene duplicado
    prefix = "Documentos-Digitales"
    if path_relativo.startswith(prefix + "/") or path_relativo.startswith(prefix + "\\"):
        path_relativo = path_relativo[len(prefix):].lstrip("/\\")

    path_relativo = path_relativo.replace("\\", "/").strip("/")

    if ".." in path_relativo or not path_relativo:
        raise HTTPException(status_code=400, detail="Ruta no válida.")

    file_path = (DOC_RAIZ / path_relativo).resolve()

    try:
        file_path.relative_to(DOC_RAIZ)
    except ValueError:
        raise HTTPException(status_code=400, detail="Acceso denegado.")

    if not file_path.is_file():
        print(f"[ERROR] Archivo no encontrado: {file_path}")
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    print(f"[OK] Descargando → {file_path}")
    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type="application/octet-stream"
    )

# =========================================================================
# 2. SUBIR → EXACTAMENTE COMO LO TENÍAS VOS (perfecto)
# =========================================================================
@router.post("/subir-documento", status_code=status.HTTP_201_CREATED)
async def subir_documento(
    patente: str = Form(...),
    file: UploadFile = File(...)
):
    normalized_patente = normalize_patente(patente)
    target_dir = DOC_RAIZ / normalized_patente

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo crear directorio: {e}")

    safe_filename = Path(file.filename).name
    file_path = target_dir / safe_filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar archivo: {e}")
    finally:
        file.file.close()  # ← importantísimo

    path_relativo = str(file_path.relative_to(DOC_RAIZ)).replace('\\', '/')

    return {
        "message": "Archivo subido con éxito",
        "patente": normalized_patente,
        "filename": safe_filename,
        "path_relativo": path_relativo
    }

# =========================================================================
# 3. ELIMINAR → EXACTAMENTE COMO LO TENÍAS (perfecto)
# =========================================================================
@router.delete("/eliminar-archivo")
async def eliminar_archivo(path_relativo: str = Query(..., alias="path_relativo")):
    path_relativo = path_relativo.replace("\\", "/").strip("/")

    if ".." in path_relativo or not path_relativo:
        raise HTTPException(status_code=400, detail="Ruta no válida.")

    file_path = (DOC_RAIZ / path_relativo).resolve()

    try:
        file_path.relative_to(DOC_RAIZ)
    except ValueError:
        raise HTTPException(status_code=400, detail="Acceso denegado.")

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    try:
        file_path.unlink()
        # Limpieza opcional de carpeta vacía
        try:
            file_path.parent.rmdir()
        except OSError:
            pass  # está bien si no está vacía
        print(f"[OK] Archivo eliminado: {file_path.name}")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {e}")

    return {"message": f"Archivo '{file_path.name}' eliminado con éxito"}