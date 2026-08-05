// Shared TypeScript types for the Excel Data Manager app

export interface CustomColumn {
  id: string;
  name: string;
  type: 'text' | 'boolean';
  createdAt: number;
}

export interface Dataset {
  id: string;
  name: string;
  uploadedAt: number;
  rowCount: number;
  excelColumns: string[];
  customColumns: CustomColumn[];
}

export interface DataRecord {
  id: string;
  datasetId: string;
  [key: string]: unknown;
}
