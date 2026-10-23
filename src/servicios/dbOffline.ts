import Dexie, { Table } from 'dexie';

export interface ReportePendiente {
  id?: number;
  tipo: 'REGISTRO_INSTITUCION' | 'REPORTE_CAMPO' | 'DESPACHO';
  payload: any;
  fechaCreacion: string;
}

export class PwaOfflineDB extends Dexie {
  reportesPendientes!: Table<ReportePendiente>;

  constructor() {
    super('EmergenciaPwaOfflineDB');
    this.version(1).stores({
      reportesPendientes: '++id, tipo, fechaCreacion'
    });
  }
}

export const dbOffline = new PwaOfflineDB();