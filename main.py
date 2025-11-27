from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os

# Importamos después de crear la app para evitar import loops
from dependencies import connect_to_mongodb, get_db_collection, UpdateMonto
from routers import flota
from routers.archivos import router as archivos_router
from bson.objectid import ObjectId

app = FastAPI(
    title="Control de Flota - MAC Seguridad",
    description="API producción - 100% funcional",
    version="1.0.0"
)

# CORS TOTALMENTE ABIERTO (solo 24-48 hs, luego lo cerramos)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(archivos_router)
app.include_router(flota.router)

# FORZAMOS LA CONEXIÓN AL INICIO Y PARAMOS TODO SI FALLA
@app.on_event("startup")
async def startup_event():
    print("Iniciando conexión a MongoDB Atlas...")
    try:
        connect_to_mongodb()
        print("CONEXIÓN A MONGODB EXITOSA - API LISTA")
    except Exception as e:
        print(f"ERROR FATAL - NO SE PUDO CONECTAR A MONGODB: {e}")
        print("Deploy fallará hasta que la conexión funcione")
        raise  # Render marcará el deploy como FAILED (así sabemos que está mal)

@app.get("/")
async def root():
    return {"status": "ONLINE", "message": "Backend Flota MAC Seguridad - 100% operativo"}

# Tu endpoint de actualizar monto
@app.patch("/monto/{collection_name}/{doc_id}")
async def update_monto(collection_name: str, doc_id: str, data: UpdateMonto):
    coll = get_db_collection("Finanzas" if "finanzas" in collection_name.lower() else "Mantenimiento")
    try:
        result = coll.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "MONTO" if "finanzas" in collection_name.lower() else "costo_monto": data.monto,
                "motivo": data.motivo
            }}
        )
        if result.matched_count == 0:
            raise HTTPException(404, "Documento no encontrado")
        return {"message": "Actualizado correctamente"}
    except Exception as e:
        raise HTTPException(400, f"Error: {str(e)}")