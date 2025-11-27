from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from routers import flota
from routers.archivos import router as archivos_router
from dependencies import connect_to_mongodb, get_db_collection, UpdateMonto
from bson.objectid import ObjectId
from typing import Optional

app = FastAPI(
    title="Control de Flota - MAC Seguridad",
    version="1.0.0",
    description="API para gestión de vehículos, costos y alertas"
)

# CORS PERFECTO PARA PRODUCCIÓN
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://control-flota-mac.vercel.app",   # ← dominio real
        "http://localhost:5173"                   # ← desarrollo local
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(archivos_router)
app.include_router(flota.router)

# Conectar a MongoDB al iniciar
@app.on_event("startup")
async def startup_event():
    connect_to_mongodb()
    print("API iniciada y conectada a MongoDB Atlas")

@app.get("/")
def root():
    return {"status": "ok", "message": "Backend Flota MAC Seguridad ONLINE"}

# Actualizar monto (tu endpoint que ya usabas)
@app.patch("/monto/{collection_name}/{doc_id}")
async def update_monto(collection_name: str, doc_id: str, data: UpdateMonto):
    collection = get_db_collection("Finanzas" if collection_name.lower() == "finanzas" else "Mantenimiento")
    
    try:
        result = collection.update_one(
            {"_id": ObjectId(doc_id)},
            {"$set": {
                "MONTO" if collection_name.lower() == "finanzas" else "costo_monto": data.monto,
                "motivo": data.motivo if data.motivo is not None else None
            }}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        return {"message": "Monto actualizado", "modified": result.modified_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))