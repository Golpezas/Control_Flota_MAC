import logging  # ← NUEVO: Para logs
from typing import Dict, Any  # ← Para typing en response_model
from fastapi import FastAPI, HTTPException, status, Query
from dependencies import UpdateMonto, get_db_collection, connect_to_mongodb
from bson.objectid import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from routers import flota
from routers.archivos import router as archivos_router
from routers.costos import router as costos_router
from routers.documentacion import router as documentacion_router

from routers.polizas import router as polizas_router

# Configura logging básico (mejor práctica para tracing)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# =========================================================================
# INSTANCIA DE FASTAPI
# =========================================================================

app = FastAPI(
    title="Control de Flota - API",
    description="API de gestión y monitoreo de flota vehicular. Base para una herramienta web/móvil.",
    version="1.0.0",
    contact={"name": "Tu Nombre", "email": "tu@email.com"},  # ← MEJORA: Para OpenAPI
    docs_url="/docs", redoc_url="/redoc"  # ← MEJORA: Endpoints de docs
)

# 🔥 ORDEN CORRECTO: PRIMERO EL CORS, DESPUÉS LOS ROUTERS
app.add_middleware(
    CORSMiddleware,
    # 🔑 MEJORA: Restringe wildcard; quita "*" para prod si no es necesario pero si lo es
    allow_origins=[
        "http://localhost:5173", 
        "https://control-flota-mac.vercel.app",
        "https://docs.google.com",
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ahora sí: incluir los routers DESPUÉS del middleware
app.include_router(archivos_router)
app.include_router(flota.router, prefix="")
app.include_router(costos_router)
app.include_router(polizas_router)
app.include_router(documentacion_router)

# =========================================================================
# EVENTO DE INICIO: CONEXIÓN ASINCRÓNICA A MONGODB
# =========================================================================

@app.on_event("startup")
async def startup_db_client(): 
    await connect_to_mongodb()
    logger.info("CONEXIÓN A MONGODB ATLAS EXITOSA - API LISTA")  # ← MEJORA: Log

@app.on_event("shutdown")
async def shutdown_db_client():
    # Motor no necesita cerrar explícitamente, pero es buena práctica
    from dependencies import _client
    try:
        if _client is not None:
            _client.close()
            logger.info("Conexión a MongoDB cerrada.")  # ← MEJORA: Log
    except Exception as e:
        logger.error(f"Error al cerrar MongoDB: {e}")

# =========================================================================
# ENDPOINTS GLOBALES
# =========================================================================

@app.get("/", tags=["General"])
async def read_root():
    """Endpoint raíz para verificar el estado de la API."""
    return {"status": "ok", "message": "API Control de Flota funcionando correctamente"}

# =========================================================================
# PATCH: ACTUALIZAR MONTO (AHORA 100% ASYNC)
# =========================================================================

@app.patch(
    "/monto/{collection_name}/{doc_id}",
    response_model=Dict[str, Any],  # ← MEJORA: Typing explícito
    summary="Actualizar monto y motivo de un registro",
    tags=["Modificación de Datos"]
)
async def update_monto(collection_name: str, doc_id: str, data: UpdateMonto):
    """Actualiza el monto y opcionalmente el motivo en una colección específica (finanzas o mantenimiento)."""
    collection_name = collection_name.lower()
    
    if collection_name not in ['finanzas', 'mantenimiento']:
        raise HTTPException(status_code=400, detail="Colección no válida. Usa 'finanzas' o 'mantenimiento'.")

    # 🔑 MEJORA: Validación extra para monto positivo (asumiendo que es financiero)
    if data.monto < 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor o igual a cero.")

    collection = get_db_collection("Finanzas" if collection_name == "finanzas" else "Mantenimiento")

    try:
        obj_id = ObjectId(doc_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID inválido. Debe ser un ObjectId válido.")

    # Campo correcto según colección
    monto_field = "MONTO" if collection_name == "finanzas" else "costo_monto"
    update_data = {monto_field: data.monto}
    if data.motivo is not None:
        update_data["motivo"] = data.motivo

    # ← AHORA USAMOS await + update_one ASINCRONO
    result = await collection.update_one(
        {"_id": obj_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Documento no encontrado: {doc_id}")

    logger.info(f"Monto actualizado en {collection_name} para ID {doc_id}")  # ← MEJORA: Log de auditoría

    return {
        "message": f"Monto actualizado correctamente en {collection_name.capitalize()}",
        "modified": result.modified_count > 0
    }