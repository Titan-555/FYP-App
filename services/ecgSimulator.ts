import { ECGDataPoint } from '../types.ts';

// Mathematical simulation of a PQRST complex using Gaussian functions
export const generateECGSignal = (
  timeMs: number, 
  bpm: number = 60, 
  noiseLevel: number = 0.05
): number => {
  const beatDuration = 60000 / bpm;
  const t = (timeMs % beatDuration) / beatDuration; // Normalized time 0 to 1 within a beat

  // P wave
  const pWave = 0.15 * Math.exp(-Math.pow((t - 0.2) / 0.03, 2));
  
  // QRS Complex
  const qWave = -0.15 * Math.exp(-Math.pow((t - 0.38) / 0.02, 2));
  const rWave = 1.0 * Math.exp(-Math.pow((t - 0.4) / 0.02, 2));
  const sWave = -0.25 * Math.exp(-Math.pow((t - 0.42) / 0.02, 2));
  
  // T wave
  const tWave = 0.3 * Math.exp(-Math.pow((t - 0.7) / 0.08, 2));

  // Baseline drift and high frequency noise
  const noise = (Math.random() - 0.5) * noiseLevel;
  const drift = 0.05 * Math.sin(timeMs / 2000);

  return pWave + qWave + rWave + sWave + tWave + noise + drift;
};

export class ECGSimulator {
  private startTime: number;
  private isActive: boolean = false;
  private bpm: number = 72;
  
  constructor() {
    this.startTime = Date.now();
  }

  start() {
    this.isActive = true;
    this.startTime = Date.now();
  }

  stop() {
    this.isActive = false;
  }

  setBPM(bpm: number) {
    this.bpm = bpm;
  }

  getDataPoint(): ECGDataPoint | null {
    if (!this.isActive) return null;
    
    const now = Date.now();
    const elapsedTime = now - this.startTime;
    const voltage = generateECGSignal(elapsedTime, this.bpm);

    return {
      time: elapsedTime,
      voltage: voltage
    };
  }
}