from fastapi import APIRouter, HTTPException, Query, status, Response
from fastapi.responses import FileResponse
from typing import List, Optional, Any, Dict
from datetime import datetime, timedelta
import math
from bson.objectid import ObjectId
import os
import re
import logging
from pydantic import BaseModel, Field
from dependencies import get_db_collection, normalize_patente
from dateutil.parser import parse

logger = logging.getLogger(__name__)

# Importaciones de Pydantic (Asumidas si se usan modelos de Input)
from pydantic import BaseModel, Field, ConfigDict # 🔑 NECESARIO PARA VEHICULOCREATEINPUT

# Importaciones desde el módulo de dependencias
from dependencies import (
    get_db_collection, safe_mongo_date_to_datetime, VENCIMIENTO_MAP, 
    Alerta, Vehiculo, VehiculoUpdate, 
    # NUEVAS DEPENDENCIAS PARA FINANZAS
    CostoItem, ReporteCostosResponse, normalize_patente, safe_sort_costos,
    CostoManualInput, 
    CostoManualDelete,
    # NUEVOS MODELOS DE RESPUESTA AÑADIDOS
    DashboardResponse,
    ReportePeriodoResponse
)

# Define el router de FastAPI
router = APIRouter(
    prefix="",
    tags=["Flota y Reportes"],
)

TIPO_POR_ORIGEN = {
    "Mantenimiento": "Mantenimiento",
    "Combustible": "Combustible",
    "Peaje": "Peaje",
    "Seguro": "Seguro",
    "Patente": "Patente",
    "Otros": "Otros",
    "Infracción": "Infracción",        # ← NUEVO
    "Gasto Manual": "Gasto Manual",  # ← NUEVO, pero opcional
}

# =========================================================================
# 0. CONFIGURACIÓN DE ARCHIVOS
# =========================================================================

# RUTA FINAL CORRECTA
MEDIA_ROOT = "C:/Users/Antonio/Documents/Projects/Control_Flota"

# =========================================================================
# 1. LÓGICA CORE: OBTENER VENCIMIENTOS CRÍTICOS (ACTUALIZADA Y CORREGIDA)
# =========================================================================

class AlertaVencimiento(BaseModel):
    """Modelo unificado para alertas (compatible con el existente)"""
    patente: str
    tipo_documento: str
    fecha_vencimiento: str | None  # ISO string
    dias_restantes: int | None
    mensaje: str
    prioridad: str  # "CRÍTICA", "ALTA", "MEDIA", "BAJA", "OK"
    movil_nro: str | None = None
    descripcion_modelo: str | None = None

async def get_vencimientos_criticos_alertas(
    dias_tolerancia: int = 30,
    skip: int = 0,
    limit: int = 10,
    patente: str | None = None
) -> List[Alerta]:
    """
    Genera alertas de vencimiento optimizadas.
    Filtra estrictamente desde MongoDB los próximos a vencer.
    """
    db_documentacion = get_db_collection("Documentacion")
    db_vehiculos = get_db_collection("Vehiculos")

    now = datetime.utcnow()
    # 1. Definimos la cota máxima de tiempo
    fecha_limite = now + timedelta(days=dias_tolerancia)
    
    alertas_dict: Dict[str, Alerta] = {} 

    # =================================================================
    # PRIORIDAD 1: Documentacion
    # =================================================================
    # 2. Aplicamos el filtro relacional $lte directo en la BD
    filtro_doc = {
        "tipo_documento": {"$in": ["SEGURO", "Poliza_Detalle", "VTV"]},
        "fecha_vencimiento": {"$ne": None, "$lte": fecha_limite} 
    }
    
    if patente:
        filtro_doc["patente"] = normalize_patente(patente)

    cursor_doc = db_documentacion.find(filtro_doc).skip(skip).limit(limit)
    docs = await cursor_doc.to_list(length=limit)

    for doc in docs:
        patente_doc = doc["patente"]
        tipo = doc["tipo_documento"]
        fecha_vto = doc["fecha_vencimiento"]
        dias = (fecha_vto - now).days

        tipo_norm = "SEGURO" if tipo in ["SEGURO", "Poliza_Detalle"] else tipo

        # Como ya filtramos en BD, solo categorizamos la criticidad
        if dias <= 0:
            prioridad = "CRÍTICA"
            mensaje = f"VENCIDO hace {-dias} días" if dias < 0 else "VENCE HOY"
        else:
            prioridad = "ALTA"
            mensaje = f"Quedan {dias} días"

        # Enriquecimiento de datos relacionales
        veh = await db_vehiculos.find_one({"_id": patente_doc})
        if veh:
            movil_nro = veh.get("nro_movil") or veh.get("NRO_MOVIL") or "Sin móvil"
            desc_modelo = veh.get("descripcion_modelo") or veh.get("DESCRIPCION_MODELO") or "Sin modelo"
        else:
            movil_nro = "Sin móvil"
            desc_modelo = "Sin modelo"

        key = f"{patente_doc}_{tipo_norm}"
        alertas_dict[key] = Alerta(
            patente=patente_doc,
            tipo_documento=tipo_norm,
            fecha_vencimiento=fecha_vto.isoformat(),
            dias_restantes=dias,
            mensaje=f"{mensaje} para {tipo_norm}",
            prioridad=prioridad,
            movil_nro=movil_nro,
            descripcion_modelo=desc_modelo
        )

    # =================================================================
    # PRIORIDAD 2: Fallback Vehiculos (Si la paginación lo permite)
    # =================================================================
    remaining = limit - len(alertas_dict)
    if remaining > 0:
        filtro_veh = {}
        if patente:
            filtro_veh["_id"] = normalize_patente(patente)
            
        cursor_veh = db_vehiculos.find(filtro_veh, 
            {'_id': 1, 'nro_movil': 1, 'descripcion_modelo': 1, 'documentos_digitales': 1}).skip(skip).limit(remaining)
        vehiculos = await cursor_veh.to_list(length=remaining)

        for veh in vehiculos:
            patente_veh = veh.get('_id')
            movil_nro = veh.get('nro_movil') or veh.get('NRO_MOVIL')
            desc_modelo = veh.get('descripcion_modelo') or veh.get('DESCRIPCION_MODELO')

            for doc in veh.get('documentos_digitales', []):
                tipo = doc.get("tipo")
                fecha_str = doc.get("fecha_vencimiento")
                if not fecha_str:
                    continue

                try:
                    fecha_vto = parse(fecha_str)
                except:
                    continue

                tipo_norm = "SEGURO" if "SEGURO" in tipo.upper() or "POLIZA" in tipo.upper() else tipo
                key = f"{patente_veh}_{tipo_norm}"

                if key in alertas_dict:
                    continue 

                dias = (fecha_vto - now).days
                
                if dias > dias_tolerancia: 
                    continue

                if dias <= 0:
                    prioridad = "CRÍTICA"
                    mensaje = f"VENCIDO hace {-dias} días" if dias < 0 else "VENCE HOY"
                else:
                    prioridad = "ALTA"
                    mensaje = f"Quedan {dias} días"

                alertas_dict[key] = Alerta(
                    patente=patente_veh,
                    tipo_documento=tipo_norm,
                    fecha_vencimiento=fecha_vto.isoformat(),
                    dias_restantes=dias,
                    mensaje=f"{mensaje} para {tipo_norm}",
                    prioridad=prioridad,
                    movil_nro=movil_nro,
                    descripcion_modelo=desc_modelo
                )

    alertas = list(alertas_dict.values())
    alertas.sort(key=lambda a: (
        0 if a.prioridad == "CRÍTICA" else 1,
        a.dias_restantes or 9999
    ))

    return alertas


@router.get("/alertas/criticas")
async def get_alertas_criticas(
    dias_tolerancia: int = Query(30, description="Días para alerta ALTA"),
    skip: int = Query(0, ge=0, description="Número de alertas a saltar"),
    limit: int = Query(10, ge=1, le=200, description="Máximo de alertas por página"),
    patente: str | None = Query(None, description="Filtrar por patente (normalizada)")
):
    alertas = await get_vencimientos_criticos_alertas(dias_tolerancia, skip, limit, patente)

    db_documentacion = get_db_collection("Documentacion")
    
    now = datetime.utcnow()
    fecha_limite = now + timedelta(days=dias_tolerancia)

    filtro_total = {
        "tipo_documento": {"$in": ["SEGURO", "Poliza_Detalle", "VTV"]},
        "fecha_vencimiento": {"$ne": None, "$lte": fecha_limite}
    }
    
    if patente:
        filtro_total["patente"] = normalize_patente(patente)

    total = await db_documentacion.count_documents(filtro_total)

    db_vehiculos = get_db_collection("Vehiculos")
    for alerta in alertas:
        if alerta.movil_nro in ("N/A", None) or alerta.descripcion_modelo in ("Vehículo", None):
            veh = await db_vehiculos.find_one({"_id": alerta.patente})
            if veh:
                alerta.movil_nro = veh.get("nro_movil") or veh.get("NRO_MOVIL") or "Sin móvil"
                alerta.descripcion_modelo = veh.get("descripcion_modelo") or veh.get("DESCRIPCION_MODELO") or "Sin modelo"

    return {
        "alertas": alertas,
        "total": total
    }

# =========================================================================
# 2. ENDPOINTS: VEHÍCULOS (CRUD)
# =========================================================================

class VencimientoUpdate(BaseModel):
    fecha_vencimiento: datetime = Field(..., description="Nueva fecha de vencimiento")

    @classmethod
    def __get_validators__(cls):
        yield cls.validate_fecha

    @classmethod
    def validate_fecha(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return parse(v)
            except Exception:
                raise ValueError("Fecha inválida. Usa formato YYYY-MM-DD")
        raise ValueError("Fecha debe ser string o datetime")

# -------------------------------------------------------------------------
# 2.1. Modelo de Input Local para Creación (POST)
# -------------------------------------------------------------------------
class VehiculoCreateInput(BaseModel):
    patente: str = Field(..., description="Patente original del vehículo (Ej: AA123ZZ).")
    activo: bool = Field(True, description="Estado de actividad del vehículo.")
    anio: Optional[int] = Field(None, description="Año de fabricación.")
    color: Optional[str] = Field(None, description="Color del vehículo.")
    
    # --- NUEVOS CAMPOS ---
    marca: Optional[str] = Field(None, description="Marca del vehículo (Ej: Renault)")
    modelo: Optional[str] = Field(None, description="Modelo específico (Ej: Clio 2.3)")
    tipo: Optional[str] = Field(None, description="Tipo de vehículo (Ej: Auto, Utilitario)")
    
    # Campo Legacy
    descripcion_modelo: Optional[str] = Field(None, description="Descripción del modelo (Legacy).")
    
    nro_movil: Optional[str] = Field(None, description="Número de móvil/interno.")
    tipo_combustible: Optional[str] = Field('Nafta', description="Tipo de combustible.")
    model_config = ConfigDict(extra='ignore')

# -------------------------------------------------------------------------
# 2.2. POST /vehiculos (Creación)
# -------------------------------------------------------------------------
@router.post("/vehiculos", response_model=Vehiculo, status_code=status.HTTP_201_CREATED, summary="Registra un nuevo vehículo en el sistema.")
async def create_vehiculo(data: VehiculoCreateInput):
    logger.info(f"🚀 CREATE VEHICULO - Payload Recibido: {data.model_dump()}")
    
    db_vehiculos = get_db_collection("Vehiculos")
    patente_normalizada = normalize_patente(data.patente)
    
    if await db_vehiculos.find_one({"_id": patente_normalizada}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un vehículo con la patente {data.patente.upper()}."
        )
    
    vehiculo_doc = {
        "_id": patente_normalizada,
        "patente_original": data.patente.upper(),
        "activo": data.activo,
        "ANIO": data.anio,
        "COLOR": data.color,
        "MARCA": data.marca,       
        "MODELO": data.modelo,     
        "TIPO": data.tipo,         
        "DESCRIPCION_MODELO": data.descripcion_modelo,
        "NRO_MOVIL": data.nro_movil,
        "TIPO_COMBUSTIBLE": data.tipo_combustible,
        "documentos_digitales": [],
        "tipo_registro": "MANUAL_CREADO",
    }
    
    try:
        await db_vehiculos.insert_one(vehiculo_doc)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al insertar: {str(e)}")
    
    new_vehiculo = await db_vehiculos.find_one({"_id": patente_normalizada})
    
    if not new_vehiculo:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Vehículo insertado pero no encontrado inmediatamente después.")

    vehiculo_data = {
        "patente": new_vehiculo.get("_id"), 
        "patente_original": new_vehiculo.get("patente_original"),
        "activo": new_vehiculo.get("activo", False),
        "anio": new_vehiculo.get("ANIO"),
        "color": new_vehiculo.get("COLOR"),
        "marca": new_vehiculo.get("MARCA") or new_vehiculo.get("marca"), # CORRECCIÓN: Extracción segura
        "modelo": new_vehiculo.get("MODELO") or new_vehiculo.get("DESCRIPCION_MODELO") or new_vehiculo.get("modelo"), 
        "tipo": new_vehiculo.get("TIPO") or new_vehiculo.get("tipo"),    # CORRECCIÓN: Extracción segura
        "descripcion_modelo": new_vehiculo.get("DESCRIPCION_MODELO"),
        "nro_movil": new_vehiculo.get("NRO_MOVIL"),
        "tipo_combustible": new_vehiculo.get("TIPO_COMBUSTIBLE"),
        "documentos_digitales": new_vehiculo.get("documentos_digitales", []),
    }
    
    return Vehiculo(**vehiculo_data)

# -------------------------------------------------------------------------
# 2.3. PATCH /vehiculos/{patente} (Actualización)
# -------------------------------------------------------------------------
# 1. Creamos un modelo estricto en minúsculas para coincidir exactamente con el Frontend
class VehiculoPatchInput(BaseModel):
    activo: Optional[bool] = None
    anio: Optional[int] = None
    color: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    tipo: Optional[str] = None
    descripcion_modelo: Optional[str] = None
    nro_movil: Optional[str] = None
    tipo_combustible: Optional[str] = None
    model_config = ConfigDict(extra='ignore')

@router.patch("/vehiculos/{patente}", response_model=Vehiculo, summary="Actualiza los campos editables de un vehículo existente.")
async def update_vehiculo(patente: str, data: VehiculoPatchInput):
    # LOG para confirmar que FastAPI recibe los datos del Frontend:
    logger.info(f"✏️ PATCH RECIBIDO ({patente}): {data.model_dump()}")
    
    db_vehiculos = get_db_collection("Vehiculos")
    patente_normalizada = normalize_patente(patente)
    update_fields = data.model_dump(exclude_none=True, exclude_unset=True) 

    update_doc = {"$set": {}}
    
    # Mapeo: Lo que llega en minúscula (Pydantic/Front) se guarda en MAYÚSCULA (Mongo)
    field_mapping = {
        'activo': 'activo', 'anio': 'ANIO', 'color': 'COLOR', 
        'marca': 'MARCA', 'modelo': 'MODELO', 'tipo': 'TIPO', 
        'descripcion_modelo': 'DESCRIPCION_MODELO', 'nro_movil': 'NRO_MOVIL', 
        'tipo_combustible': 'TIPO_COMBUSTIBLE',
    }

    for pydantic_field, db_field in field_mapping.items():
        if pydantic_field in update_fields:
            update_doc['$set'][db_field] = update_fields[pydantic_field]
            
    # LOG para confirmar qué es lo que se le envía a MongoDB a guardar:
    logger.info(f"💾 GUARDANDO EN MONGO ({patente}): {update_doc}")
            
    if not update_doc['$set']:
         updated_doc = await db_vehiculos.find_one({"_id": patente_normalizada}) 
         if not updated_doc:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con patente {patente} no encontrado.")
         
    else:
        update_result = await db_vehiculos.update_one( 
            {"_id": patente_normalizada},
            update_doc
        )

        if update_result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con patente {patente} no encontrado.")
            
        updated_doc = await db_vehiculos.find_one({"_id": patente_normalizada}) 

    # Mapeo de extracción para devolver al Frontend
    vehiculo_data = {
        "patente": updated_doc.get("_id"), 
        "patente_original": updated_doc.get("patente_original"),
        "activo": updated_doc.get("activo", False), 
        "anio": updated_doc.get("ANIO"),
        "color": updated_doc.get("COLOR"), 
        "marca": updated_doc.get("MARCA") or updated_doc.get("marca"), 
        "modelo": updated_doc.get("MODELO") or updated_doc.get("DESCRIPCION_MODELO") or updated_doc.get("modelo"), 
        "tipo": updated_doc.get("TIPO") or updated_doc.get("tipo"),    
        "descripcion_modelo": updated_doc.get("DESCRIPCION_MODELO"),
        "nro_movil": updated_doc.get("NRO_MOVIL"), 
        "tipo_combustible": updated_doc.get("TIPO_COMBUSTIBLE"),
        "documentos_digitales": updated_doc.get("documentos_digitales", []),
    }
    return Vehiculo(**vehiculo_data)

@router.put("/vencimientos/{patente}/{tipo_documento}")
async def actualizar_vencimiento_digital(
    patente: str,
    tipo_documento: str,
    data: VencimientoUpdate
):
    normalized_patente = normalize_patente(patente)
    collection = get_db_collection("Vehiculos")

    result = await collection.update_one(
        {"_id": normalized_patente},
        {
            "$set": {
                "documentos_digitales.$[elem].fecha_vencimiento": data.fecha_vencimiento
            }
        },
        array_filters=[{"elem.tipo": tipo_documento}]
    )

    if result.modified_count == 0:
        raise HTTPException(404, f"No se encontró el documento {tipo_documento} para la patente {patente}")

    logger.info(f"Fecha de vencimiento actualizada en documentos_digitales: {patente} - {tipo_documento}")
    return {"message": "Fecha de vencimiento actualizada correctamente"}

# -------------------------------------------------------------------------
# 2.4. GET /vehiculos (Listado con filtros y paginación)
# -------------------------------------------------------------------------
@router.get("/vehiculos", response_model=List[Vehiculo], summary="Lista todos los vehículos con opcional filtrado y paginación.")
async def get_vehiculos(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    filtro: Optional[str] = Query(None, description="Filtro por patente, móvil o modelo")
):
    try:
        db_vehiculos = get_db_collection("Vehiculos")
        query: Dict[str, Any] = {}
        
        if filtro:
            regex_query = {"$regex": filtro, "$options": "i"}
            query["$or"] = [
                {"_id": regex_query},
                {"patente_original": regex_query},
                {"NRO_MOVIL": regex_query},
                {"DESCRIPCION_MODELO": regex_query},
                {"MARCA": regex_query},  # CORRECCIÓN: Búsqueda
                {"MODELO": regex_query}, 
                {"TIPO": regex_query}    # CORRECCIÓN: Búsqueda
            ]

        cursor = db_vehiculos.find(query).skip(skip).limit(limit)
        docs_list = await cursor.to_list(length=limit) 
        
        vehiculos_list = []
        for doc in docs_list: 
            nro_movil = doc.get("NRO_MOVIL") or doc.get("nro_movil", "N/A")
            descripcion_modelo = doc.get("DESCRIPCION_MODELO") or doc.get("descripcion_modelo", "Sin Modelo")
            anio = doc.get("ANIO") or doc.get("anio", 0)
            color = doc.get("COLOR") or doc.get("color", "N/A")
            
            vehiculo_data = {
                "patente": doc.get("_id"), 
                "patente_original": doc.get("patente_original", "N/A"),
                "activo": doc.get("activo", False), 
                "anio": anio,
                "color": color, 
                "marca": doc.get("MARCA") or doc.get("marca"), # CORRECCIÓN: Extracción segura GET ALL
                "modelo": doc.get("MODELO") or doc.get("modelo") or "Sin Modelo", 
                "tipo": doc.get("TIPO") or doc.get("tipo"),    # CORRECCIÓN: Extracción segura GET ALL
                "descripcion_modelo": descripcion_modelo,
                "nro_movil": str(nro_movil), 
                "tipo_combustible": doc.get("TIPO_COMBUSTIBLE", "N/A"),
                "documentos_digitales": doc.get("documentos_digitales", []),
            }
            vehiculos_list.append(Vehiculo(**vehiculo_data))
        
        return vehiculos_list
    except Exception as e:
        print(f"ERROR EN LIST_VEHICULOS: {str(e)}") 
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

@router.get("/vehiculos/{patente}", response_model=Vehiculo, summary="Obtiene el detalle de un vehículo.")
async def get_vehiculo_by_patente(patente: str):
    db_vehiculos = get_db_collection("Vehiculos")
    patente_norm = normalize_patente(patente)

    vehiculo = await db_vehiculos.find_one({"_id": patente_norm})

    if not vehiculo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Vehículo con patente {patente_norm} no encontrado"
        )
    
    vehiculo_data = {
        "patente": vehiculo.get("_id"),
        "patente_original": vehiculo.get("patente_original"),
        "activo": vehiculo.get("activo", True),
        "anio": vehiculo.get("anio") or vehiculo.get("ANIO"),
        "color": vehiculo.get("color") or vehiculo.get("COLOR"),
        "nro_movil": vehiculo.get("nro_movil") or vehiculo.get("NRO_MOVIL"),
        "tipo_combustible": vehiculo.get("tipo_combustible") or vehiculo.get("TIPO_COMBUSTIBLE"),
        
        "marca": vehiculo.get("marca") or vehiculo.get("MARCA"), # CORRECCIÓN: Extracción segura GET ONE
        "tipo": vehiculo.get("tipo") or vehiculo.get("TIPO"),    # CORRECCIÓN: Extracción segura GET ONE
        "modelo": (
            vehiculo.get("modelo") or 
            vehiculo.get("MODELO") or 
            vehiculo.get("descripcion_modelo") or 
            vehiculo.get("DESCRIPCION_MODELO")
        ),
        "descripcion_modelo": (
            vehiculo.get("descripcion_modelo") or 
            vehiculo.get("DESCRIPCION_MODELO") or 
            vehiculo.get("MODELO")
        ),
        
        "documentos_digitales": vehiculo.get("documentos_digitales", [])
    }

    return Vehiculo(**vehiculo_data)

@router.delete("/vehiculos/{patente}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina un vehículo y sus registros asociados.")
async def delete_vehiculo(patente: str):
    patente_norm = normalize_patente(patente)
    db_vehiculos = get_db_collection("Vehiculos")

    delete_result = await db_vehiculos.delete_one({"_id": patente_norm})
    
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Vehículo con patente {patente} no encontrado.")

    for collection_name in ["Documentacion", "Mantenimiento", "Finanzas", "Componentes", "Flota_Estado"]:
        collection = get_db_collection(collection_name)
        await collection.delete_many({"patente": patente_norm}) 

    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =========================================================================
# 3. ENDPOINTS: REPORTES DE VEHÍCULO Y COSTOS
# =========================================================================

@router.get("/vehiculos/{patente}/reporte", response_model=ReporteCostosResponse)
async def get_reporte_vehiculo(
    patente: str,
    start_date: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    end_date: str = Query(..., description="Fecha fin YYYY-MM-DD")
):
    patente_norm = normalize_patente(patente)
    
    db_vehiculos = get_db_collection("Vehiculos")
    vehiculo = await db_vehiculos.find_one({"_id": patente_norm}) 
    if not vehiculo:
        raise HTTPException(status_code=404, detail=f"Vehículo {patente_norm} no encontrado")

    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD")

    costos_list: List[CostoItem] = []
    total_mantenimiento = 0.0
    total_infracciones = 0.0

    def parse_fecha_segura(doc):
        candidatos = [
            doc.get("fecha"),
            doc.get("dia"), 
            doc.get("fecha_infraccion"),
            doc.get("FECHA_INFRACCIN")
        ]
        
        for valor in candidatos:
            if not valor or valor in ["N/A", "null", ""]: 
                continue
                
            if isinstance(valor, datetime):
                return valor.isoformat()[:10]
                
            if isinstance(valor, str):
                valor = valor.strip()
                match = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", valor)
                if match:
                    d, m, a = match.groups()
                    try:
                        return f"{a}-{int(m):02d}-{int(d):02d}"
                    except:
                        pass
                if "T" in valor:
                    return valor[:10]
                if re.match(r"\d{4}-\d{2}-\d{2}", valor):
                    return valor[:10]
        
        return "1900-01-01"  


    db_mantenimiento = get_db_collection("Mantenimiento")
    cursor_mantenimiento = db_mantenimiento.find({
        "patente": patente_norm,
        "fecha": {"$gte": start_dt, "$lte": end_dt}
    })
    docs_mantenimiento = await cursor_mantenimiento.to_list(length=None) 

    for doc in docs_mantenimiento:
        monto = float(doc.get("costo_monto") or 0)
        fecha_iso = parse_fecha_segura(doc)
        
        total_mantenimiento += monto
        costos_list.append(CostoItem(
        _id=str(doc["_id"]),
        tipo=TIPO_POR_ORIGEN["Mantenimiento"], 
        fecha=fecha_iso,
        descripcion=doc.get("DESCRIPCIÓN", "Servicio técnico"),
        importe=monto,
        origen="Mantenimiento"
    ))

    db_finanzas = get_db_collection("Finanzas")
    
    cursor_finanzas = db_finanzas.find({"patente": patente_norm})
    docs_finanzas = await cursor_finanzas.to_list(length=None)

    for doc in docs_finanzas:
        try:
            fecha_iso = parse_fecha_segura(doc)
            try:
                fecha_dt = datetime.strptime(fecha_iso, "%Y-%m-%d")
            except:
                continue 

            if not (start_dt <= fecha_dt <= end_dt):
                continue

            monto = float(doc.get("MONTO") or doc.get("monto") or 0)

            motivo = str(doc.get("motivo") or doc.get("MOTIVO") or "").upper()
            tipo_registro = doc.get("tipo_registro", "").upper()

            if any(palabra in motivo for palabra in ["MULTA", "INFRACCION", "EXCESO", "VELOCIDAD", "VIA PROHIBIDA"]):
                total_infracciones += monto
                tipo_final = "Multa"
            elif tipo_registro == "INFRACCION":
                total_infracciones += monto
                tipo_final = "Multa"
            else:
                tipo_final = doc.get("tipo_costo", "Otros")

            costos_list.append(CostoItem(
                _id=str(doc["_id"]),
                tipo=tipo_final,
                fecha=fecha_iso,
                descripcion=(doc.get("motivo") or doc.get("ACTA") or "Gasto financiero")[:100],
                importe=monto,
                origen="Finanzas"
            ))

        except Exception as e:
            print(f"Error procesando registro Finanzas {doc.get('_id')}: {e}")
            continue

    costos_list.sort(key=lambda x: x.fecha or "1900-01-01", reverse=True)

    todas_alertas = await get_vencimientos_criticos_alertas(60)
    alertas = [a for a in todas_alertas if a.patente == patente_norm]

    return ReporteCostosResponse(
        patente=patente_norm,
        total_general=round(total_mantenimiento + total_infracciones, 2),
        total_mantenimiento=round(total_mantenimiento, 2),
        total_infracciones=round(total_infracciones, 2),
        detalles=costos_list,
        alertas=alertas
    )

# -------------------------------------------------------------------------
# 3.2. GET /dashboard (Resumen de la Flota)
# -------------------------------------------------------------------------

async def get_resumen_costos_dashboard(dias_historia: int = 365) -> Dict[str, float]: 
    db_mant = get_db_collection("Mantenimiento")
    db_finanzas = get_db_collection("Finanzas")

    end_date = datetime.now()
    start_date = end_date - timedelta(days=dias_historia)
    start_date_iso = start_date.isoformat()
    end_date_iso = end_date.isoformat()

    pipeline_mant = [
        { "$match": { "fecha": { "$gte": start_date, "$lte": end_date } } },
        { "$group": { "_id": None, "total": { "$sum": "$costo_monto" } } }
    ]
    resumen_mant_result = await db_mant.aggregate(pipeline_mant).to_list(length=None) 
    total_mantenimiento = resumen_mant_result[0]["total"] if resumen_mant_result and resumen_mant_result[0].get("total") is not None else 0.0

    pipeline_infracciones = [
        { 
            "$match": { 
                "tipo_registro": "Infraccion",
                "dia": { "$gte": start_date_iso, "$lte": end_date_iso }
            }
        },
        { "$group": { "_id": None, "total": { "$sum": "$MONTO" } } }
    ]
    resumen_infr_result = await db_finanzas.aggregate(pipeline_infracciones).to_list(length=None) 
    total_infracciones = resumen_infr_result[0]["total"] if resumen_infr_result and resumen_infr_result[0].get("total") is not None else 0.0
    
    return {
        "total_mantenimiento": round(total_mantenimiento, 2),
        "total_infracciones": round(total_infracciones, 2),
    }

@router.get("/dashboard", response_model=DashboardResponse, summary="Obtiene un resumen de la flota para el dashboard.")
async def get_dashboard_data():
    db_vehiculos = get_db_collection("Vehiculos")

    total_vehiculos = await db_vehiculos.count_documents({})
    vehiculos_activos = await db_vehiculos.count_documents({"activo": True})
    
    resumen_costos = await get_resumen_costos_dashboard(dias_historia=365)
    alertas_criticas = await get_vencimientos_criticos_alertas(dias_tolerancia=30)
    
    total_general = resumen_costos["total_mantenimiento"] + resumen_costos["total_infracciones"]
    
    return DashboardResponse(
        total_vehiculos=total_vehiculos,
        vehiculos_activos=vehiculos_activos,
        alertas_criticas_count=len(alertas_criticas),
        total_mantenimiento=resumen_costos["total_mantenimiento"],
        total_infracciones=resumen_costos["total_infracciones"],
        total_general=round(total_general, 2),
    )


# =========================================================================
# 4. ENDPOINTS: GESTIÓN DE COSTOS MANUALES (CRUD) 
# =========================================================================

@router.delete("/costos/manual/{id}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina cualquier costo por ID (modo limpieza total)")
async def delete_costo_manual(
    id: str, 
    origen: str = Query(..., description="Colección: 'Finanzas' o 'Mantenimiento'", alias="origen")
):
    if origen not in ["Finanzas", "Mantenimiento"]:
        raise HTTPException(status_code=400, detail="Origen debe ser 'Finanzas' o 'Mantenimiento'.")
    
    try:
        obj_id = ObjectId(id)
    except:
        raise HTTPException(status_code=400, detail="ID inválido.")

    collection = get_db_collection(origen)
    
    delete_result = await collection.delete_one({"_id": obj_id})
    
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")

    print(f"ELIMINADO FORZADO → {origen} / {id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =========================================================================
# 5. ENDPOINTS: DESCARGA DE ARCHIVOS 
# =========================================================================

@router.get("/archivos/descargar", summary="Descarga un archivo digital dado su path_relativo.")
def download_file(path_relativo: str = Query(..., description="Ruta relativa del archivo dentro del MEDIA_ROOT.")): 
    
    if '..' in path_relativo or path_relativo.startswith('/') or path_relativo.startswith('\\'):
        raise HTTPException(status_code=400, detail="Ruta de archivo no permitida.")

    file_path = os.path.join(MEDIA_ROOT, path_relativo.replace('/', os.sep))
    
    if not os.path.exists(file_path): 
        raise HTTPException(status_code=404, detail="Archivo no encontrado en el servidor.")
        
    filename = os.path.basename(file_path)
    
    return FileResponse(
        file_path, 
        filename=filename, 
        media_type="application/octet-stream", 
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )

# =========================================================================
# 6. ENDPOINT: LIMPIEZA MASIVA DE COSTOS BASURA 
# =========================================================================

@router.post("/costos/limpiar-basura", status_code=status.HTTP_200_OK, summary="Elimina en bulk todos los costos con monto 0 (basura del ETL).")
async def limpiar_costos_basura(
    origen: Optional[str] = Query(None, description="Opcional: 'Finanzas' o 'Mantenimiento' para limitar la limpieza a una colección."),
    dry_run: bool = Query(False, description="Si True, simula la limpieza y solo cuenta cuántos se eliminarían (sin borrar).")
) -> Dict[str, Any]:
    colecciones = ["Finanzas", "Mantenimiento"] if not origen else [origen]
    if origen and origen not in colecciones:
        raise HTTPException(status_code=400, detail="Origen inválido. Debe ser 'Finanzas' o 'Mantenimiento'.")
    
    total_eliminados = 0
    detalles: Dict[str, int] = {}
    
    for col_name in colecciones:
        collection = get_db_collection(col_name)
        
        filtro = {}
        if col_name == "Mantenimiento":
            filtro = {"costo_monto": 0}
        elif col_name == "Finanzas":
            filtro = {"MONTO": 0} 
        
        if dry_run:
            count = await collection.count_documents(filtro) 
            detalles[col_name] = count
        else:
            resultado = await collection.delete_many(filtro)
            eliminados = resultado.deleted_count
            detalles[col_name] = eliminados
            total_eliminados += eliminados
            
    mensaje = "Limpieza completada" if not dry_run else "Simulación completada (nada borrado)"
    return {
        "mensaje": mensaje,
        "total_eliminados": total_eliminados if not dry_run else sum(detalles.values()),
        "detalles_por_coleccion": detalles
    }