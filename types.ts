export interface ECGDataPoint {
  time: number;
  voltage: number;
}

export interface AnalysisResult {
  heartRate: number;
  hrv: number; // Heart Rate Variability (ms)
  status: 'Normal' | 'Irregular' | 'Tachycardia' | 'Bradycardia' | 'Noise';
  confidence: number;
  recommendation: string;
  detailedAnalysis: string;
}

export enum SensorStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ACQUIRING = 'ACQUIRING',
}

export interface SimulationConfig {
  bpm: number;
  noiseLevel: number; // 0 to 1
  arrhythmiaChance: number; // 0 to 1
}