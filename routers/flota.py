from fastapi import APIRouter, HTTPException, Query, status, Response
from fastapi.responses import FileResponse
from typing import List, Optional, Any, Dict
from datetime import datetime, timedelta
import math
from bson.objectid import ObjectId
import os
import re

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

async def get_vencimientos_criticos_alertas(dias_tolerancia: int) -> List[Alerta]:
    """
    Consulta la colección Documentacion y genera alertas para documentos
    cuyo vencimiento está dentro de 'dias_tolerancia' o ya expiró.
    """
    db_documentacion = get_db_collection("Documentacion")
    db_vehiculos = get_db_collection("Vehiculos")
    alertas: List[Alerta] = []

    # 1. Obtener la metadata de todos los vehículos (para modelo, nro_movil)
    vehiculos_cursor = db_vehiculos.find(
        {}, 
        {'_id': 1, 'descripcion_modelo': 1, 'nro_movil': 1}
    )
    vehiculos_list = await vehiculos_cursor.to_list(length=None)
    vehiculos_metadata = {doc['_id']: doc for doc in vehiculos_list}
    
    # 2. Iterar por cada tipo de documento de vencimiento configurado
    for doc_type, config in VENCIMIENTO_MAP.items():
    
        # 3. Consulta MongoDB para documentos de este tipo con fecha de vencimiento NO nula
        documentos_cursor = db_documentacion.find({
            "tipo_documento": doc_type,
            "fecha_vencimiento": {"$ne": None} 
        })
        
        # 🔑 FIX: Convertir el cursor a lista para poder contar y usar la data
        documentos_list = await documentos_cursor.to_list(length=None)

        # 4. Procesar documentos y generar alertas
        for doc in documentos_list: # ⬅️ Usamos la lista, no el cursor original
            patente = doc.get("patente")
            vehiculo_meta = vehiculos_metadata.get(patente)
            doc_type = doc.get("tipo_documento", "DOCUMENTO_DESCONOCIDO") # Usar doc_type

            # Convertir la fecha de BSON a Python datetime
            fecha_vencimiento_mongo = doc.get("fecha_vencimiento") # Fecha original de MongoDB
            fecha_vencimiento = safe_mongo_date_to_datetime(fecha_vencimiento_mongo)

            if not fecha_vencimiento or patente is None:
                # Esta condición ya no debería ejecutarse si el filtro $ne:None funciona
                
                continue

            # Calcular la diferencia en días
            diff_days = (fecha_vencimiento - datetime.now()).days
            
            # 🔑 LOG DEPURACIÓN: Mostrar la diferencia calculada y el umbral
            dias_critico = config.get("dias_critico", dias_tolerancia)
                        
            if diff_days <= dias_critico:
                prioridad = 'CRÍTICA' if diff_days <= 0 else 'ALTA'
                print(f"✅ ALERTA GENERADA: Patente={patente}, Días={diff_days}")
                mensaje = f"EXPIRADO" if diff_days <= 0 else f"Vence en {diff_days} días"
            else:
                
                continue # ⬅️ Si no es crítica, salta a la siguiente iteración
                
            # Crear objeto Alerta
            alerta = Alerta(
                patente=patente,
                tipo_documento=doc_type,
                nombre_legible=config['nombre_legible'],
                fecha_vencimiento=fecha_vencimiento.strftime('%Y-%m-%d'),
                dias_restantes=diff_days,
                mensaje=mensaje,
                prioridad=prioridad,
                movil_nro=vehiculo_meta.get('nro_movil') if vehiculo_meta else None,
                descripcion_modelo=vehiculo_meta.get('descripcion_modelo') if vehiculo_meta else None
            )
            alertas.append(alerta)
    
    # 5. Ordenar: Críticas primero, luego por menos días restantes.
    return sorted(alertas, key=lambda a: (a.prioridad != 'CRÍTICA', a.dias_restantes))

# =========================================================================
# 2. ENDPOINTS: VEHÍCULOS (CRUD)
# =========================================================================

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
    db_vehiculos = get_db_collection("Vehiculos")
    patente_normalizada = normalize_patente(data.patente)
    
    if await db_vehiculos.find_one({"_id": patente_normalizada}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un vehículo con la patente {data.patente.upper()}."
        )
    
    # Preparar el documento, mapeando a los campos de MongoDB (UPPERCASE)
    vehiculo_doc = {
        "_id": patente_normalizada,
        "patente_original": data.patente.upper(),
        "activo": data.activo,
        "ANIO": data.anio,
        "COLOR": data.color,
        "MODELO": data.modelo, 
        "DESCRIPCION_MODELO": data.descripcion_modelo,
        "NRO_MOVIL": data.nro_movil,
        "TIPO_COMBUSTIBLE": data.tipo_combustible,
        "documentos_digitales": [], # Inicializar lista vacía
        "tipo_registro": "MANUAL_CREADO", # Marcador
    }
    
    try:
        await db_vehiculos.insert_one(vehiculo_doc)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al insertar: {str(e)}")
    
    # Mapeo de vuelta para la respuesta Pydantic (snake_case)
    new_vehiculo = await db_vehiculos.find_one({"_id": patente_normalizada})
    vehiculo_data = {
        # Usamos "patente" para mapear al _id (esto asume que el alias en dependencies.py está correcto)
        "patente": new_vehiculo.get("_id"), 
        "patente_original": new_vehiculo.get("patente_original"),
        "activo": new_vehiculo.get("activo", False),
        "anio": new_vehiculo.get("ANIO"),
        "color": new_vehiculo.get("COLOR"),
        "modelo": new_vehiculo.get("MODELO"), 
        "descripcion_modelo": new_vehiculo.get("DESCRIPCION_MODELO"),
        "nro_movil": new_vehiculo.get("NRO_MOVIL"),
        "tipo_combustible": new_vehiculo.get("TIPO_COMBUSTIBLE"),
        "documentos_digitales": new_vehiculo.get("documentos_digitales", []),
    }
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
         updated_doc = await db_vehiculos.find_one({"_id": patente_normalizada})
         if not updated_doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con patente {patente} no encontrado.")
         
    else:
        # 2. Ejecutar la actualización en MongoDB
        update_result = await db_vehiculos.update_one(
            {"_id": patente_normalizada},
            update_doc
        )

        if update_result.matched_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Vehículo con patente {patente} no encontrado.")
            
        # 3. Devolver el documento actualizado
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


# -------------------------------------------------------------------------
# 2.4. GET /vehiculos (Listado con filtros y paginación)
# -------------------------------------------------------------------------
@router.get("/vehiculos", response_model=List[Vehiculo], summary="Lista todos los vehículos con opcional filtrado y paginación.")
async def get_vehiculos(  # ← Renombrado a get_vehiculos (más simple y genérico)
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
                {"DESCRIPCION_MODELO": regex_query}
            ]
        
        cursor = db_vehiculos.find(query).skip(skip).limit(limit)
        vehiculos_list = await cursor.to_list(length=limit)
        
        # Procesar cada documento para mapear a Vehiculo (snake_case)
        vehiculos_response = []
        for doc in vehiculos_list:
            vehiculo_data = {
                "patente": doc.get("_id"),
                "patente_original": doc.get("patente_original"),
                "activo": doc.get("activo", False),
                "anio": doc.get("ANIO"),
                "color": doc.get("COLOR"),
                "modelo": doc.get("MODELO"),
                "descripcion_modelo": doc.get("DESCRIPCION_MODELO"),
                "nro_movil": doc.get("NRO_MOVIL"),
                "tipo_combustible": doc.get("TIPO_COMBUSTIBLE"),
                "documentos_digitales": doc.get("documentos_digitales", []),
            }
            vehiculos_response.append(Vehiculo(**vehiculo_data))
        
        return vehiculos_response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar vehículos: {str(e)}")

# =========================================================================
# 3. ENDPOINTS: REPORTES
# =========================================================================

# -------------------------------------------------------------------------
# 3.1. GET /reportes/vehiculo/{patente} (Reporte por Vehículo)
# -------------------------------------------------------------------------
@router.get("/reportes/vehiculo/{patente}", response_model=ReporteCostosResponse, summary="Obtiene el reporte consolidado de costos para un vehículo específico.")
async def get_reporte_vehiculo(
    patente: str,
    fecha_inicio: Optional[str] = Query(None, description="Fecha de inicio del periodo (YYYY-MM-DD)."),
    fecha_fin: Optional[str] = Query(None, description="Fecha de fin del periodo (YYYY-MM-DD).")
):
    patente_norm = normalize_patente(patente)
    db_vehiculos = get_db_collection("Vehiculos")
    db_mant = get_db_collection("Mantenimiento")
    db_finanzas = get_db_collection("Finanzas")

    # Validar patente
    if not await db_vehiculos.find_one({"_id": patente_norm}):
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")

    # Fechas default: últimos 365 días
    end_dt = datetime.now()
    start_dt = end_dt - timedelta(days=365) if not fecha_inicio else datetime.fromisoformat(fecha_inicio)
    if fecha_fin:
        end_dt = datetime.fromisoformat(fecha_fin)

    total_mantenimiento = 0.0
    total_infracciones = 0.0
    costos_list: List[CostoItem] = []

    # === 4. MANTENIMIENTO ===
    mant_cursor = db_mant.find({"patente": patente_norm})
    mant_list = await mant_cursor.to_list(length=None)
    for doc in mant_list:
        fecha_raw = doc.get("fecha")
        if not fecha_raw:
            continue
        
        fecha_dt = safe_mongo_date_to_datetime(fecha_raw)
        if not fecha_dt or not (start_dt <= fecha_dt <= end_dt):
            continue
        
        monto = doc.get("costo_monto", 0)
        if math.isnan(monto):
            monto = 0
        
        fecha_iso = fecha_dt.strftime("%Y-%m-%d") if fecha_dt else "N/A"
        
        total_mantenimiento += monto
        costos_list.append(CostoItem(
            _id=str(doc["_id"]),
            tipo=TIPO_POR_ORIGEN["Mantenimiento"],
            fecha=fecha_iso,
            descripcion=doc.get("DESCRIPCION", "Servicio técnico"),
            importe=monto,
            origen="Mantenimiento"
        ))

    # === 5. FINANZAS (infracciones + gastos manuales) ===
    finanzas_cursor = db_finanzas.find({"patente": patente_norm})
    finanzas_list = await finanzas_cursor.to_list(length=None)
    for doc in finanzas_list:
        try:
            # --- Parseo seguro de fecha ---
            fecha_raw = doc.get("dia") or doc.get("fecha")
            if not fecha_raw or fecha_raw in ["N/A", "", None]:
                continue

            if isinstance(fecha_raw, datetime):
                fecha_dt = fecha_raw
            else:
                fecha_str = str(fecha_raw).strip()
                try:
                    d, m, a = re.split(r'[\/\-\.]', fecha_str)
                    fecha_dt = datetime(int(a), int(m), int(d))
                except:
                    continue

            if not (start_dt <= fecha_dt <= end_dt):
                continue

            # --- Monto ---
            monto = float(doc.get("MONTO") or doc.get("monto") or 0)

            # --- Tipo usando la constante centralizada ---
            tipo_registro = doc.get("tipo_registro", "").upper()
            if tipo_registro == "INFRACCION":
                total_infracciones += monto
                tipo_final = "Infracción"  # ← agregalo al mapa si querés
            else:
                # Si es gasto manual, usamos el tipo_costo que venga, o fallback
                tipo_final = doc.get("tipo_costo", "Otros")

            # Si querés ser 100% consistente, agregá esto arriba del archivo:
            # TIPO_POR_ORIGEN["Infracción"] = "Infracción"

            costos_list.append(CostoItem(
                _id=str(doc["_id"]),
                tipo=TIPO_POR_ORIGEN.get(tipo_final, tipo_final),  # ← LA FORMA MÁS PRO
                fecha=fecha_dt.strftime("%Y-%m-%d"),
                descripcion=(doc.get("motivo") or doc.get("ACTA") or "Sin descripción")[:100],
                importe=monto,
                origen="Finanzas"
            ))

        except Exception as e:
            print(f"Error procesando Finanzas {doc.get('_id')}: {e}")
            continue

    # === 6. Ordenar por fecha descendente ===
    costos_list.sort(key=lambda x: x.fecha or "1900-01-01", reverse=True)

    # === 7. Alertas (síncrono) ===
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
# 3.2. GET /dashboard (Resumen de la Flota) - FALTANTE
# -------------------------------------------------------------------------
# Función auxiliar (se define fuera del endpoint)
async def get_resumen_costos_dashboard(dias_historia: int = 365) -> Dict[str, float]:
    db_mant = get_db_collection("Mantenimiento")
    db_finanzas = get_db_collection("Finanzas")

    end_date = datetime.now()
    start_date = end_date - timedelta(days=dias_historia)
    start_date_iso = start_date.isoformat() # Se usa ISO string para Finanzas
    end_date_iso = end_date.isoformat()

    # Total Mantenimiento (campo 'fecha' BSON Date)
    pipeline_mant = [
        { "$match": { "fecha": { "$gte": start_date, "$lte": end_date } } },
        { "$group": { "_id": None, "total": { "$sum": "$costo_monto" } } }
    ]
    mant_agg_cursor = db_mant.aggregate(pipeline_mant)
    resumen_mant_result = await mant_agg_cursor.to_list(length=None)
    total_mantenimiento = resumen_mant_result[0]["total"] if resumen_mant_result and resumen_mant_result[0].get("total") is not None else 0.0

    # Total Infracciones (campo 'dia' string/date)
    pipeline_infracciones = [
        { 
            "$match": { 
                "tipo_registro": "Infraccion",
                "dia": { "$gte": start_date_iso, "$lte": end_date_iso }
            }
        },
        { "$group": { "_id": None, "total": { "$sum": "$MONTO" } } }
    ]
    infr_agg_cursor = db_finanzas.aggregate(pipeline_infracciones)
    resumen_infr_result = await infr_agg_cursor.to_list(length=None)
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

@router.post("/costos/manual", response_model=CostoItem, status_code=status.HTTP_201_CREATED, summary="Registra un nuevo costo manual.")
async def create_costo_manual(costo: CostoManualInput):
    collection_name = costo.origen 
    collection = get_db_collection(collection_name)
    patente_norm = normalize_patente(costo.patente)

    # Convertir fecha de date a datetime (agregando 00:00:00)
    fecha_datetime = datetime.combine(costo.fecha, datetime.min.time())  # FIX CLAVE

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
        await collection.insert_one(doc_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al insertar el costo manual: {str(e)}")

    # Return corregido: Matching exacto con CostoItem (sin patente, con metadata default None)
    return CostoItem(
        tipo=tipo_para_response,  # FIX: 'tipo' en vez de 'tipo_costo'
        fecha=fecha_datetime.isoformat(),  # FIX: str ISO
        descripcion=costo.descripcion,
        importe=costo.importe,
        origen=collection_name,
        metadata_adicional=None  # Optional, default None
    )

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
    
    # ANTES: solo borraba si tenía origen_manual: True
    # AHORA: BORRA TODO SIN PREGUNTAR → MODO LIMPIEZA TOTAL
    delete_result = await collection.delete_one({"_id": obj_id})
    
    if delete_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro no encontrado.")

    print(f"ELIMINADO FORZADO → {origen} / {id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =========================================================================
# 5. ENDPOINTS: DESCARGA DE ARCHIVOS
# =========================================================================

@router.get("/archivos/descargar", summary="Descarga un archivo digital dado su path_relativo.")
async def download_file(path_relativo: str = Query(..., description="Ruta relativa del archivo dentro del MEDIA_ROOT.")):
    
    if '..' in path_relativo or path_relativo.startswith('/') or path_relativo.startswith('\\'):
        raise HTTPException(status_code=400, detail="Ruta de archivo no permitida.")

    # Construir la ruta absoluta y ajustar el separador de ruta del sistema operativo
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
            filtro = {"monto": 0}  # O "MONTO": 0 si es uppercase en tu BD
        
        # Opcional: Agrega más filtros si quieres (ej: por fecha o tipo)
        # filtro["fecha"] = {"$gte": datetime(2025, 1, 1)}  # Ej: solo desde 2025
        # filtro["tipo_registro"] = "SERVICIO_RENAULT"  # Ej: solo ciertos tipos
        
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