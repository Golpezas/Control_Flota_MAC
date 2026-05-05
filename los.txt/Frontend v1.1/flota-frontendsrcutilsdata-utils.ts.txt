// src/utils/data-utils.ts

/**
 * Normaliza una patente eliminando caracteres no alfanuméricos y convirtiendo a mayúsculas.
 * Debe coincidir con la lógica 'normalize_patente' del backend.
 */
export const normalizePatente = (patente: string): string => {
    if (!patente) return '';
    return patente.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}