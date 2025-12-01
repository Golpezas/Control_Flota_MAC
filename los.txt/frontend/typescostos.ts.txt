export interface CostoItemExtended {
  id?: string;
  _id?: string;
  tipo: string;
  fecha: string;
  descripcion: string;
  importe: number;
  origen: 'Finanzas' | 'Mantenimiento';
  metadata_adicional?: Record<string, unknown> | null;
}