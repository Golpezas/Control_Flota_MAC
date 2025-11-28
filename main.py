from fastapi import FastAPI, HTTPException, status, Query
from dependencies import UpdateMonto, get_db_collection, connect_to_mongodb
from bson.objectid import ObjectId
from typing import List, Optional, Any
from fastapi.middleware.cors import CORSMiddleware
from routers import flota
from routers.archivos import router as archivos_router

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
    # 🔑 CORRECCIÓN: Añadir la URL de Vercel explícitamente para evitar problemas de CORS.
    allow_origins=[
        "http://localhost:5173", 
        "https://control-flota-mac.vercel.app", # <-- ¡AÑADIDA!
        "*" 
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ahora sí: incluir los routers DESPUÉS del middleware
app.include_router(archivos_router)
app.include_router(flota.router, prefix="")

# =========================================================================
# EVENTO DE INICIO: CONEXIÓN ASINCRÓNICA A MONGODB
# =========================================================================

@app.on_event("startup")
async def startup_db_client(): 
    await connect_to_mongodb()
    print("CONEXIÓN A MONGODB ATLAS EXITOSA - API LISTA")

@app.on_event("shutdown")
async def shutdown_db_client():
    # Motor no necesita cerrar explícitamente, pero es buena práctica
    from dependencies import _client
    if _client is not None:
        _client.close()
        print("Conexión a MongoDB cerrada.")

# =========================================================================
# ENDPOINTS GLOBALES
# =========================================================================

@app.get("/", tags=["General"])
async def read_root():
    return {"status": "ok", "message": "API Control de Flota funcionando correctamente"}

# =========================================================================
# PATCH: ACTUALIZAR MONTO (AHORA 100% ASYNC)
# =========================================================================

@app.patch(
    "/monto/{collection_name}/{doc_id}",
    response_model=dict,
    summary="Actualizar monto y motivo de un registro",
    tags=["Modificación de Datos"]
)
async def update_monto(collection_name: str, doc_id: str, data: UpdateMonto):
    collection_name = collection_name.lower()
    
    if collection_name not in ['finanzas', 'mantenimiento']:
        raise HTTPException(status_code=400, detail="Colección no válida. Usa 'finanzas' o 'mantenimiento'.")

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

    return {
        "message": f"Monto actualizado correctamente en {collection_name.capitalize()}",
        "modified": result.modified_count > 0
    }