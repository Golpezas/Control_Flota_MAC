from __future__ import annotations
from pymongo import MongoClient
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional, Any, Dict, Iterable
from datetime import datetime, date # Importado 'date'
import math
from dateutil.parser import parse, ParserError
from fastapi import HTTPException
from bson.objectid import ObjectId
import re # Necesario para normalize_patente

import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

# =================================================================
# CONFIGURACIÓN MONGODB – POR VARIABLES DE ENTORNO
# =================================================================
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "MacSeguridadFlota")

if not MONGO_URI:
    raise RuntimeError("Falta MONGO_URI en las variables de entorno")

# Cliente global
_client: Optional[AsyncIOMotorClient] = None

def connect_to_mongodb():
    """Función que usa tu main.py en startup"""
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGO_URI)
        try:
            _client.admin.command('ping')
            print("Conexión a MongoDB Atlas exitosa")
        except Exception as e:
            print(f"Error al conectar a MongoDB: {e}")
            raise
    return _client

def get_db_collection(collection_name: str):
    """Función que usan todos tus routers"""
    if _client is None:
        connect_to_mongodb()
    db = _client[DB_NAME]
    return db[collection_name]

# =================================================================
# MODELOS Y MAPEO
# =================================================================
from pydantic import BaseModel
class UpdateMonto(BaseModel):
    monto: float
    motivo: Optional[str] = None

# Mapeo de vencimientos
VENCIMIENTO_MAP = {
    'Poliza_Detalle': {'nombre_legible': 'Póliza de Seguro', 'dias_critico': 15},
    'VTV': {'nombre_legible': 'Verificación Técnica Vehicular (VTV)', 'dias_critico': 30},
    'GAS': {'nombre_legible': 'Oblea GNC', 'dias_critico': 30},
    'TARJ YPF': {'nombre_legible': 'Tarjeta YPF', 'dias_critico': 15},
}

# Configuración de base para modelos con campos numéricos
BASE_CONFIG_WITH_NUMERIC_FIX = ConfigDict(
    populate_by_name=True,
    # SOLUCIÓN DEFINITIVA ANTI-NAN: 
    # Mapea ObjectId a str para la respuesta JSON.
    # Si encuentra un float('nan'), lo convierte a None (que es 'null' en JSON)
    json_encoders={
        ObjectId: str,
        float: lambda v: v if not math.isnan(v) else None
    }
)

# =========================================================================
# 2. MODELOS DE DATOS (PYDANTIC)
# =========================================================================

# --- SUB-MODELOS PARA REPORTES ---

class DatoAgregado(BaseModel):
    """Estructura para datos resumidos en reportes (ej: Costos por Categoría)."""
    categoria: str
    total: float

# --- MODELOS DE RESPUESTA PARA ENDPOINTS ESPECÍFICOS ---

class ReportePeriodoResponse(BaseModel):
    """Modelo de respuesta para el reporte consolidado de costos por periodo."""
    fecha_inicio: str = Field(..., description="Fecha de inicio del periodo consultado (YYYY-MM-DD).")
    fecha_fin: str = Field(..., description="Fecha de fin del periodo consultado (YYYY-MM-DD).")
    datos_agregados: List[DatoAgregado] = Field(..., description="Totales de costo agrupados por categoría.")
    total_general: float = Field(..., description="Suma de todos los costos en el periodo.")
    total_mantenimiento: float = Field(..., description="Suma de todos los costos de Mantenimiento.")
    total_infracciones: float = Field(..., description="Suma de todos los costos de Infracciones.")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

class DashboardResponse(BaseModel):
    """Modelo de respuesta para el resumen de datos clave del Dashboard."""
    total_vehiculos: int = Field(..., description="Cantidad total de vehículos en la flota.")
    vehiculos_activos: int = Field(..., description="Cantidad de vehículos marcados como activos.")
    ultimas_alertas: List[Alerta] = Field(..., description="Las 5 alertas de vencimiento más críticas.")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX
    
# Modelo para un ítem de costo detallado
class CostoItem(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    tipo: str = Field(..., description="Tipo de costo (e.g., 'Servicio', 'Reparación', 'Multa/Infracción').")
    fecha: str = Field(..., description="Fecha del evento (en formato string).")
    descripcion: str
    importe: float = Field(..., description="Monto del costo, > 0.0.")
    origen: str = Field(..., description="Colección de origen ('Mantenimiento' o 'Finanzas').")
    metadata_adicional: Optional[Dict[str, Any]] = Field(None, description="Metadatos adicionales del documento original.")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

# Modelo de respuesta para el reporte consolidado de costos por vehículo
class ReporteCostosResponse(BaseModel):
    patente: str
    total_costos_mantenimiento: float = Field(..., alias="total_mantenimiento")
    total_costos_infracciones: float = Field(..., alias="total_infracciones")
    total_general: float
    detalles: List[CostoItem]
    # 🔑 NUEVO CAMPO AGREGADO
    documentos_digitales: Optional[List[DocumentoDigital]] = Field(None, description="Lista de documentos digitales asociados al vehículo.")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

class DocumentoDigital(BaseModel):
    tipo: Optional[str] = None
    nombre_archivo: Optional[str] = Field(None, alias="nombre_archivo")
    path_esperado: Optional[str] = Field(None, alias="path_esperado")
    nombre_archivo_patron: Optional[str] = Field(None, alias="nombre_archivo_patron")
    path_patron_ejemplo: Optional[str] = Field(None, alias="path_patron_ejemplo")

class Alerta(BaseModel):
    patente: str
    tipo_documento: str
    fecha_vencimiento: str
    dias_restantes: int
    mensaje: str
    prioridad: str
    movil_nro: Optional[str] = Field(None, description="Número de móvil.")
    descripcion_modelo: Optional[str] = Field(None, description="Descripción del modelo de vehículo.")
    
class UpdateMonto(BaseModel):
    monto: float = Field(..., gt=0, description="Nuevo monto a asignar (mayor que cero).")
    motivo: Optional[str] = Field(None, max_length=500, description="Motivo de la actualización o nota.")

# --- MODELO VEHICULOS ---

class VehiculoBase(BaseModel):
    nro_movil: Optional[str] = Field(None, alias="nro_movil", description="Número de móvil de la flota.") # 💡 CORRECCIÓN
    modelo: Optional[str] = Field(None, alias="modelo") # 💡 CORRECCIÓN
    ubicacion: Optional[str] = Field(None, alias="UBICACION")
    tipo: Optional[str] = Field(None, alias="TIPO", description="Tipo de vehículo (Ej: Camioneta, Auto).")
    area: Optional[str] = Field(None, alias="AREA", description="Área o sector asignado.")
    responsable: Optional[str] = Field(None, alias="RESPONSABLE", description="Nombre del responsable del vehículo.")
    
    # anio es float para manejar 'nan' si viene de un proceso ETL
    anio: Optional[float] = Field(None, alias="anio", description="Año de fabricación del vehículo.") # 💡 CORRECCIÓN
    
    color: Optional[str] = Field(None, alias="COLOR", description="Color del vehículo.")
    tipo_combustible: Optional[str] = Field(None, alias="TIPO_COMBUSTIBLE", description="Tipo de combustible (Nafta/Diesel/GNC).")
    descripcion_modelo: Optional[str] = Field(None, alias="descripcion_modelo", description="Descripción del modelo (Ej: Renault Clio).") # 💡 CORRECCIÓN
    medidas_cubiertas: Optional[str] = Field(None, alias="MEDIDAS_CUBIERTAS", description="Especificaciones de las cubiertas.")
    clave_radio: Optional[str] = Field(None, alias="clave_radio", description="Clave de radio.") # Mapeado correctamente a 'clave_radio' minúscula
    activo: Optional[bool] = Field(None, alias="activo", description="Estado de actividad del vehículo.") # Mapeado correctamente a 'activo' minúscula

    documentacion: Optional[Dict[str, Any]] = Field(None, alias="DOCUMENTACION", description="Fechas de vencimiento y datos de documentación.")
    documentos_digitales: Optional[List[DocumentoDigital]] = Field(None, alias="documentos_digitales", description="Lista de documentos digitales.")
    
    # costo_adquisicion es float para manejar 'nan'
    costo_adquisicion: Optional[float] = Field(None, alias="COSTO_ADQUISICION", description="Costo inicial de compra.")

    
class Vehiculo(VehiculoBase):
    # 💡 CORRECCIÓN CRÍTICA: Usa 'alias="_id"' para mapear el ID de Mongo a la Patente
    patente: str = Field(..., alias="_id", description="Patente o ID único del vehículo.")
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

class VehiculoCreate(VehiculoBase):
    patente: str = Field(..., alias="_id", description="Patente o ID único del vehículo.")
    
class VehiculoUpdate(VehiculoBase):
    pass

# --- MODELO MANTENIMIENTO ---
class Mantenimiento(BaseModel):
    # 'id' se usa para el _id de MongoDB (ObjectId)
    id: Optional[str] = Field(None, alias="_id", description="ID único del registro (ObjectId de MongoDB).")
    patente: Optional[str] = Field(None, alias="patente")
    nro_registro: Optional[float] = Field(None, alias="NRO", description="Número de registro. Float para manejar NaN.")
    fecha: Optional[datetime] = Field(None, alias="fecha")
    kilometraje_km: Optional[float] = Field(None, alias="kilometraje_km")
    motivo: Optional[str] = Field(None, alias="motivo")
    descripcion: Optional[str] = Field(None, alias="DESCRIPCIN") # Alias de 'DESCRIPCIN'
    lugar: Optional[str] = Field(None, alias="lugar")
    factura_nro: Optional[str] = Field(None, alias="factura_nro")
    fecha_de_pago: Optional[datetime] = Field(None, alias="FECHA_DE_PAGO") # Alias de 'FECHA_DE_PAGO'
    costo_monto: Optional[float] = Field(None, alias="costo_monto", description="Costo total. Float para manejar 0 o NaN.")
    observaciones: Optional[str] = Field(None, alias="OBSERVACIONES") # Alias de 'OBSERVACIONES'
    tipo_registro: Optional[str] = Field(None, alias="tipo_registro")
    movil_n: Optional[float] = Field(None, alias="MOVIL_N", description="Número de móvil. Float para manejar NaN.")
    chasis_n: Optional[str] = Field(None, alias="CHASIS_N")
    quien_intervino: Optional[Optional[str]] = Field(None, alias="QUIEN_INTERVINO")
    prox_serv_km: Optional[float] = Field(None, alias="prox_serv_km", description="Próximo servicio en km. Float para manejar NaN.")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

# --- MODELO FLOTA ESTADO ---
class FlotaEstado(BaseModel):
    id: Optional[str] = Field(None, alias="_id", description="ID único del registro (ObjectId de MongoDB).")
    patente: Optional[str] = Field(None, alias="patente")
    fecha_estado: Optional[datetime] = Field(None, alias="fecha_estado")
    motivo_estado_transferencia: Optional[str] = Field(None, alias="motivo_estado_transferencia")
    motivo_estado_otro: Optional[str] = Field(None, alias="motivo_estado_otro")
    estado: Optional[str] = Field(None, alias="estado")
    tipo: Optional[str] = Field(None, alias="tipo")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX
    
# --- MODELO FINANZAS ---

class Finanzas(BaseModel):
    id: Optional[str] = Field(None, alias="_id", description="ID único del registro (ObjectId de MongoDB).")
    patente: Optional[str] = Field(None, alias="patente")
    nro_registro: Optional[float] = Field(None, alias="NRO", description="Número de registro. Float para manejar NaN.")
    acta: Optional[str] = Field(None, alias="ACTA")
    dia: Optional[str] = Field(None, alias="dia", description="Fecha de la infracción como string (ej: 25/9/2024).")
    anio_multa: Optional[float] = Field(None, alias="AO", description="Año de la multa. Float para manejar NaN.") # Alias de 'AO'
    hora: Optional[str] = Field(None, alias="HORA")
    monto: Optional[float] = Field(None, alias="monto")
    hasta_fecha: Optional[str] = Field(None, alias="HASTA")
    motivo: Optional[str] = Field(None, alias="motivo")
    lugar: Optional[str] = Field(None, alias="lugar")
    conductor: Optional[str] = Field(None, alias="conductor")
    datos_acompanante: Optional[str] = Field(None, alias="DATOS_ACOMPAANTE") # Alias de 'DATOS_ACOMPAANTE'
    con_imagen: Optional[str] = Field(None, alias="CON_IMAGEN") # Alias de 'CON_IMAGEN'
    tipo_registro: Optional[str] = Field(None, alias="tipo_registro")
    jurisdiccion: Optional[str] = Field(None, alias="jurisdiccion")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

# --- MODELO DOCUMENTACION ---
class Documentacion(BaseModel):
    id: Optional[str] = Field(None, alias="_id", description="ID único del registro (ObjectId de MongoDB).")
    patente: Optional[str] = Field(None, alias="patente")
    tipo_documento: Optional[str] = Field(None, alias="tipo_documento", description="Tipo (Cedula, Seguro, VTV, etc.)")
    fecha_vencimiento: Optional[datetime] = Field(None, alias="fecha_vencimiento")
    aseguradora: Optional[str] = Field(None, alias="aseguradora")
    
    # Todos los campos de costo/monto son float para manejar NaN
    suma_asegurada: Optional[float] = Field(None, alias="suma_asegurada")
    costo_semestral: Optional[float] = Field(None, alias="costo_semestral")
    costo_mensual: Optional[float] = Field(None, alias="costo_mensual")
    monto_franquicia: Optional[float] = Field(None, alias="monto_franquicia")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

# --- MODELO COMPONENTES ---
class Componente(BaseModel):
    id: Optional[str] = Field(None, alias="_id", description="ID único del registro (ObjectId de MongoDB).")
    patente: Optional[str] = Field(None, alias="patente")
    tipo_componente: Optional[str] = Field(None, alias="tipo_componente")
    fecha_instalacion: Optional[datetime] = Field(None, alias="fecha_instalacion")
    # kilometraje_instalacion es float para manejar 'null' o 'NaN'
    kilometraje_instalacion: Optional[float] = Field(None, alias="kilometraje_instalacion")
    
    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

# =========================================================================
# 3. CONEXIÓN A MONGODB
# =========================================================================

##client: Optional[MongoClient] = None

##def connect_to_mongodb():
 ##   """Función principal para establecer la conexión a MongoDB."""
 ##   global client
 ##   if client is None:
 ##       try:
  ##          client = MongoClient(CONNECTION_STRING)
  ##          client.admin.command('ping') 
  ##          print("✅ Conexión a MongoDB Atlas exitosa.")
  ##      except Exception as e:
  ##          print(f"❌ Error al conectar a MongoDB: {e}")
  ##          client = None
  ##          print("⚠️ ADVERTENCIA: La conexión a MongoDB falló durante el inicio.")


##def get_db_client():
##    """Retorna el cliente de MongoDB conectado, o lanza error si no se pudo conectar."""
##    if client is None:
##        raise HTTPException(status_code=500, detail="Error: Conexión a la base de datos no establecida.")
##    return client

##def get_db_collection(collection_name: str):
##    """Retorna una colección específica de la base de datos."""
##    try:
##        db = get_db_client()[DB_NAME]
##        return db[collection_name]
##    except Exception as e:
##        print(f"❌ Error al acceder a la base de datos/colección: {e}")
##        raise HTTPException(status_code=500, detail="Error al acceder a la base de datos o colección.")

# =========================================================================
# 4. FUNCIONES AUXILIARES DE LIMPIEZA Y FECHA
# =========================================================================

def safe_mongo_date_to_datetime(date_raw: Any) -> Optional[datetime]:
    """Convierte una fecha desde MongoDB (datetime, string, o float nan) a objeto datetime, manejando errores."""
    
    # Caso 1: Ya es datetime
    if isinstance(date_raw, datetime):
        return date_raw.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Caso 2: Es un valor nulo o NaN
    if date_raw is None or (isinstance(date_raw, float) and math.isnan(date_raw)):
        return None
        
    # Caso 3: Es un string que representa un valor nulo
    if isinstance(date_raw, str) and date_raw.strip().upper() in ["", "NONE", "NAN", "N/A", "SIN VENCIMIENTO", "NULL"]:
        return None
        
    try:
        # Caso 4: Intentar parsear la fecha, asumiendo día primero por defecto
        # Se asegura de manejar fechas incompletas o en formatos variados
        return parse(str(date_raw), dayfirst=True).replace(hour=0, minute=0, second=0, microsecond=0)
    except ParserError:
        print(f"⚠️ Error al parsear fecha: '{date_raw}'")
        return None
    except Exception as e:
        print(f"❌ Excepción inesperada al parsear fecha '{date_raw}': {e}")
        return None

def normalize_patente(patente: str) -> str:
    """Normaliza una patente para usarla como _id en MongoDB (mayúsculas, sin espacios)."""
    # Elimina cualquier caracter que no sea letra o número y convierte a mayúsculas
    return re.sub(r'[^a-zA-Z0-9]', '', patente).upper()

def safe_sort_costos(costos: Iterable[Any]) -> List[CostoItem]:
    validos = []
    invalidos = []

    for item in costos:
        if item is None:
            continue
        if isinstance(item, list):
            if item:
                item = item[0]
            else:
                continue
        if not isinstance(item, dict) or 'fecha' not in item:
            invalidos.append(str(item)[:200])
            continue

        # 🔑 FIX: Convertir NaN a 0, incluir 0 (mostrar todos)
        importe = item.get('importe', 0)
        if math.isnan(importe):
            item['importe'] = 0
            print(f"NOTE: Converted NaN to 0 for item: {item.get('tipo_costo')}")

        try:
            dt = safe_mongo_date_to_datetime(item.get("fecha"))
            validos.append((dt or datetime.min, item))
        except Exception as e:
            invalidos.append(f"Error parseando fecha: {item.get('fecha')} → {e}")

    validos.sort(key=lambda x: x[0] if x[0] else datetime.min)

    if invalidos:
        print(f"ADVERTENCIA: {len(invalidos)} costos inválidos ignorados:")
        for i, inv in enumerate(invalidos[:5], 1):
            print(f"  {i}. {inv}")
        if len(invalidos) > 5:
            print(f"  ... y {len(invalidos)-5} más.")

    return [item for _, item in validos]

# =========================================================================
# 5. MODELOS DE INPUT PARA GASTOS MANUALES
# =========================================================================

class CostoManualInput(BaseModel):
    """
    Define el input requerido para que el usuario ingrese un costo
    de forma manual (Reparación, Multa, Neumático, Batería, etc.).
    """
    patente: str = Field(..., description="Patente del vehículo al que se aplica el costo.")
    tipo_costo: str = Field(..., description="Clasificación del costo (ej: 'Reparación Mayor', 'Multa', 'Neumático').")
    fecha: date = Field(..., description="Fecha en que ocurrió o se pagó el costo.") # 🔑 CORRECCIÓN: Usar tipo 'date'
    descripcion: str = Field(..., description="Descripción detallada del gasto.")
    importe: float = Field(..., gt=0, description="Monto total del gasto (debe ser mayor a cero).")
    # Utilizamos el nombre de la colección destino como Origen (para el DELETE)
    origen: str = Field(..., pattern="^(Finanzas|Mantenimiento)$", description="Colección destino: 'Finanzas' o 'Mantenimiento'.")

    model_config = BASE_CONFIG_WITH_NUMERIC_FIX

class CostoManualDelete(BaseModel):
    """
    Define el input requerido para eliminar un costo manual.
    Se requiere el ID del documento y la colección de origen.
    """
    id: str = Field(..., description="ID del documento de costo a eliminar (ObjectId en formato string).")
    origen: str = Field(..., pattern="^(Finanzas|Mantenimiento)$", description="Colección de origen: 'Finanzas' o 'Mantenimiento'.")

    model_config = BASE_CONFIG_WITH_NUMERIC_FIX