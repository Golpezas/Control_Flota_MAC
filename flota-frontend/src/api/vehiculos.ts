import axios from 'axios';
import type { 
  Vehiculo, 
  VehiculoInput, 
  ReporteCostosResponse, 
  VehiculoUpdateInput, 
  NewCostoInput, 
  CreateCostoResponse,
  DashboardResponse, 
  VehiculoBackendResponse,
} from './models/vehiculos';
import type { Alerta } from './models/vehiculos';

// 🔑 CORRECCIÓN: Asegura que API_URL es exportada
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'; // ⬅️ DEBE tener 'export'

const apiClient = axios.create({
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
    } as Vehiculo;
    
    // Log for depuration: Check if data is lost here
    //console.log(`FRONTEND MAPEO VEHICULO: Patente=${mappedVehiculo._id}, Movil=${mappedVehiculo.nro_movil}, Año=${mappedVehiculo.anio}`);
    
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

/**
 * Elimina un costo manual por su ID (solo los creados manualmente).
 * Usa el endpoint correcto: DELETE /costos/manual/{id}?origen=...
 */
/*export async function deleteCostoItem(id: string, origen: 'Finanzas' | 'Mantenimiento'): Promise<void> {
    try {
        // RUTA CORRECTA
        const url = `/costos/manual/${id}`;

        await apiClient.delete(url, {
            params: {
                origen: origen  // ← obligatorio como query param
            }
        });

        console.log(`Costo eliminado correctamente: ${id} (${origen})`);

    } catch (error: unknown) {
        let errorMessage = 'Error al eliminar el costo.';
        
        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || error.message;
            
            errorMessage = `No se pudo eliminar (Status: ${error.response.status}): ${detail}`;
            
            // Esto es clave para que veas por qué no te deja borrar los del ETL
            if (error.response.status === 404) {
                errorMessage = "Solo se pueden eliminar costos creados manualmente.";
            }
        }
        
        console.error("Error al eliminar costo:", error);
        throw new Error(errorMessage);
    }
}*/

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

// ---------------------------------------------------------------------------------

/**
 * 💸 Registra un nuevo costo o gasto de forma manual. (POST /costos/crear)
 */
export async function createCostoItem(newCosto: NewCostoInput): Promise<CreateCostoResponse> {
    try {
        const dataToSend = {
            ...newCosto,
            // Aseguramos que 'importe' sea un número válido y positivo
            importe: Math.max(0.01, newCosto.importe),
        };

        // Utilizamos CostoItem como tipo de respuesta esperada.
        const response = await apiClient.post<CreateCostoResponse>('/costos/manual', dataToSend);

        return response.data;
    } catch (error: unknown) {
        let errorMessage = 'Fallo al registrar el costo manual.';
        if (axios.isAxiosError(error) && error.response) {
            const errorData = error.response.data as FastAPIErrorResponse;
            const detail = errorData.detail || (error.message as string);

            errorMessage = `Fallo al crear costo (Status: ${error.response.status}): ${detail}`;
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