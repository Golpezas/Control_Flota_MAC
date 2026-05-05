// src/api/models/errors.ts  ← Recomendado: reutilizable en toda la app
export interface ValidationErrorDetail {
    loc: (string | number)[];
    msg: string;
    type: string;
}

export interface FastAPIErrorResponse {
    detail?: string | ValidationErrorDetail[];
}