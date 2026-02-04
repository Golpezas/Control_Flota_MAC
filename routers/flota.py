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

# 🔑 CORRECCIÓN 1: La función DEBE ser asíncrona (async)
async def get_vencimientos_criticos_alertas(dias_tolerancia: int) -> List[Alerta]:
    """
    Consulta la colección Vehiculos → documentos_digitales y genera alertas para documentos
    cuyo vencimiento está dentro de 'dias_tolerancia' o ya expiró.
    """
    db_vehiculos = get_db_collection("Vehiculos")
    alertas: List[Alerta] = []

    # 1. Obtener todos los vehículos
    cursor_vehiculos = db_vehiculos.find({}, 
        {'_id': 1, 'descripcion_modelo': 1, 'nro_movil': 1, 'documentos_digitales': 1})
    
    vehiculos_list = await cursor_vehiculos.to_list(length=None)

    # 2. Iterar por cada vehículo
    for veh in vehiculos_list:
        patente = veh.get('_id')
        movil_nro = veh.get('nro_movil')
        descripcion_modelo = veh.get('descripcion_modelo')

        documentos_digitales = veh.get('documentos_digitales', [])

        # 3. Procesar cada documento digital del vehículo
        for doc in documentos_digitales:
            tipo = doc.get("tipo")
            fecha_vencimiento_str = doc.get("fecha_vencimiento")

            if not fecha_vencimiento_str:
                continue  # No tiene fecha → no alerta

            try:
                fecha_vencimiento = parse(fecha_vencimiento_str)
            except Exception:
                continue  # Fecha inválida → skip

            # Calcular diferencia en días
            today = datetime.now().date()
            fecha_ven_date = fecha_vencimiento.date()
            diff_days = (fecha_ven_date - today).days

            # Umbral crítico (usa VENCIMIENTO_MAP si existe, o default)
            config = next((cfg for key, cfg in VENCIMIENTO_MAP.items() if key in tipo), {})
            dias_critico = config.get("dias_critico", dias_tolerancia)

            if diff_days <= dias_critico:
                prioridad: Alerta.Prioridad = 'CRÍTICA' if diff_days <= 0 else 'ALTA'
                
                # Mensaje claro y urgente
                if diff_days < 0:
                    mensaje = f"VENCIDO hace {-diff_days} día{'s' if -diff_days > 1 else ''}"
                elif diff_days == 0:
                    mensaje = "VENCE HOY"
                else:
                    mensaje = f"Vence en {diff_days} día{'s' if diff_days > 1 else ''}"

                print(f"✅ ALERTA GENERADA: Patente={patente}, Días={diff_days} → {mensaje}")

                alerta = Alerta(
                    patente=patente,
                    tipo_documento=tipo,
                    nombre_legible=config.get('nombre_legible', tipo.replace('_', ' ')),
                    fecha_vencimiento=fecha_vencimiento.strftime('%Y-%m-%d'),
                    dias_restantes=diff_days,
                    mensaje=mensaje,
                    prioridad=prioridad,
                    movil_nro=movil_nro,
                    descripcion_modelo=descripcion_modelo
                )
                alertas.append(alerta)

    # 5. Ordenar: Críticas primero, luego por menos días restantes
    return sorted(alertas, key=lambda a: (a.prioridad != 'CRÍTICA', a.dias_restantes))

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
    # Campos que se mapean a los de la colección Vehiculos
    patente: str = Field(..., description="Patente original del vehículo (Ej: AA123ZZ).")
    activo: bool = Field(True, description="Estado de actividad del vehículo.")
    anio: Optional[int] = Field(None, description="Año de fabricación.")
    color: Optional[str] = Field(None, description="Color del vehículo.")
    descripcion_modelo: Optional[str] = Field(None, description="Descripción del modelo.")
    nro_movil: Optional[str] = Field(None, description="Número de móvil/interno.")
    tipo_combustible: Optional[str] = Field('Nafta', description="Tipo de combustible.")
    model_config = ConfigDict(extra='ignore') 

# -------------------------------------------------------------------------
# 2.2. POST /vehiculos (Creación) - Lógica de mapeo a UPPERCASE
# -------------------------------------------------------------------------
@router.post("/vehiculos", response_model=Vehiculo, status_code=status.HTTP_201_CREATED, summary="Registra un nuevo vehículo en el sistema.")
async def create_vehiculo(data: VehiculoCreateInput):
    # [LOG 1] Ver qué datos llegan realmente desde el Frontend
    logger.info(f"🚀 CREATE VEHICULO - Payload Recibido: {data.model_dump()}")
    
    db_vehiculos = get_db_collection("Vehiculos")
    patente_normalizada = normalize_patente(data.patente)
    
    # Verificación de existencia
    if await db_vehiculos.find_one({"_id": patente_normalizada}):
        logger.warning(f"⚠️ Intento de crear duplicado: {patente_normalizada}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un vehículo con la patente {data.patente.upper()}."
        )
    
    # Preparar el documento (Mapeo a DB UPPERCASE)
    vehiculo_doc = {
        "_id": patente_normalizada,
        "patente_original": data.patente.upper(),
        "activo": data.activo,
        "ANIO": data.anio,
        "COLOR": data.color,
        "DESCRIPCION_MODELO": data.descripcion_modelo,
        "NRO_MOVIL": data.nro_movil,
        "TIPO_COMBUSTIBLE": data.tipo_combustible,
        "documentos_digitales": [],
        "tipo_registro": "MANUAL_CREADO",
    }
    
    # [LOG 2] Ver qué vamos a insertar exactamente en Mongo
    logger.info(f"💾 Insertando en Mongo: {vehiculo_doc}")
    
    try:
        await db_vehiculos.insert_one(vehiculo_doc)
    except Exception as e:
        logger.error(f"❌ Error al insertar en Mongo: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al insertar: {str(e)}")
    
    # Recuperar documento insertado
    new_vehiculo = await db_vehiculos.find_one({"_id": patente_normalizada})
    
    if not new_vehiculo:
        logger.error("❌ Vehículo insertado pero no encontrado en find_one posterior.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Vehículo insertado pero no encontrado inmediatamente después.")

    # [LOG 3] Ver qué recuperamos de Mongo
    logger.info(f"🔍 Recuperado de Mongo: {new_vehiculo}")

    # Mapeo manual de vuelta para Pydantic (DB Uppercase -> Model Lowercase)
    # IMPORTANTE: Aquí verificamos si 'new_vehiculo' tiene los datos esperados
    vehiculo_data = {
        "patente": new_vehiculo.get("_id"), 
        "patente_original": new_vehiculo.get("patente_original"),
        "activo": new_vehiculo.get("activo", False),
        "anio": new_vehiculo.get("ANIO"),
        "color": new_vehiculo.get("COLOR"),
        "modelo": new_vehiculo.get("MODELO") or new_vehiculo.get("descripcion_modelo") or new_vehiculo.get("DESCRIPCION_MODELO"), 
        "descripcion_modelo": new_vehiculo.get("DESCRIPCION_MODELO"),
        "nro_movil": new_vehiculo.get("NRO_MOVIL"),
        "tipo_combustible": new_vehiculo.get("TIPO_COMBUSTIBLE"),
        "documentos_digitales": new_vehiculo.get("documentos_digitales", []),
    }
    
    # [LOG 4] Ver el diccionario final antes de pasar a Pydantic
    logger.info(f"📤 Respuesta preparada para Pydantic: {vehiculo_data}")

    return Vehiculo(**vehiculo_data)

# -------------------------------------------------------------------------
# 2.3. PATCH /vehiculos/{patente} (Actualización) - De PUT a PATCH
# -------------------------------------------------------------------------
# Se cambia de PUT (reemplazo completo) a PATCH (actualización parcial) 
# y se corrige el mapeo de campos.

@router.patch("/vehiculos/{patente}", response_model=Vehiculo, summary="Actualiza los campos editables de un vehículo existente.")
async def update_vehiculo(patente: str, data: VehiculoUpdate):
    db_vehiculos = get_db_collection("Vehiculos")
    patente_normalizada = normalize_patente(patente)
    # exclude_none=True, exclude_unset=True se usa para solo incluir campos provistos.
    update_fields = data.model_dump(exclude_none=True, exclude_unset=True) 

    # 1. Mapeo de snake_case (Pydantic) a MongoDB (UPPER_CASE/minúscula)
    update_doc = {"$set": {}}
    field_mapping = {
        'activo': 'activo', 'anio': 'ANIO', 'color': 'COLOR', 
        'modelo': 'MODELO', # 💡 FIX 2.C: Añadir mapeo para el campo 'modelo'
        'descripcion_modelo': 'DESCRIPCION_MODELO', 'nro_movil': 'NRO_MOVIL', 
        'tipo_combustible': 'TIPO_COMBUSTIBLE',
    }

    for pydantic_field, db_field in field_mapping.items():
        if pydantic_field in update_fields:
            update_doc['$set'][db_field] = update_fields[pydantic_field]
            
    if not update_doc['$set']:
         # No hay cambios, devolver el vehículo actual
         # 🔑 CORRECCIÓN 1: Usar await
         updated_doc = await db_vehiculos.find_one({"_id": patente_normalizada}) 
         if not updated_doc:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con patente {patente} no encontrado.")
         
    else:
        # 2. Ejecutar la actualización en MongoDB
        # 🔑 CORRECCIÓN 2: Usar await
        update_result = await db_vehiculos.update_one( 
            {"_id": patente_normalizada},
            update_doc
        )

        if update_result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con patente {patente} no encontrado.")
            
        # 3. Devolver el documento actualizado
        # 🔑 CORRECCIÓN 3: Usar await
        updated_doc = await db_vehiculos.find_one({"_id": patente_normalizada}) 

    # Mapeo de vuelta para Pydantic
    vehiculo_data = {
        "patente": updated_doc.get("_id"), 
        "patente_original": updated_doc.get("patente_original"),
        "activo": updated_doc.get("activo", False), 
        "anio": updated_doc.get("ANIO"),
        "color": updated_doc.get("COLOR"), 
        "modelo": updated_doc.get("MODELO"), 
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
# 2.4. GET /vehiculos (Listado con filtros y paginación) - CORREGIDO
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
            # Note: Mejorar el rendimiento si el volumen de datos es alto.
            regex_query = {"$regex": filtro, "$options": "i"}
            query["$or"] = [
                {"_id": regex_query},
                {"patente_original": regex_query},
                {"NRO_MOVIL": regex_query},
                {"DESCRIPCION_MODELO": regex_query}
            ]

        cursor = db_vehiculos.find(query).skip(skip).limit(limit)
        
        # 🔑 CORRECCIÓN CLAVE: Obtener todos los documentos del cursor de forma asíncrona
        docs_list = await cursor.to_list(length=limit) 
        
        vehiculos_list = []
        # El bucle ahora itera sobre la lista de documentos ya resuelta.
        for doc in docs_list: 
            # Lógica de mapeo para manejar campos UPPERCASE/lowercase
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
                "modelo": doc.get("MODELO", "Sin Modelo"), 
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

@router.get("/vehiculos/{patente}", response_model=Vehiculo, summary="Obtiene un vehículo por patente.")
async def get_vehiculo_by_patente(patente: str):
    """Obtiene los detalles de un vehículo usando su patente."""
    patente_norm = normalize_patente(patente)
    db_vehiculos = get_db_collection("Vehiculos")
    # 🔑 CORRECCIÓN 4: Usar await con find_one
    vehiculo = await db_vehiculos.find_one({"_id": patente_norm}) 
    if not vehiculo:
        raise HTTPException(status_code=404, detail=f"Vehículo con patente {patente} no encontrado.")
    return vehiculo

@router.delete("/vehiculos/{patente}", status_code=status.HTTP_204_NO_CONTENT, summary="Elimina un vehículo y sus registros asociados.")
async def delete_vehiculo(patente: str):
    """
    Elimina un vehículo de la colección 'Vehiculos' y todos sus registros
    asociados en Documentacion, Mantenimiento, Finanzas, Componentes y Flota_Estado.
    """
    patente_norm = normalize_patente(patente)
    db_vehiculos = get_db_collection("Vehiculos")

    # 1. Eliminar de la colección principal
    # 🔑 CORRECCIÓN 5: Usar await con delete_one
    delete_result = await db_vehiculos.delete_one({"_id": patente_norm})
    
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Vehículo con patente {patente} no encontrado.")

    # 2. Eliminar registros asociados en otras colecciones
    for collection_name in ["Documentacion", "Mantenimiento", "Finanzas", "Componentes", "Flota_Estado"]:
        collection = get_db_collection(collection_name)
        # 🔑 CORRECCIÓN 6: Usar await con delete_many
        # Se asume que todas las colecciones tienen el campo 'patente'
        await collection.delete_many({"patente": patente_norm}) 

    # No retorna contenido
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =========================================================================
# 3. ENDPOINTS: REPORTES DE VEHÍCULO Y COSTOS
# =========================================================================

@router.get("/alertas/criticas", response_model=List[Alerta], summary="Obtiene todas las alertas críticas (expiradas o próximas a vencer).")
async def get_alertas_criticas(dias_tolerancia: int = Query(30, description="Días máximos de antelación para considerar una alerta 'ALTA'")):
    # 🔑 CORRECCIÓN 1: await para la función asíncrona
    return await get_vencimientos_criticos_alertas(dias_tolerancia) 

@router.get("/vehiculos/{patente}/reporte", response_model=ReporteCostosResponse)
async def get_reporte_vehiculo(
    patente: str,
    start_date: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    end_date: str = Query(..., description="Fecha fin YYYY-MM-DD")
):
    patente_norm = normalize_patente(patente)
    
    # === 1. Validar vehículo ===
    db_vehiculos = get_db_collection("Vehiculos")
    # 🔑 CORRECCIÓN 2: await en find_one
    vehiculo = await db_vehiculos.find_one({"_id": patente_norm}) 
    if not vehiculo:
        raise HTTPException(status_code=404, detail=f"Vehículo {patente_norm} no encontrado")

    # === 2. Parsear fechas ===
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Usa YYYY-MM-DD")

    # === 3. Variables de totales ===
    costos_list: List[CostoItem] = []
    total_mantenimiento = 0.0
    total_infracciones = 0.0

    # Definición de la función de parseo (puede ir fuera si se usa en varios lugares)
    def parse_fecha_segura(doc):
        """Maneja cualquier formato de fecha que tengas en la base"""
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
                # Formato DD/M/YYYY o DD/MM/YYYY
                match = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", valor)
                if match:
                    d, m, a = match.groups()
                    try:
                        return f"{a}-{int(m):02d}-{int(d):02d}"
                    except:
                        pass
                # ISO normal
                if "T" in valor:
                    return valor[:10]
                # YYYY-MM-DD
                if re.match(r"\d{4}-\d{2}-\d{2}", valor):
                    return valor[:10]
        
        return "1900-01-01"  # fallback


    # === 4. MANTENIMIENTOS ===
    db_mantenimiento = get_db_collection("Mantenimiento")
    cursor_mantenimiento = db_mantenimiento.find({
        "patente": patente_norm,
        "fecha": {"$gte": start_dt, "$lte": end_dt}
    })
    # 🔑 CORRECCIÓN 3: Reemplazar iteración síncrona por to_list() asíncrono
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

    # === 5. FINANZAS (infracciones + gastos manuales) - VERSIÓN CORREGIDA ===
    db_finanzas = get_db_collection("Finanzas")
    
    # Traemos TODOS los registros de la patente (no filtramos por fecha en MongoDB)
    cursor_finanzas = db_finanzas.find({"patente": patente_norm})
    docs_finanzas = await cursor_finanzas.to_list(length=None)

    for doc in docs_finanzas:
        try:
            # === PARSEO DE FECHA USANDO LA MISMA FUNCIÓN QUE EN MANTENIMIENTO ===
            fecha_iso = parse_fecha_segura(doc)
            try:
                fecha_dt = datetime.strptime(fecha_iso, "%Y-%m-%d")
            except:
                continue  # Si no se puede parsear, saltamos

            # === FILTRO DE RANGO DE FECHAS ===
            if not (start_dt <= fecha_dt <= end_dt):
                continue

            # === MONTO ===
            monto = float(doc.get("MONTO") or doc.get("monto") or 0)

            # === DETERMINAR SI ES MULTA ===
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

            # === AGREGAR A LA LISTA ===
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

    # === 6. Ordenar por fecha descendente ===
    costos_list.sort(key=lambda x: x.fecha or "1900-01-01", reverse=True)

    # === 7. Alertas ===
    # 🔑 CORRECCIÓN 5: await para la función asíncrona de obtención de alertas.
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
# 3.2. GET /dashboard (Resumen de la Flota) - CORREGIDO
# -------------------------------------------------------------------------

# Función auxiliar (ahora ASÍNCRONA)
async def get_resumen_costos_dashboard(dias_historia: int = 365) -> Dict[str, float]: # 🔑 CORRECCIÓN 1: async def
    db_mant = get_db_collection("Mantenimiento")
    db_finanzas = get_db_collection("Finanzas")

    end_date = datetime.now()
    start_date = end_date - timedelta(days=dias_historia)
    start_date_iso = start_date.isoformat()
    end_date_iso = end_date.isoformat()

    # Total Mantenimiento (campo 'fecha' BSON Date)
    pipeline_mant = [
        { "$match": { "fecha": { "$gte": start_date, "$lte": end_date } } },
        { "$group": { "_id": None, "total": { "$sum": "$costo_monto" } } }
    ]
    # 🔑 CORRECCIÓN 2: await en aggregate y usar to_list()
    resumen_mant_result = await db_mant.aggregate(pipeline_mant).to_list(length=None) 
    total_mantenimiento = resumen_mant_result[0]["total"] if resumen_mant_result and resumen_mant_result[0].get("total") is not None else 0.0

    # Total Infracciones (campo 'dia' string/date)
    # Nota: Es mejor intentar filtrar por el campo BSON Date 'fecha' si existe, si no, mantener el filtro de string
    # para 'dia' si así está en tu ETL.
    pipeline_infracciones = [
        { 
            "$match": { 
                "tipo_registro": "Infraccion",
                # Mantener 'dia' como string/iso para coincidir con tu BD
                "dia": { "$gte": start_date_iso, "$lte": end_date_iso }
            }
        },
        { "$group": { "_id": None, "total": { "$sum": "$MONTO" } } }
    ]
    # 🔑 CORRECCIÓN 3: await en aggregate y usar to_list()
    resumen_infr_result = await db_finanzas.aggregate(pipeline_infracciones).to_list(length=None) 
    total_infracciones = resumen_infr_result[0]["total"] if resumen_infr_result and resumen_infr_result[0].get("total") is not None else 0.0
    
    return {
        "total_mantenimiento": round(total_mantenimiento, 2),
        "total_infracciones": round(total_infracciones, 2),
    }

@router.get("/dashboard", response_model=DashboardResponse, summary="Obtiene un resumen de la flota para el dashboard.")
async def get_dashboard_data():
    db_vehiculos = get_db_collection("Vehiculos")

    # 🔑 CORRECCIÓN 4 y 5: await en count_documents (operaciones asíncronas de Motor)
    total_vehiculos = await db_vehiculos.count_documents({})
    vehiculos_activos = await db_vehiculos.count_documents({"activo": True})
    
    # 🔑 CORRECCIÓN 6: await en la función auxiliar de costos
    resumen_costos = await get_resumen_costos_dashboard(dias_historia=365)
    
    # 🔑 CORRECCIÓN 7: await en la función auxiliar de alertas
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
# 4. ENDPOINTS: GESTIÓN DE COSTOS MANUALES (CRUD) - CORREGIDO
# =========================================================================

"""@router.post("/costos/manual", response_model=CostoItem, status_code=status.HTTP_201_CREATED, summary="Registra un nuevo costo manual.")
async def create_costo_manual(costo: CostoManualInput):
    collection_name = costo.origen 
    collection = get_db_collection(collection_name)
    patente_norm = normalize_patente(costo.patente)

    # Convertir fecha de date a datetime (agregando 00:00:00)
    fecha_datetime = datetime.combine(costo.fecha, datetime.min.time())

    doc_data = {
        "_id": ObjectId(),  # Generar un nuevo ID
        "patente": patente_norm,
        "descripcion": costo.descripcion, 
        "fecha": fecha_datetime,  # Usa datetime para BD
        "origen_manual": True,  # Bandera
    }

    if collection_name == "Finanzas":
        doc_data.update({
            "MONTO": costo.importe,
            "motivo": costo.tipo_costo,
            "dia": costo.fecha.isoformat(),  # String para consistencia
        })
        tipo_para_response = costo.tipo_costo 
    elif collection_name == "Mantenimiento":
        doc_data.update({
            "costo_monto": costo.importe,
            "motivo": costo.tipo_costo,
        })
        tipo_para_response = "Reparación/Mantenimiento"
    else:
        raise HTTPException(status_code=400, detail="Origen de costo no válido.")

    try:
        # 🔑 CORRECCIÓN 1: await en insert_one
        insert_result = await collection.insert_one(doc_data) 
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al insertar el costo manual: {str(e)}")

    # Nota: El _id en la respuesta del CostoItem es el generado por ObjectId()
    return CostoItem(
        _id=str(insert_result.inserted_id), # Aseguramos el ID insertado
        tipo=tipo_para_response,
        fecha=fecha_datetime.isoformat()[:10], # Corregido a formato YYYY-MM-DD
        descripcion=costo.descripcion,
        importe=costo.importe,
        origen=collection_name,
        metadata_adicional=None 
    )"""

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
    
    # 🔑 CORRECCIÓN 2: await en delete_one
    delete_result = await collection.delete_one({"_id": obj_id})
    
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")

    print(f"ELIMINADO FORZADO → {origen} / {id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =========================================================================
# 5. ENDPOINTS: DESCARGA DE ARCHIVOS - CORREGIDO
# =========================================================================

@router.get("/archivos/descargar", summary="Descarga un archivo digital dado su path_relativo.")
# 🔑 CORRECCIÓN: Cambiar 'async def' a 'def' para que FastAPI ejecute el I/O bloqueante en un thread.
def download_file(path_relativo: str = Query(..., description="Ruta relativa del archivo dentro del MEDIA_ROOT.")): 
    
    # La lógica de seguridad de Path Traversal es PERFECTA y se mantiene.
    if '..' in path_relativo or path_relativo.startswith('/') or path_relativo.startswith('\\'):
        raise HTTPException(status_code=400, detail="Ruta de archivo no permitida.")

    # Construir la ruta absoluta y ajustar el separador de ruta del sistema operativo
    file_path = os.path.join(MEDIA_ROOT, path_relativo.replace('/', os.sep))
    
    # Esta es una llamada BLOQUEANTE (os.path.exists).
    # Al estar en un 'def', FastAPI lo gestiona correctamente en el thread pool.
    if not os.path.exists(file_path): 
        raise HTTPException(status_code=404, detail="Archivo no encontrado en el servidor.")
        
    filename = os.path.basename(file_path)
    
    # FileResponse (de Starlette) también maneja eficientemente la lectura del archivo en segundo plano.
    return FileResponse(
        file_path, 
        filename=filename, 
        media_type="application/octet-stream", 
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )

# =========================================================================
# 6. ENDPOINT: LIMPIEZA MASIVA DE COSTOS BASURA - CORREGIDO
# =========================================================================

@router.post("/costos/limpiar-basura", status_code=status.HTTP_200_OK, summary="Elimina en bulk todos los costos con monto 0 (basura del ETL).")
async def limpiar_costos_basura(
    origen: Optional[str] = Query(None, description="Opcional: 'Finanzas' o 'Mantenimiento' para limitar la limpieza a una colección."),
    dry_run: bool = Query(False, description="Si True, simula la limpieza y solo cuenta cuántos se eliminarían (sin borrar).")
) -> Dict[str, Any]:
    """
    Limpia costos fantasma (monto == 0) de las colecciones Finanzas y Mantenimiento.
    - Si 'origen' se especifica, limita a esa colección.
    - Si 'dry_run=True', no borra nada, solo reporta el conteo.
    """
    colecciones = ["Finanzas", "Mantenimiento"] if not origen else [origen]
    if origen and origen not in colecciones:
        raise HTTPException(status_code=400, detail="Origen inválido. Debe ser 'Finanzas' o 'Mantenimiento'.")
    
    total_eliminados = 0
    detalles: Dict[str, int] = {}
    
    for col_name in colecciones:
        collection = get_db_collection(col_name)
        
        # Filtro base: monto == 0 (ajustado por colección)
        filtro = {}
        if col_name == "Mantenimiento":
            filtro = {"costo_monto": 0}
        elif col_name == "Finanzas":
            # Nota: Se usa "MONTO" si es el campo real en mayúsculas de la BD Finanzas
            filtro = {"MONTO": 0} 
        
        # Opcional: Agrega más filtros si quieres (ej: por fecha o tipo)
        
        if dry_run:
            # 🔑 CORRECCIÓN 1: await en count_documents
            count = await collection.count_documents(filtro) 
            detalles[col_name] = count
        else:
            # 🔑 CORRECCIÓN 2: await en delete_many
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