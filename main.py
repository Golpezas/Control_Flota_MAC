from fastapi import FastAPI, HTTPException, status, Query
from dependencies import UpdateMonto, get_db_collection, connect_to_mongodb
from bson.objectid import ObjectId
from routers import flota 
from typing import List, Optional, Any
from fastapi.middleware.cors import CORSMiddleware
from routers.archivos import router as archivos_router  # ← ya tiene prefix="/api/archivos"

# =========================================================================
# INSTANCIA DE FASTAPI
# =========================================================================

app = FastAPI(
    title="Control de Flota - API",
    description="API de gestión y monitoreo de flota vehicular. Base para una herramienta web/móvil.",
    version="1.0.0",
)

# 🔥 ORDEN CORRECTO: PRIMERO EL CORS, DESPUÉS LOS ROUTERS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "*"],  # * solo en desarrollo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ahora sí: incluir los routers DESPUÉS del middleware
app.include_router(archivos_router)                    # ← tiene prefix="/api/archivos" dentro
app.include_router(flota.router, prefix="")            # ← tu router principal

# =========================================================================
# EVENTO DE INICIO: CONEXIÓN A MONGODB
# =========================================================================

@app.on_event("startup")
def startup_db_client():
    connect_to_mongodb()
    print("Conexión a MongoDB Atlas exitosa.")  # ← opcional: para ver en terminal

# =========================================================================
# ENDPOINTS GLOBALES
# =========================================================================

@app.get("/", tags=["General"], summary="Estado de la API")
def read_root():
    return {"status": "ok", "message": "API Control de Flota funcionando correctamente"}

@app.patch(
    "/monto/{collection_name}/{doc_id}",
    response_model=dict,
    summary="Actualizar monto y motivo de un registro",
    tags=["Modificación de Datos"]
)
async def update_monto(collection_name: str, doc_id: str, data: UpdateMonto):
    collection_name = collection_name.lower()
    
    if collection_name == 'finanzas':
        collection = get_db_collection("Finanzas")
    elif collection_name == 'mantenimiento':
        collection = get_db_collection("Mantenimiento")
    else:
        raise HTTPException(status_code=400, detail="Colección no válida.")

    try:
        obj_id = ObjectId(doc_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido.")

    db_monto_field = "MONTO" if collection_name == 'finanzas' else "costo_monto"
    db_motivo_field = "motivo"

    update_fields = {db_monto_field: data.monto}
    if data.motivo is not None:
        update_fields[db_motivo_field] = data.motivo
            
    update_result = collection.update_one(
        {"_id": obj_id},
        {"$set": update_fields}
    )

    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Documento no encontrado: {doc_id}")
    
    return {
        "message": f"Monto actualizado en {collection_name}",
        "modified_count": update_result.modified_count
    }