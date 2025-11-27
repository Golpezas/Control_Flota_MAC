import pandas as pd
from pymongo import MongoClient
from datetime import datetime
import os
import re
import numpy as np 
from typing import Dict, List, Any, Optional
import uuid 
# Librerías profesionales para manejo de fechas y errores de parseo
from dateutil.parser import parse, ParserError 
from pandas.api.types import is_datetime64_any_dtype as is_datetime
from datetime import datetime, timedelta

# [CORRECCIÓN INICIAL] Configuración para silenciar el FutureWarning de downcasting en Pandas
pd.set_option('future.no_silent_downcasting', True)

# =========================================================================
# 1. CONFIGURACIÓN (ACTUALIZADA LA RUTA BASE DE DOCUMENTOS DIGITALES)
# =========================================================================
# Importante: Reemplaza tu contraseña aquí.
DB_PASSWORD = "VhNG9h2rfXAy2xxv" 
CONNECTION_STRING = f"mongodb+srv://antoniohernandezmm_db_user:{DB_PASSWORD}@flotacluster.yipfgjz.mongodb.net/?retryWrites=true&w=majority&appName=FlotaCluster"
DB_NAME = 'MacSeguridadFlota'
CSV_FOLDER = 'Archivos_CSV'

# --- RUTA RAÍZ CONSOLIDADA ---
# Nueva carpeta raíz que contiene subcarpetas nombradas con la PATENTE
DOCUMENTOS_DIGITALES_ROOT = 'Documentos-Digitales' 
# Esta será la única ruta base utilizada para la construcción de paths.
DOC_RAIZ = DOCUMENTOS_DIGITALES_ROOT.replace('\\', '/')

# Formatos de fecha comunes para una conversión robusta
DATE_FORMATS = [
    '%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d',  
    '%d/%m/%y', '%d-%m/%y',              
    '%d/%m/%Y %H:%M:%S', '%Y/%m/%d %H:%M:%S', 
    '%d.%m.%Y',                          
    '%d/%m'
] 

# 2. MAPA DE COLUMNAS (NORMALIZACIÓN DE ESTRUCTURA)
CSV_COLUMN_MAP = {
    'Patente': 'patente',
    'Nro Movil': 'nro_movil',
    'Tipo de Comb': 'tipo_combustible',
    'Modelo': 'descripcion_modelo',
    'Vencimiento Cedula': 'vencimiento_cedula',
    'Vencimiento Seguro': 'vencimiento_seguro', 
    'Aseguradora': 'aseguradora',
    'VENC GAS': 'vencimiento_gas',
    'VTV': 'vencimiento_vtv',
    'Color': 'color',
    'Año': 'anio',
    'MOVIL': 'nro_movil_alias', 
    # Añadir otras columnas si se usan
}

# 3. MAPA DE DOCUMENTACIÓN (LÓGICA DE EXTRACCIÓN DE VENCIMIENTOS)
DOCUMENTATION_MAP = {
    'vencimiento_seguro': {
        'tipo_documento': 'Poliza_Detalle', 
        'extra_fields': ['aseguradora'], 
    },
    'vencimiento_vtv': {
        'tipo_documento': 'VTV',
        'extra_fields': [],
    },
    'vencimiento_gas': {
        'tipo_documento': 'GAS',
        'extra_fields': [],
    },
    'vencimiento_cedula': {
        'tipo_documento': 'Cedula',
        'extra_fields': [],
    },
}

# =========================================================================
# 2 FUNCIONES 
# AUXILIARES DE LIMPIEZA Y CONVERSIÓN
# =========================================================================

def cleanup_dataframe_for_mongo(df: pd.DataFrame) -> pd.DataFrame:
    """
    [CORRECCIÓN DEFINITIVA DE NaT] 
    Convierte NaT (Pandas Not a Time) y NaN (Not a Number) a None de Python. 
    Asegura que las columnas de fecha sean de tipo 'object' con objetos Python nativos 
    para la serialización de MongoDB.
    """
    print("  [LOG-LIMPIEZA] Aplicando saneamiento final de NaT/NaN a None y forzando tipos nativos.")
    
    df_cleaned = df.copy()

    # 1. Aplicar .mask(pd.isna, None) para convertir todos los nulos (NaN, NaT) a Python None.
    df_cleaned = df_cleaned.mask(pd.isna, None)
    
    # 2. [LÍNEA CRÍTICA] Forzar columnas de fecha/tiempo a dtype 'object'.
    for col in df_cleaned.select_dtypes(include=['datetime64[ns]']).columns:
        
        # Se aplica nuevamente la conversión, pero esta vez se fuerza el dtype 'object'.
        df_cleaned[col] = df_cleaned[col].apply(lambda x: x.to_pydatetime() if pd.notna(x) else None).astype(object)
        
    return df_cleaned


def clean_column_key(key: Any) -> str:
    """Limpia y estandariza las claves de columna."""
    key = str(key).lstrip('\ufeff').lstrip('Ï»¿')
    key = key.upper().strip()
    key = re.sub(r'[^\w\s]', '', key) 
    key = re.sub(r'\s+', '_', key)
    return key

def rename_and_filter(df: pd.DataFrame, column_map: Dict[str, str]) -> pd.DataFrame:
   
    """Renombra columnas de un DataFrame basándose en un mapa limpio."""
    cleaned_map = {clean_column_key(k): v for k, v in column_map.items()}
    # Renombra solo las columnas que existen en el DataFrame
    return df.rename(columns={k: v for k, v in cleaned_map.items() if k in df.columns})

def safe_date_convert(series: pd.Series) -> pd.Series:
    
    #Convierte una Serie de Pandas a datetime, manejando múltiples formatos.
    #Retorna una Serie de 'object' dtype con datetime.datetime o None de Python.
    
    
    # 1. Limpieza de strings de valores faltantes
    series_cleaned = series.astype(str).str.upper().str.strip()
    missing_value_strings = ['NAN', 'NONE', 'N/A', 'SIN FECHA', '', 'NO', 'NA'] 
    series_cleaned = series_cleaned.replace(missing_value_strings, np.nan) 
    
    # 2. Intento inicial con `dayfirst=True`
    dates = pd.to_datetime(series_cleaned, errors='coerce', dayfirst=True)

    # 3. Lógica de reintento para formatos específicos
    if dates.isna().sum() > len(series_cleaned) / 2: 
        for fmt in DATE_FORMATS:
    
            failed_indices = dates[dates.isna()].index
            if failed_indices.empty:
                break
            try:
                # El warning sobre la ambigüedad del año es de Python, no de Pandas o del código
                converted_part = pd.to_datetime(series_cleaned.loc[failed_indices], format=fmt, errors='coerce')
                dates.loc[failed_indices] = converted_part.loc[failed_indices]
            except ValueError:
                continue 

    # 4. Convierte NaT a None, y Timestamp a datetime nativo de Python, forzando dtype object
    # El retorno es compatible con PyMongo.
    return dates.apply(lambda x: x.to_pydatetime() if pd.notna(x) else None).astype(object)


def safe_currency_convert(series: pd.Series) -> pd.Series:
    """
    Convierte una Serie de formato moneda latino/argentino a un valor numérico float.
    """
    if series.empty:
        return series
    
    original_series = series.astype(str)
    
    # 1. Limpieza: Eliminar caracteres no numéricos, excepto punto y coma.
    s = original_series.str.replace(r'[^\d\.,]', '', regex=True).str.strip() 

    # 2. Identificar valores en formato Latam (Ej: 84.137,58) 
    latam_mask = s.str.contains(r'\.') & s.str.contains(r',')

    # 3. Procesar valores Latam: Remover miles (punto) y cambiar coma por punto decimal.
    s.loc[latam_mask] = s.loc[latam_mask].str.replace('.', '', regex=False) 
    s.loc[latam_mask] = s.loc[latam_mask].str.replace(',', '.', regex=False) 

    # 4. Procesar valores con solo coma: cambiar coma por punto decimal (cubre casos como 420,00)
    only_comma_mask = (~latam_mask) & s.str.contains(r',')
    s.loc[only_comma_mask] = s.loc[only_comma_mask].str.replace(',', '.', regex=False)

    # 5. Convertir a numérico, forzando NaNs para fallos
    numeric_series = pd.to_numeric(s, errors='coerce')
    
    # 6. Rellenar NaNs con 0 y redondear
    return numeric_series.fillna(0).round(2)

def add_unique_id(df: pd.DataFrame) -> pd.DataFrame:
    """Añade un campo '_id' único (UUID string) a cada registro del DataFrame."""
    if df.empty:
        return df
    print(f"  [LOG-ID] Generando _id único para {len(df)} registros.")
   
    # Genera un ID de tipo string (UUID v4) para que sea el _id de MongoDB
    df['_id'] = [str(uuid.uuid4()) for _ in range(len(df))] 
    return df

# =========================================================================
# 2.1 FUNCIONES DE UTILIDAD Y NORMALIZACIÓN
# =========================================================================

def normalize_patente(patente: Any) -> str:
    """
    Normaliza la patente a mayúsculas, elimina espacios y caracteres especiales. 
    Usada como llave primaria (_id) en la colección Vehiculos.
    """
    if pd.isna(patente) or patente is None:
        return ""
    patente_str = str(patente).strip().upper()
    return re.sub(r'[^A-Z0-9]', '', patente_str)

def normalize_date_for_mongo(date_raw: Any) -> Optional[datetime]:
    """
    Intenta parsear una fecha raw a un objeto datetime, manejando diversos formatos 
    (d/m/Y y m-YY). Retorna None si el parseo falla o es un valor centinela.
    """
    if pd.isna(date_raw) or date_raw is None:
        return None
    
    date_str = str(date_raw).strip().upper()

    # 1. Manejo de valores centinela (documentado)
    if date_str in ["SIN VENCIMIENTO", "NULL", "N/A", "NO APLICA"]:
        return None
    
    # Si ya es un objeto datetime, lo limpiamos
    if isinstance(date_raw, datetime):
        return date_raw.replace(hour=0, minute=0, second=0, microsecond=0)
    
    try:
        # 2. Manejo de formatos de mes y año (ej: 'NOV-25' para VENC GAS)
        if re.match(r'^[A-Z]{3}-\d{2}$', date_str):
            # Asumimos el día 1 del mes para fechas de mes/año
            date_obj = parse(date_str, default=datetime(datetime.now().year, 1, 1)).replace(day=1)
            # Ajuste de año de dos dígitos (ej: 25 -> 2025)
            if date_obj.year < datetime.now().year - 50:
                date_obj = date_obj.replace(year=date_obj.year + 2000)
            return date_obj.replace(hour=0, minute=0, second=0, microsecond=0)

        # 3. Intento de parseo general (d/m/Y, d-m-Y, etc.)
        return parse(date_str, dayfirst=True).replace(hour=0, minute=0, second=0, microsecond=0)
        
    except (ParserError, ValueError):
        print(f"⚠️ ETL - Error de parseo de fecha para el valor: '{date_raw}'")
        return None

# =========================================================================
# 3. FUNCIÓN PRINCIPAL DE NORMALIZACIÓN (PARTE 1: MAESTRO Y DOCUMENTOS)
# =========================================================================

def process_and_normalize_data() -> Dict[str, List[Dict[str, Any]]]:
    """Lee, limpia, normaliza todos los CSVs y prepara los datos para la carga."""
    print("Iniciando proceso de normalización de todos los CSVs...")
    
    # 3.1. INICIALIZACIÓN Y FUNCIÓN UTILITARIA (load_csv)
    # -------------------------------------------------------------------------
    
    # Inicialización de DataFrames
    df_vehiculos = pd.DataFrame()
    df_documentacion = pd.DataFrame()
    df_mantenimiento = pd.DataFrame()
    df_infracciones = pd.DataFrame()
    df_componentes = pd.DataFrame()
    df_flota_estado = pd.DataFrame()

    # --- FUNCIÓN UTILITARIA: Leer CSV de forma robusta y limpiar ---
    def load_csv(filename: str) -> pd.DataFrame:
        path = os.path.join(CSV_FOLDER, filename)
        
        if not os.path.exists(path):
            print(f"❌ ERROR: Archivo {filename} NO ENCONTRADO.")
            return pd.DataFrame()
        
        try:
            # 1. Intentamos leer con 'utf-8-sig' y luego 'latin-1' para manejar codificación
            df = pd.read_csv(path, encoding='utf-8-sig', sep=None, engine='python', on_bad_lines='skip')
            if df.empty or any('\ufeff' in col for col in df.columns):
                df = pd.read_csv(path, encoding='latin-1', sep=None, engine='python', on_bad_lines='skip')
            
            if df.empty:
                print(f"⚠️ ETL WARNING: {filename} vacío después de lectura.")
                return pd.DataFrame()
            
            # 2. Limpieza de encabezados
            cleaned_columns = []
            for col in df.columns:
                col_str = str(col).strip().lstrip('\ufeff').lstrip('Ï»¿')
                try:
                    col_str = col_str.encode('latin-1').decode('utf-8', 'ignore')
                except:
                    pass
                col_str = re.sub(r'[.$:\(\)]', '', col_str)
                col_str = re.sub(r'\s+', '_', col_str).upper()
                cleaned_columns.append(col_str)
            df.columns = cleaned_columns
            
            # 3. Renombrar las columnas de patente/dominio a 'PATENTE'
            df.rename(columns={
                'PATENTE_': 'PATENTE', 'DOMINIO': 'PATENTE', 
                'DOMINIO_': 'PATENTE', 'PATENTES': 'PATENTE' 
            }, inplace=True)
            
            # 🔑 CORRECCIÓN: Manejo temprano de NaN en campos clave (defaults)
            key_cols = ['PATENTE', 'NRO_MOVIL', 'DESCRIPCION_MODELO', 'ANIO']  # Campos que fallan
            for col in key_cols:
                if col in df.columns:
                    if col == 'PATENTE':
                        df[col] = df[col].astype(str).str.upper().str.strip().fillna('UNKNOWN_PATENTE')
                    elif col == 'ANIO':
                        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)  # Default 0 si NaN
                    else:
                        df[col] = df[col].fillna('N/A').astype(str).str.strip()  # Default 'N/A'
            
            # Log de depuración: Muestra primeras patentes y si hay vacíos
            if 'PATENTE' in df.columns:
                num_empty = df['PATENTE'].isna().sum()
                if num_empty > 0:
                    print(f"⚠️ ETL WARNING: {num_empty} patentes vacías en {filename}. Ignorando filas.")
                df = df.dropna(subset=['PATENTE'])  # Drop filas sin patente
                print(f"ETL DEBUG: Primeras 3 patentes en {filename}: {df['PATENTE'].head(3).tolist()}")
            
            return df
        
        except Exception as e:
            print(f"❌ ERROR CRÍTICO al cargar {filename}: {e}")
            return pd.DataFrame()

    # =====================================================================
    # 3.2. PROCESAMIENTO: DOCUMENTACION Y CREACIÓN DE MAESTRO DE VEHÍCULOS
    # =====================================================================
    
    df_doc = load_csv('documentacion.csv') 

    if not df_doc.empty and 'PATENTE' in df_doc.columns: 
        print("-> Procesando documentacion.csv (Maestro)...")
        
        doc_map = {
            'PATENTE': '_id', 'NRO_MOVIL': 'nro_movil', 'TIPO_DE_COMB': 'tipo_combustible',
            'MOVIL': 'descripcion_modelo', 'MODELO': 'anio', 'COLOR': 'color',
            'MEDIDAS_DE_CUBIERTAS': 'medidas_cubiertas', 'CLAVE_RADIO': 'clave_radio',
            'ASEGURADORA': 'aseguradora' 
        }
        
        df_doc_clean = rename_and_filter(df_doc, doc_map)
        
        if '_id' in df_doc_clean.columns:
            df_doc_clean['_id'] = df_doc_clean['_id'].astype(str).str.upper().str.strip()
            
            # 🔑 CORRECCIÓN: Llenar defaults para campos clave si NaN
            df_doc_clean['nro_movil'] = df_doc_clean['nro_movil'].fillna('N/A').astype(str)
            df_doc_clean['descripcion_modelo'] = df_doc_clean['descripcion_modelo'].fillna('Sin Modelo')
            df_doc_clean['anio'] = pd.to_numeric(df_doc_clean['anio'], errors='coerce').fillna(0).astype(int)
            
            # 3.2.1. CONSOLIDACIÓN DE VEHÍCULOS (df_vehiculos)
            cols_vehiculos = ['_id', 'nro_movil', 'tipo_combustible', 'descripcion_modelo', 'anio', 'color', 'medidas_cubiertas', 'clave_radio']
            # Creamos el maestro principal de vehículos (una fila por patente)
            df_vehiculos = df_doc_clean[cols_vehiculos].drop_duplicates(subset=['_id']).copy()
            
            # 🔑 CORRECCIÓN: Si hay duplicados por patente, combina sin sobrescribir (usa primer no-null)
            df_vehiculos = df_vehiculos.groupby('_id').first().reset_index()  # Combine first non-null
            
            df_vehiculos['activo'] = True
            
            # Log detallado por patente
            #for _, row in df_vehiculos.head(5).iterrows():  # Muestra primeros 5 para depuración
            #    print(f"ETL DEBUG VEHÍCULO: Patente={row['_id']}, Movil={row['nro_movil']}, Modelo={row['descripcion_modelo']}, Año={row['anio']}")
            
            #print(f"  [LOG-DIAG 3] Filas finales de df_vehiculos (Maestro) después de consolidación: {len(df_vehiculos)}")

            # 3.2.2. GENERAR DOCUMENTACIÓN (df_documentacion)
            # 🔑 FIX: Mapeo CRÍTICO de columnas del CSV a los 'tipo_documento' de la API.
            # Aseguramos que los nombres coincidan con las claves que espera la API (ej: 'Poliza_Detalle', 'GAS').
            vencimiento_map_normalized = [
                # Columna CSV original (para clean_column_key) # Tipo de Documento Normalizado (API Key)
                ('VENCIMIENTO_CEDULA', 'Cedula'), 
                ('VENCIMIENTO_SEGURO', 'Poliza_Detalle'), # FIX: Usar 'Poliza_Detalle' para el seguro
                ('VENC_GAS', 'GAS'), # FIX: Usar 'GAS'
                ('VTV', 'VTV'), 
                ('TARJ_YPF', 'TARJ YPF')
            ]

            for index, row in df_doc_clean.iterrows():
                patente = row['_id']
                
                # El índice de df_doc_clean es el mismo que df_doc.
                df_doc_index = df_doc_clean.index[index]
                
                for original_col_uncleaned, doc_type in vencimiento_map_normalized:
                    col_name_cleaned = clean_column_key(original_col_uncleaned) 
                
                    # Accedemos al valor de la fecha del DataFrame original (df_doc)
                    if col_name_cleaned in df_doc.columns:
                        fecha_valor = df_doc.loc[df_doc_index, col_name_cleaned]
                        
                        # Verificamos no-nulidad y excluimos cadenas explícitas de no-vencimiento
                        if pd.notna(fecha_valor) and str(fecha_valor).strip().upper() not in ["SIN VENCIMIENTO", ""]:
                            
                            # Registro normalizado
                            registro_doc = {
                                'patente': patente, 
                                'tipo_documento': doc_type, # <-- Campo estandarizado
                                'fecha_vencimiento': fecha_valor, # <-- Campo estandarizado
                                'aseguradora': row.get('aseguradora') # Tomado de df_doc_clean
                            }
                            
                            # Usamos pd.concat con pd.DataFrame.from_records para una adición limpia
                            df_documentacion = pd.concat([df_documentacion, pd.DataFrame.from_records([registro_doc])], ignore_index=True)

    # 3.2.3. CONVERSIÓN DE FECHAS DE DOCUMENTACIÓN
    if not df_documentacion.empty and 'fecha_vencimiento' in df_documentacion.columns:
        df_documentacion['fecha_vencimiento'] = safe_date_convert(df_documentacion['fecha_vencimiento'])
        current_date = datetime(2025, 11, 19)
        future_dates = df_documentacion['fecha_vencimiento'] > current_date
        if future_dates.any():
            print(f"⚠️ ETL WARNING: {future_dates.sum()} fechas futuras – Manteniendo.")
        none_dates = df_documentacion['fecha_vencimiento'].isna()
        if none_dates.any():
            df_documentacion.loc[none_dates, 'fecha_vencimiento'] = current_date + timedelta(days=365)  # +1 year, no critical
            print(f"✅ Filled {none_dates.sum()} None fechas with {current_date + timedelta(days=365)} – no critical alerts.")
        
    # =====================================================================
    # 3.3. PROCESAMIENTO: REFERENCIAS A ARCHIVOS DIGITALES
    # =====================================================================

    # NOTA: Se asume que 'import glob' y 'import re' están en la cabecera del archivo.

    def find_file_by_pattern_and_get_name(base_dir: str, pattern: str) -> str | None:
        """
        Busca un archivo que coincida con el patrón (ej: Poliza*.pdf) de forma
        insensible a mayúsculas/minúsculas y devuelve su nombre.
        """
        if not os.path.exists(base_dir):
            return None
            
        # 1. Convertir el patrón de glob a una expresión regular
        regex_pattern_str = re.escape(pattern).replace(r'\*', '.*').replace(r'\?', '.')
        # Aseguramos que el patrón coincida con el nombre completo del archivo
        regex_pattern = f"^{regex_pattern_str}$"
        
        # 2. Iterar sobre los archivos en el directorio y usar re.fullmatch
        try:
            # os.listdir es más eficiente que glob.glob(..., recursive=False) para un solo nivel
            for filename in os.listdir(base_dir):
                # Usar re.fullmatch con re.IGNORECASE (re.I)
                if re.fullmatch(regex_pattern, filename, re.IGNORECASE):
                    # Si coincide, devuelve el nombre de archivo real
                    return filename
        except Exception as e:
            print(f"Error al escanear directorio {base_dir}: {e}")
            return None

        return None

    if not df_vehiculos.empty:
        print("-> Generando referencias a archivos digitales y verificando existencia...")
        # Inicializa la columna como una lista vacía para evitar errores de tipo si no se encuentra nada
        df_vehiculos['documentos_digitales'] = pd.Series([[]] * len(df_vehiculos), index=df_vehiculos.index, dtype=object)
        
        for index, row in df_vehiculos.iterrows():
            patente = row['_id']
            folder_name = patente 
            vehiculo_doc_dir_local = os.path.join(DOCUMENTOS_DIGITALES_ROOT, folder_name)
            # Normalizamos la ruta para la DB (separador /)
            db_path_base = f"{DOC_RAIZ}/{folder_name}".replace('\\', '/')
            document_list = []
            
            # Lista de archivos ya identificados (para evitar duplicados en 'OTROS_DOCUMENTOS')
            identified_files = set() 
            
            # --- 1. TITULO AUTOMOTOR (Lógica ROBUSTA) ---
            titulo_pattern = '*TITULO AUTOMOTOR*.pdf' 
            real_filename_titulo = find_file_by_pattern_and_get_name(vehiculo_doc_dir_local, titulo_pattern)
            
            if real_filename_titulo:
                document_list.append({
                    'tipo': 'TITULO_AUTOMOTOR', 
                    'nombre_archivo': real_filename_titulo, 
                    'path_esperado': f"{db_path_base}/{real_filename_titulo}",
                    'existe_fisicamente': True 
                })
                identified_files.add(real_filename_titulo)
            else:
                document_list.append({
                    'tipo': 'TITULO_AUTOMOTOR', 
                    'nombre_archivo': None, 
                    'path_esperado': None,
                    'existe_fisicamente': False 
                })

            # --- 2. POLIZA SEGURO DIGITAL (Lógica ROBUSTA) ---
            poliza_pattern = 'Poliza*.pdf' 
            real_filename_poliza = find_file_by_pattern_and_get_name(vehiculo_doc_dir_local, poliza_pattern)
            
            if real_filename_poliza:
                document_list.append({
                    'tipo': 'POLIZA_SEGURO_DIGITAL', 
                    'nombre_archivo': real_filename_poliza,
                    'path_esperado': f"{db_path_base}/{real_filename_poliza}",
                    'existe_fisicamente': True 
                })
                identified_files.add(real_filename_poliza)
            else:
                document_list.append({
                    'tipo': 'POLIZA_SEGURO_DIGITAL', 
                    'nombre_archivo': None,
                    'path_esperado': None,
                    'existe_fisicamente': False 
                })
            
            # --- 3. CEDULA VERDE DIGITAL (Lógica ROBUSTA) ---
            # Patrón busca 'PATENTE' + cualquier cosa, seguido de una extensión de imagen (ej: AE456HG.jpg)
            ced_verde_pattern = f"{patente}*.jpg" 
            real_filename_ced_verde = find_file_by_pattern_and_get_name(vehiculo_doc_dir_local, ced_verde_pattern)
            
            if real_filename_ced_verde:
                document_list.append({
                    'tipo': 'CEDULA_VERDE_DIGITAL', 
                    'nombre_archivo': real_filename_ced_verde, 
                    'path_esperado': f"{db_path_base}/{real_filename_ced_verde}",
                    'existe_fisicamente': True 
                })
                identified_files.add(real_filename_ced_verde)
            else:
                document_list.append({
                    'tipo': 'CEDULA_VERDE_DIGITAL', 
                    'nombre_archivo': None, 
                    'path_esperado': None,
                    'existe_fisicamente': False 
                })
                
            # =========================================================================
            # 3.3.4. OTROS DOCUMENTOS (Escanea el resto de archivos en la carpeta)
            # =========================================================================
            
            if os.path.exists(vehiculo_doc_dir_local):
                try:
                    # Recorre todos los archivos en el directorio
                    for entry in os.listdir(vehiculo_doc_dir_local):
                        # Ignora directorios y archivos ya identificados (comparación case-insensitive)
                        if (os.path.isfile(os.path.join(vehiculo_doc_dir_local, entry)) and 
                            entry.upper() not in [f.upper() for f in identified_files]):
                            
                            document_list.append({
                                'tipo': 'OTROS_DOCUMENTOS', 
                                'nombre_archivo': entry,
                                'path_esperado': f"{db_path_base}/{entry}",
                                'existe_fisicamente': True
                            })
                            identified_files.add(entry) # Aseguramos no duplicar
                except Exception as e:
                    print(f"⚠️ Error al escanear otros documentos para {patente}: {e}")
                    
            df_vehiculos.at[index, 'documentos_digitales'] = document_list
            
    # =====================================================================
    # B) POLIZAS Y BAJAS 
    # =====================================================================
    
    df_polizas = load_csv('polizas.csv')
    if not df_polizas.empty and 'PATENTE' in df_polizas.columns:
        print("-> Procesando polizas.csv...")
        poliza_map = {'PATENTE': 'patente', 'SUMA_ASEGURADA': 'suma_asegurada', 'COSTO_SEMESTRAL': 'costo_semestral', 'COSTO_MENSUAL': 'costo_mensual', 'MONTO_FRANQ': 'monto_franquicia'}
        df_polizas_clean = rename_and_filter(df_polizas, poliza_map)
        
        
        if 'patente' in df_polizas_clean.columns:
            df_polizas_clean['patente'] = df_polizas_clean['patente'].astype(str).str.upper().str.strip()
            df_polizas_clean['tipo_documento'] = 'Poliza_Detalle'
            
            # Conversión de campos monetarios
            currency_cols = ['suma_asegurada', 'costo_semestral', 'costo_mensual', 'monto_franquicia']
            for col in currency_cols:
        
                if col in df_polizas_clean.columns:
                    df_polizas_clean[col] = safe_currency_convert(df_polizas_clean[col])
            
            cols_to_use = [col for col in ['patente', 'tipo_documento', 'suma_asegurada', 'costo_semestral', 'costo_mensual', 'monto_franquicia'] if col in df_polizas_clean.columns]
            df_documentacion = pd.concat([df_documentacion, df_polizas_clean[cols_to_use]], ignore_index=True)


    df_bajas = load_csv('vendidos_o_bajas.csv')
    if not df_bajas.empty and 'PATENTE' in df_bajas.columns:
        print("-> Procesando vendidos_o_bajas.csv (Flota_Estado)...")
        bajas_map = {'PATENTE': 'patente', 'DENUNCIA_DE_VENTA': 'fecha_estado', 'TRANSFERENCIA_08': 'motivo_estado_transferencia', 'OTROS': 'motivo_estado_otro'}
        df_bajas_clean = rename_and_filter(df_bajas, bajas_map)
        if 'patente' in df_bajas_clean.columns:
            df_bajas_clean['patente'] = df_bajas_clean['patente'].astype(str).str.upper().str.strip()
            patentes_baja = df_bajas_clean['patente'].unique()
            if not df_vehiculos.empty:
    
                df_vehiculos.loc[df_vehiculos['_id'].isin(patentes_baja), 'activo'] = False
            df_bajas_clean['estado'] = 'Baja'
            df_bajas_clean['tipo'] = 'BAJA_DEFINITIVA'
            cols_to_use = [col for col in ['patente', 'fecha_estado', 'motivo_estado_transferencia', 'motivo_estado_otro', 'estado', 'tipo'] if col in df_bajas_clean.columns]
            df_flota_estado = pd.concat([df_flota_estado, df_bajas_clean[cols_to_use]], ignore_index=True)

    if not df_flota_estado.empty and 'fecha_estado' in df_flota_estado.columns:
    
        df_flota_estado['fecha_estado'] = safe_date_convert(df_flota_estado['fecha_estado'])

    # 🔑 AÑADIR ESTA LÍNEA:
    if not df_flota_estado.empty:
        df_flota_estado = add_unique_id(df_flota_estado)

    # =====================================================================
    # C) MANTENIMIENTO
    # =====================================================================

    mantenimiento_files_map = {
        'servicios_renault.csv': {'tipo': 'SERVICIO_RENAULT', 'map': {'FECHA': 'fecha', 'KMS': 'kilometraje_km', 'MOTIVO': 'motivo', 'DESCRIPCION': 'descripcion', 'LUGAR': 'lugar', 'MONTO': 'costo_monto', 'FACTURA_NRO': 'factura_nro'}},
        'servicios_lavallol.csv': {'tipo': 'SERVICIO_LAVALLOL', 'map': {'FECHA': 'fecha', 'KMS': 'kilometraje_km', 'MOTIVO': 'motivo', 'DESCRIPCION': 'descripcion'}},
    
        'reparaciones.csv': {'tipo': 'REPARACION_EXTERNA', 'map': {'FECHA': 'fecha', 'KILOMETRAJE': 'kilometraje_km', 'MOTIVO': 'motivo', 'LUGAR': 'lugar'}},
        'taller_2024.csv': {'tipo': 'TALLER_MOVIL', 'map': {'FECHA': 'fecha', 'MOTIVO': 'motivo', 'MOVIL_Nº': 'nro_movil'}},
        'taller_2025.csv': {'tipo': 'TALLER_MOVIL', 'map': {'FECHA': 'fecha', 'MOTIVO': 'motivo', 'MOVIL_Nº': 'nro_movil'}},
    }
    
    for filename, data in mantenimiento_files_map.items():
        df = load_csv(filename)
        
        if not df.empty and 'PATENTE' in df.columns: 
    
            print(f"-> Procesando {filename}...")
        
            df.rename(columns={'PATENTE': 'patente'}, inplace=True)
            df_clean = rename_and_filter(df, data['map'])
            df_clean['tipo_registro'] = data['tipo']
            
            if 'patente' in df_clean.columns:
            
                df_clean['patente'] = df_clean['patente'].astype(str).str.upper().str.strip()
            
            if 'kilometraje_km' in df_clean.columns:
                # Redondear y convertir a entero (Int64 para manejar NaNs)
                df_clean['kilometraje_km'] = pd.to_numeric(df_clean['kilometraje_km'], errors='coerce').round(0).astype('Int64')
            
    
            # Aplicar safe_currency_convert
            if 'costo_monto' in df_clean.columns:
                df_clean['costo_monto'] = safe_currency_convert(df_clean['costo_monto']).fillna(0.0)
                num_nan = df_clean['costo_monto'].isna().sum()  # Debería ser 0 después
                if num_nan > 0:
                    print(f"⚠️ ETL WARNING: {num_nan} costos NaN en {filename} convertidos a 0.")
                    
            df_mantenimiento = pd.concat([df_mantenimiento, df_clean], ignore_index=True)

    moviles_files = ['moviles_octubre.csv', 'moviles_septiembre.csv']
    for filename in moviles_files:
            df = load_csv(filename)
            if not df.empty and 'PATENTE' in df.columns:
                print(f"-> Procesando {filename} (Kilometraje)...")
                movil_map = {'PATENTE': 'patente', 'PROX_SERV_KM_ACEITE_Y_FILTROS': 'prox_serv_km'}
                df.rename(columns={'PATENTE': 'patente'}, inplace=True)
                df_clean = rename_and_filter(df, movil_map)
                df_clean['tipo_registro'] = 'CONTROL_KM_SERVICIO'
                if 'patente' in df_clean.columns:
                    df_clean['patente'] = df_clean['patente'].astype(str).str.upper().str.strip()
                cols_to_use = [col for col in ['patente', 'prox_serv_km', 'tipo_registro', 'OBSERVACIONES'] if col in df_clean.columns]
                df_mantenimiento = pd.concat([df_mantenimiento, df_clean[cols_to_use]], ignore_index=True)

    if not df_mantenimiento.empty and 'fecha' in df_mantenimiento.columns:
        
        df_mantenimiento['fecha'] = safe_date_convert(df_mantenimiento['fecha'])

    # 🔑 AÑADIR ESTA LÍNEA:
    if not df_mantenimiento.empty:
        df_mantenimiento = add_unique_id(df_mantenimiento)
        # Log muestra
        #print(f"ETL DEBUG MANTENIMIENTO: Primeros 3: {df_mantenimiento[['patente', 'costo_monto']].head(3).to_dict('records')}")

    # =====================================================================
    # D) INFRACCIONES Y MULTAS (Finanzas)
    # =====================================================================
    
    infracciones_files_map = {
        'infracciones_caba.csv': {'map': {'DIA': 'dia', 'AÑO': 'año', 'IMPORTE': 'monto', 'FALTA': 'motivo', 'LUGAR': 'lugar', 'DATOS_CONDUCTOR': 'conductor', 'DATOS_ACOMPAÑANTE': 'acompanante'}},
        'infracciones_ezeiza.csv': {'map': {'FECHA_INFRACCIÓN': 'fecha_infraccion', 'MONTO': 'monto', 'MOTIVO': 'motivo', 'LUGAR_INFRACCIÓN': 
            'lugar'}},
        'infracciones_florencio_varela.csv': {'map': {'FECHA_DE_OCURRENCIA': 'fecha_infraccion', 'IMPORTE__': 'monto', 'FALTA': 'motivo', 'LUGAR_DE_OCURRENCIA': 'lugar'}},
        'infracciones_zamora.csv': {'map': {'FECHA_INFRACCIÓN': 'fecha_infraccion', 'IMPORTE': 'monto', 'FALTA': 'motivo', 'LUGAR': 'lugar'}},
        'multas_prov_bs_as.csv': {'map': {'FECHA_DE_OCURRENCIA': 'fecha_infraccion', 'IMPORTE__': 'monto', 'FALTA': 'motivo', 'LUGAR_DE_OCURRENCIA': 'lugar'}},
    }
    
    for filename, data in infracciones_files_map.items():
        df = load_csv(filename)
        
        if not df.empty and 'PATENTE' in df.columns: 
            
            print(f"-> Procesando {filename} (Infracciones)...")
            
            df.rename(columns={'PATENTE': 'patente'}, inplace=True)
            df_clean = rename_and_filter(df, data['map'])
            
            # Lógica especial para Infracciones CABA que usa 'DIA' y 'AÑO'
            
            if filename == 'infracciones_caba.csv':
                if 'dia' in df_clean.columns and 'año' in df_clean.columns:
                    # Concatenar para formar una fecha legible (ej: 01/2025)
                    df_clean['fecha_infraccion'] = df_clean['dia'].astype(str).str.cat(df_clean['año'].astype(str), sep='/')
                    df_clean.drop(columns=['dia', 
                        'año'], errors='ignore', inplace=True)
            
            df_clean['tipo_registro'] = 'INFRACCION'
            df_clean['jurisdiccion'] = filename.replace('.csv', '').replace('infracciones_', '').replace('multas_prov_bs_as', 'BS_AS').upper()
            
            if 'patente' in df_clean.columns:
                df_clean['patente'] = df_clean['patente'].astype(str).str.upper().str.strip()
            
    
            # Aplicar safe_currency_convert
            if 'monto' in df_clean.columns:
                df_clean['monto'] = safe_currency_convert(df_clean['monto'])

            df_infracciones = pd.concat([df_infracciones, df_clean], ignore_index=True)

    if not df_infracciones.empty and 'fecha_infraccion' in df_infracciones.columns:
        df_infracciones['fecha_infraccion'] = safe_date_convert(df_infracciones['fecha_infraccion'])

    # 🔑 AÑADIR ESTA LÍNEA:
    if not df_infracciones.empty:
        df_infracciones = add_unique_id(df_infracciones)

    # =====================================================================
    # E) COMPONENTES (Baterias & Neumáticos)
    # =====================================================================
    
    componentes_files = {
        'baterias_neumaticos.csv': 'PATENTE',
        'alaskan.csv': 'PATENTE',
    }
    
    comp_cols = {
        'REEMPLAZO_NEUMATICOS_DELANTEROS': 'Neumatico_Delantero',
        'REEMPLAZO_NUEMATICOS_TRASEROS': 'Neumatico_Trasero',
        'REEMPLAZO_BATERIAS': 'Bateria',

    }
    
    kms_col_clean = clean_column_key('KMS')

    for filename, pk_col in componentes_files.items():
        df = load_csv(filename)
        
        if not df.empty and 'PATENTE' in df.columns:
            print(f"-> Procesando {filename} (Componentes)...")
            
            df.rename(columns={'PATENTE': 'patente'}, inplace=True)
    
            df['patente'] = df['patente'].astype(str).str.upper().str.strip()
            
            for index, row in df.iterrows():
                patente = row['patente']
                
                for original_col_uncleaned, tipo_componente in comp_cols.items():
            
                    col_name = clean_column_key(original_col_uncleaned) 
                    
                    if col_name in row and pd.notna(row[col_name]):
                        kms_value = row[kms_col_clean] if kms_col_clean in row else None
            
        
                        kilometraje_final = None
                        if pd.notna(kms_value): # Usar pd.notna para todos los tipos de nulos
                            
                            # Se usa round(0) y conversión a Int64
                            try:
                                # Hay que asegurar que el valor es una serie o array iterable para .iloc[0] si es un Series
                                # Si ya es un valor escalar, el .iloc[0] fallará. Se corrige simplificando.
                                numeric_value = pd.to_numeric(kms_value, errors='coerce').round(0)
                                if isinstance(numeric_value, pd.Series):
                                    kilometraje_final = numeric_value.astype('Int64').iloc[0]
                                else:
                                    kilometraje_final = numeric_value.astype('Int64')
                            
                            except:
                                kilometraje_final = None

                        df_componentes = pd.concat([df_componentes, pd.DataFrame([{
                            'patente': patente, 
            
                            'tipo_componente': tipo_componente, 
                            'fecha_instalacion': row[col_name],
                            'kilometraje_instalacion': kilometraje_final
                        }])], ignore_index=True)

    if not df_componentes.empty and 'fecha_instalacion' in df_componentes.columns:
        df_componentes['fecha_instalacion'] = safe_date_convert(df_componentes['fecha_instalacion'])

    # 🔑 AÑADIR ESTA LÍNEA:
    if not df_componentes.empty:
        df_componentes = add_unique_id(df_componentes)

    # =====================================================================
    # F) CONSOLIDACIÓN FINAL (Bloque CORREGIDO y FIX de ID NULO)
    # =====================================================================

    # Función de limpieza (muévela aquí si no está antes)
    def cleanup_dataframe_for_mongo(df: pd.DataFrame) -> pd.DataFrame:
        """Limpia NaN/NaT para Mongo (convierte a None), y logs vacíos."""
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                df[col] = df[col].where(df[col].notna(), None)  # NaT → None
            elif pd.api.types.is_numeric_dtype(df[col]):
                df[col] = df[col].fillna(0)  # Numéricos → 0
            else:
                df[col] = df[col].fillna('N/A')  # Strings → 'N/A'
        
        # Log vacíos restantes
        empty_counts = df.isna().sum()
        if empty_counts.sum() > 0:
            print(f"ETL CLEANUP WARNING: Columnas con vacíos: {empty_counts[empty_counts > 0].to_dict()}")
        
        return df

    print("\n✔️ Normalización completa. Consolidando colecciones...")
        
    print(f"   [DEBUG_FINAL] df_vehiculos tiene {len(df_vehiculos)} registros.")
    print(f"   [DEBUG_FINAL] df_documentacion tiene {len(df_documentacion)} registros.")
    print(f"   [DEBUG_FINAL] df_mantenimiento tiene {len(df_mantenimiento)} registros.")
    print(f"   [DEBUG_FINAL] df_infracciones tiene {len(df_infracciones)} registros.")
    print(f"   [DEBUG_FINAL] df_componentes tiene {len(df_componentes)} registros.")
    print(f"   [DEBUG_FINAL] df_flota_estado tiene {len(df_flota_estado)} registros.")

    # 🔑 CORRECCIÓN 1: Forzar 'nro_movil' a tipo string. 
    if 'nro_movil' in df_vehiculos.columns:
        df_vehiculos['nro_movil'] = df_vehiculos['nro_movil'].fillna('').astype(str)
        df_vehiculos['nro_movil'] = df_vehiculos['nro_movil'].str.replace(r'\.0$', '', regex=True)
        df_vehiculos['nro_movil'] = df_vehiculos['nro_movil'].str.strip()
        print("✅ Columna 'nro_movil' forzada a tipo string para compatibilidad con FastAPI/Pydantic.")

    # 🔑 CORRECCIÓN 2: FIX IDs NULOS EN TODAS LAS COLECCIONES (extensión)
    for df_name, df in [('Documentacion', df_documentacion), ('Mantenimiento', df_mantenimiento), 
                        ('Finanzas', df_infracciones), ('Componentes', df_componentes), 
                        ('Flota_Estado', df_flota_estado)]:
        if '_id' in df.columns:
            is_null_id = df['_id'].isna() | (df['_id'].astype(str).str.strip() == '')
            if is_null_id.any():
                new_ids = [str(uuid.uuid4()) for _ in range(is_null_id.sum())]
                df.loc[is_null_id, '_id'] = new_ids
                print(f"✅ Se corrigieron {is_null_id.sum()} IDs nulos/vacíos en {df_name} con UUIDs únicos.")

    # Aplicamos cleanup_dataframe_for_mongo a CADA DataFrame
    normalized_data = {
        'Vehiculos': cleanup_dataframe_for_mongo(df_vehiculos).to_dict('records') if not df_vehiculos.empty else [],
        'Documentacion': cleanup_dataframe_for_mongo(df_documentacion).to_dict('records') if not df_documentacion.empty else [],
        'Mantenimiento': cleanup_dataframe_for_mongo(df_mantenimiento).to_dict('records') if not df_mantenimiento.empty else [],
        'Finanzas': cleanup_dataframe_for_mongo(df_infracciones).to_dict('records') if not df_infracciones.empty else [],
        'Componentes': cleanup_dataframe_for_mongo(df_componentes).to_dict('records') if not df_componentes.empty else [],
        'Flota_Estado': cleanup_dataframe_for_mongo(df_flota_estado).to_dict('records') if not df_flota_estado.empty else [],
    }

    total_vehiculos = len(normalized_data.get('Vehiculos', []))
    total_documentacion = len(normalized_data.get('Documentacion', []))
    total_mantenimiento = len(normalized_data.get('Mantenimiento', []))

    print("\n=========================================================")
    print(f"DEBUG_ETL: 📊 Resumen de Normalización")
    print(f"  - Total de Vehículos procesados: {total_vehiculos}")
    print(f"  - Total de Documentación: {total_documentacion}")
    print(f"  - Total de Registros de Mantenimiento: {total_mantenimiento}")
    print("=========================================================\n")

    # 🔑 ADICIÓN: Check si colecciones vacías
    if total_vehiculos == 0:
        print("⚠️ WARNING: No vehículos procesados – revisa CSVs fuente (ej: documentacion.csv).")
    if total_documentacion == 0:
        print("⚠️ WARNING: No documentación – checa vencimientos en CSVs.")

    return normalized_data

# =========================================================================
# 4. FUNCIÓN DE CARGA (PyMongo)
# =========================================================================

def load_data_to_mongodb(data: Dict[str, List[Dict[str, Any]]]):
    """Establece la conexión e inserta los datos en las colecciones."""
    
    client = None
    try:
        print("\n🌐 Intentando conectar con MongoDB Atlas...")
  
        client = MongoClient(CONNECTION_STRING)
        client.admin.command('ping') 
        db = client[DB_NAME]
        print(f"✅ Conexión exitosa a la base de datos: {DB_NAME}")
        
        from pymongo import UpdateOne 

        for collection_name, records in data.items():
            if not records:
           
                print(f"⚠️ Saltando colección '{collection_name}': No hay registros para insertar.")
                continue

            collection = db[collection_name]
            
            if collection_name == 'Vehiculos':
                print(f"\n⚙️ Procesando colección '{collection_name}' ({len(records)} registros)...")
         
        
                updates = [
                    (
                        {'_id': record['_id']}, 
                        {'$set': record},    
    
                        True                    
                    ) for record in records if '_id' in record
                ]
         
        
                if updates:
                    bulk_operations = [
                        UpdateOne(filter_doc, update_doc, upsert_flag) 
                        for filter_doc, update_doc, 
                        upsert_flag in updates
                    ]
                    collection.bulk_write(bulk_operations, ordered=False)
                    print(f"✅ Colección '{collection_name}' actualizada con éxito (usando bulk_write).")
                else:
              
                    print(f"⚠️ Colección '{collection_name}' sin registros válidos para actualización.")
            else:
                # El resto de colecciones se borran y se vuelven a insertar.
                collection.drop() 
                collection.insert_many(records)
                print(f"✅ Colección '{collection_name}' insertada con éxito: {len(records)} documentos.")

    except Exception as e:
        print(f"❌ ERROR CRÍTICO durante la carga a MongoDB: {e}")
        print("Asegúrate de que la 'CONNECTION_STRING' y la contraseña sean correctas.")
    finally:
        if client:
       
            client.close()
            print("Conexión a MongoDB cerrada.")

# =========================================================================
# 5. FUNCIÓN PRINCIPAL
# =========================================================================

def main():
    print("--- INICIO DEL PROCESO ETL MULTI-CSV ---")
    
    normalized_data = process_and_normalize_data()
    
    if normalized_data:
        load_data_to_mongodb(normalized_data)
    
    print("\n--- PROCESO ETL FINALIZADO ---")

if __name__ == '__main__':
    main()