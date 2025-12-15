import axios from 'axios';
import type { 
  Vehiculo, 
  VehiculoInput, 
  ReporteCostosResponse, 
  VehiculoUpdateInput, 
  NewCostoInput, 
  DashboardResponse,
  CreateCostoResponse, 
  VehiculoBackendResponse,
} from './models/vehiculos';
import type { Alerta } from './models/vehiculos';
import type { ValidationErrorDetail } from './models/errors';  // ← Importa el tipo reutilizable
//import type { CostoItem } from './models/vehiculos';  // ← CostoItem y NewCostoInput están aquí
import { normalizePatente } from '../utils/data-utils';  // ← Utilidad existente (ruta relativa correcta en Vite)

// API Base
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// EXPORTAMOS apiClient → ¡Esto resuelve el error principal!
export const apiClient = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
});

interface FastAPIErrorResponse {
    detail?: string;
}

// 🔑 FUNCIÓN DE MAPEO ACTUALIZADA: Eliminando el 'as any'
function mapVehiculoResponse(data: VehiculoBackendResponse): Vehiculo { 
    const mappedVehiculo: Vehiculo = {
        _id: data._id || data.patente || '', 
        patente_original: data.patente_original ?? data.patente ?? null, 
        activo: data.activo ?? false, 
        
        // 🔑 CORRECCIÓN DE MAYÚSCULAS/MINÚSCULAS
        anio: data.ANIO || data.anio || null,  // Fallback both cases
        color: data.COLOR || data.color || null,
        descripcion_modelo: data.DESCRIPCION_MODELO || data.descripcion_modelo || null,
        
        // 🚨 NRO_MOVIL se convierte a string por si viene como número
        nro_movil: (data.NRO_MOVIL !== undefined && data.NRO_MOVIL !== null) ? String(data.NRO_MOVIL) : (data.nro_movil || null),
        
        tipo_combustible: data.TIPO_COMBUSTIBLE || data.tipo_combustible || null, 
        
        documentos_digitales: data.documentos_digitales || [],
    } as Vehiculo;  // Type assertion si es necesario

    return mappedVehiculo;
}

// ---------------------------------------------------------------------------------

/**
 * 🚗 Obtiene el listado completo de vehículos.
 * (GET /vehiculos)
 */
export async function fetchVehiculos(): Promise<Vehiculo[]> {
    try {
        // Obtenemos la respuesta que es un array de VehiculoBackendResponse
        const response = await apiClient.get<VehiculoBackendResponse[]>('/vehiculos');

        // 🎯 SOLUCIÓN CRÍTICA: Mapear CADA objeto para convertirlo a la estructura esperada (Vehiculo)
        const vehiculosMapeados: Vehiculo[] = response.data.map(vehiculoData => 
            mapVehiculoResponse(vehiculoData)
        );

        return vehiculosMapeados; // Devolver la lista mapeada

    } catch (error: unknown) {
        // ... (Manejo de errores)
        console.error("Error en fetchVehiculos:", error);
        throw new Error('Fallo al cargar la lista de vehículos desde el servidor.');
    }
}

// ---------------------------------------------------------------------------------

/**
 * ➕ Crea un nuevo vehículo. (POST /vehiculos)
 */
export async function createVehiculo(data: VehiculoInput): Promise<Vehiculo> {
    try {
        const response = await apiClient.post<VehiculoBackendResponse>('/vehiculos', data);

        // APLICAR CORRECCIÓN: Mapear el vehículo creado
        const newVehiculo = mapVehiculoResponse(response.data);

        return newVehiculo;

    } catch (error: unknown) {
        let errorMessage = 'Error desconocido al crear vehículo.';

        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || error.message;

            errorMessage = `Fallo del servidor (Status: ${error.response.status}): ${detail}`;
        }
        throw new Error(`Fallo en la creación del vehículo: ${errorMessage}`);
    }
}

export async function borrarGastoUniversal(
    id: string, 
    origen: "costos" | "finanzas"
): Promise<void> {
    if (!confirm("¿Estás seguro de eliminar este gasto? Esta acción no se puede deshacer.")) {
        return;
    }

    try {
        await apiClient.delete(`/costos/universal/${id}`, {
            params: { origen }
        });

        alert("Gasto eliminado correctamente");
    } catch (error) {
        // 100% TypeScript seguro - sin "any"
        let mensaje = "Error al eliminar el gasto";

        if (error && typeof error === "object" && "response" in error) {
            const err = error as { response?: { data?: { detail?: string } } };
            mensaje = err.response?.data?.detail || "Error del servidor";
        } else if (error instanceof Error) {
            mensaje = error.message;
        }

        alert("Error: " + mensaje);
        console.error("Error borrando gasto:", error);
        throw new Error(mensaje);
    }
}

/**
 * 🗑️ Elimina un vehículo por su patente normalizada (ID).
 * (DELETE /vehiculos/{patente})
 */
export async function deleteVehiculo(patente: string): Promise<void> {
    try {
        // La patente aquí ya debe estar normalizada si la API lo requiere,
        // pero la función normalize_patente del backend lo maneja.
        const url = `/vehiculos/${patente}`;

        // Esperamos 204 No Content
        await apiClient.delete(url);

    } catch (error: unknown) {
        let errorMessage = 'Error desconocido al eliminar el vehículo.';
        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || error.message;

            errorMessage = `Fallo del servidor (Status: ${error.response.status}): ${detail}`;
        }
        throw new Error(errorMessage);
    }
}

// ---------------------------------------------------------------------------------

/**
 * ✏️ Actualiza la información de un vehículo. (PUT /vehiculos/{patente})
 */
export async function updateVehiculo(patente: string, data: VehiculoUpdateInput): Promise<Vehiculo> {
    try {
        const url = `/vehiculos/${patente}`;

        // Usamos VehiculoBackendResponse para tipar correctamente lo que recibimos
        const response = await apiClient.put<VehiculoBackendResponse>(url, data);

        // APLICAR CORRECCIÓN: Mapear el vehículo actualizado
        const updatedVehiculo = mapVehiculoResponse(response.data);

        return updatedVehiculo;

    } catch (error: unknown) {
        let errorMessage = 'Error desconocido al actualizar vehículo.';
        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || (error.message as string);
            errorMessage = `Fallo al actualizar (Status: ${error.response.status}): ${detail}`;
        }
        throw new Error(errorMessage);
    }
}

// ---------------------------------------------------------------------------------

export async function fetchVehiculoByPatente(patente: string): Promise<Vehiculo> {
    try {
        const url = `/vehiculos/${patente}`;

        // Usamos VehiculoBackendResponse para tipar correctamente lo que recibimos
        const response = await apiClient.get<VehiculoBackendResponse>(url);

        // APLICAR CORRECCIÓN: Mapear el vehículo individual
        const vehiculo = mapVehiculoResponse(response.data);

        return vehiculo;

    } catch (error: unknown) {
        let errorMessage = 'Error desconocido al obtener vehículo.';
        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || error.message;

            errorMessage = `Fallo del servidor (Status: ${error.response.status}): ${detail}`;
        }
        throw new Error(errorMessage);
    }
}

// ---------------------------------------------------------------------------------

/**
 * Obtiene el reporte de costos (mantenimiento e infracciones) y alertas para un vehículo.
 * (GET /vehiculos/{patente}/reporte?start_date=...&end_date=...)
 */
export async function fetchReporteVehiculo(
  patente: string,
  startDate: string,
  endDate: string
): Promise<ReporteCostosResponse> {
  try {
    const response = await apiClient.get<ReporteCostosResponse>(
      `/vehiculos/${patente}/reporte`,
      {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      }
    );

    const data = response.data;

    // LOGS FINANCIEROS BONITOS
    console.groupCollapsed(`%cREPORTE DE COSTOS → ${patente.toUpperCase()}`, 'font-weight: bold; color: #1a73e8; font-size: 14px;');
    console.log('%cPeríodo:', 'font-weight: bold;', `${startDate}  →  ${endDate}`);
    console.log('%cTotal General:', 'font-weight: bold; color: #d93025;', 
      data.total_general.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
    console.log('%cMantenimiento:', 'font-weight: bold; color: #f9ab00;', 
      data.total_mantenimiento.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
    console.log('%cInfracciones :', 'font-weight: bold; color: #d93025;', 
      data.total_infracciones.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
    console.log('%cRegistros encontrados:', 'font-weight: bold;', data.detalles.length);

    if (data.detalles.length > 0) {
      console.table(
        data.detalles.map((item) => ({
          Fecha: item.fecha.split('T')[0],
          Tipo: item.tipo_costo,
          Descripción: item.descripcion,
          Importe: item.importe.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }),
          Origen: item.origen,
        }))
      );
    } else {
      console.warn('No se encontraron costos en el período seleccionado');
    }

    console.groupEnd();

    return data;
  } catch (error) {
    console.error('%cError al cargar reporte de costos', 'color: red; font-weight: bold;', error);

    let errorMessage = 'Error al obtener el reporte del vehículo';

    if (axios.isAxiosError(error) && error.response?.data) {
      // Tipado correcto sin usar any
      const errorPayload = error.response.data as { detail?: string };
      const detail = errorPayload.detail ?? 'Error desconocido del servidor';
      errorMessage = `Error ${error.response.status}: ${detail}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
}

// ---------------------------------------------------------------------------------

/**
 * 📈 Obtiene el resumen consolidado de costos y alertas para el Dashboard.
 * (GET /dashboard/resumen)
 */
export async function fetchDashboardData(): Promise<DashboardResponse> {
    try {
        const url = `/dashboard/resumen`;

        const response = await apiClient.get<DashboardResponse>(url);

        return response.data;
    } catch (error: unknown) {
        // 🔑 CORRECCIÓN: Usa 'const' y maneja el error 'e' (o 'error')
        let errorMessage = 'Error desconocido al obtener datos del Dashboard.';

        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || (error.message as string);

            // 🔑 CORRECCIÓN: Si actualizas errorMessage, debes mantener 'let'
            errorMessage = `Fallo del servidor (Status: ${error.response.status}): ${detail}`;
        }
        throw new Error(errorMessage);
    }
}

/**
 * Registra un nuevo costo manual en el backend.
 * 
 * Características modernas implementadas:
 * - Normalización estricta de patente (consistencia con backend).
 * - Validación y sanitización de importe (evita NaN, negativos o cero).
 * - Soporte dual: JSON (actual) o multipart/form-data (futuro con comprobante GridFS).
 * - Manejo de errores tipado y estructurado (axios + type guards).
 * - Logging seguro solo en desarrollo.
 * 
 * @param newCosto - Datos del costo (normalizados internamente).
 * @param file - Comprobante digital opcional (PDF, JPG, PNG ≤ 50MB). Si se proporciona, usa FormData.
 * @returns CostoItem creado (alineado con modelos existentes).
 * @throws Error con mensaje amigable para UI.
 **/
export async function createCostoItem(
    newCosto: NewCostoInput,
    file?: File | null  // ← Opcional: Activa modo multipart cuando backend esté listo
): Promise<CreateCostoResponse> {
    try {
        // === 1. Normalización y validación estricta (mejor práctica: fail-fast) ===
        const normalizedPatente = normalizePatente(newCosto.patente);
        if (!normalizedPatente) {
            throw new Error('Patente inválida: debe contener caracteres alfanuméricos.');
        }

        const importeValidado = Math.max(0.01, Number(newCosto.importe || 0));
        if (isNaN(importeValidado)) {
            throw new Error('Importe inválido: debe ser un número positivo.');
        }

        // === 2. Preparación de payload según modo ===
        let body: NewCostoInput | FormData;
        const config: { headers?: Record<string, string> } = {};  // ← Cambio clave: const

        if (file) {
            // MODO MULTIPART (futuro/producción con GridFS)
            if (file.size > 50 * 1024 * 1024) {
                throw new Error('Archivo demasiado grande: máximo 50MB.');
            }
            if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
                throw new Error('Formato no permitido: solo PDF, JPG o PNG.');
            }

            const formData = new FormData();
            formData.append('patente', normalizedPatente);
            formData.append('tipo_costo', newCosto.tipo_costo);
            formData.append('fecha', newCosto.fecha);
            formData.append('descripcion', newCosto.descripcion);
            formData.append('importe', importeValidado.toString());
            formData.append('origen', newCosto.origen);
            formData.append('comprobante', file);  // ← Nombre exacto que espera FastAPI (UploadFile)

            body = formData;
            // Axios detecta FormData y establece boundary automáticamente → no forzar Content-Type
        } else {
            // MODO JSON (actual, 100% compatible)
            body = {
                ...newCosto,
                patente: normalizedPatente,
                importe: importeValidado,
            };
            config.headers = { 'Content-Type': 'application/json' };
        }

        // === 3. Envío ===
        const response = await apiClient.post<CreateCostoResponse>('/costos/manual', body, config);
    
        return response.data;

    } catch (error: unknown) {
        // === 4. Manejo de errores estructurado y seguro ===
        let errorMessage = 'Fallo al registrar el costo manual.';

        if (axios.isAxiosError(error)) {
            if (error.response) {
                const detail = (error.response.data as { detail?: string | ValidationErrorDetail[] })?.detail;
                if (Array.isArray(detail)) {
                    // Errores de validación Pydantic → extraer mensajes legibles
                    errorMessage = detail.map(d => `${d.loc.join(' → ')}: ${d.msg}`).join('; ');
                } else {
                    errorMessage = `Error del servidor (${error.response.status}): ${detail || error.message}`;
                }
            } else if (error.request) {
                errorMessage = 'Error de red: el servidor no responde.';
            } else {
                errorMessage = `Error de configuración: ${error.message}`;
            }
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        if (import.meta.env.DEV) {
            console.error('[createCostoItem] Error completo:', error);
        }

        throw new Error(errorMessage);
    }
}

// ---------------------------------------------------------------------------------

/**
 * 🚨 Obtiene todas las alertas críticas de documentación de la flota.
 * (GET /alertas/criticas)
 */
export async function fetchGlobalAlertas(): Promise<Alerta[]> {
    try {
        const response = await apiClient.get<Alerta[]>('/alertas/criticas');

        //console.log("DEBUG FRONTEND API: Alertas recibidas del backend:", response.data); // <-- AÑADIR ESTE LOG

        return response.data;
    } catch (error: unknown) {
        let errorMessage = 'Error desconocido al listar alertas críticas.';
        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || error.message;

            errorMessage = `Fallo del servidor (Status: ${error.response.status}): ${detail}`;
        }
        throw new Error(errorMessage);
    }
}