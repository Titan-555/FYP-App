import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, FileText, Settings, Upload, AlertCircle, 
  Loader2, Activity, RefreshCw, Wifi, WifiOff, Download, 
  Bluetooth, BluetoothOff 
} from 'lucide-react';
import ECGChart from './components/ECGChart.tsx';
import StatsCard from './components/StatsCard.tsx';
import { ECGSimulator } from './services/ecgSimulator.ts';
import { BluetoothService } from './services/bluetoothService.ts';
import { analyzeECGSegment } from './services/geminiService.ts';
import { ECGDataPoint, SensorStatus, AnalysisResult } from './types.ts';

const SAMPLE_RATE = 50; 
const UPDATE_INTERVAL = 1000 / SAMPLE_RATE;

const App: React.FC = () => {
  const [status, setStatus] = useState<SensorStatus>(SensorStatus.DISCONNECTED);
  const [ecgData, setEcgData] = useState<ECGDataPoint[]>([]);
  const [bpm, setBpm] = useState<number>(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  const [targetBpm, setTargetBpm] = useState(72);
  
  const simulatorRef = useRef<ECGSimulator>(new ECGSimulator());
  const bluetoothRef = useRef<BluetoothService>(new BluetoothService());
  const timerRef = useRef<number | null>(null);
  const startupTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const incomingDataBuffer = useRef<ECGDataPoint[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleBluetoothConnect = async () => {
    setBtError(null);
    try {
      const connected = await bluetoothRef.current.connect();
      if (connected) {
        setIsBluetoothConnected(true);
        setDeviceName(bluetoothRef.current.getDeviceName());
        setStatus(SensorStatus.CONNECTED);
        simulatorRef.current.stop(); 
      }
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('cancelled')) return;
      setBtError(err.message || "Failed to connect");
      setIsBluetoothConnected(false);
    }
  };

  const handleBluetoothDisconnect = () => {
    bluetoothRef.current.disconnect();
    setIsBluetoothConnected(false);
    setDeviceName(null);
    setStatus(SensorStatus.DISCONNECTED);
  };

  const handleStart = () => {
    setStatus(SensorStatus.CONNECTING);
    setCountdown(5);
    setEcgData([]);
    setAnalysis(null);
    incomingDataBuffer.current = [];

    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    startupTimerRef.current = window.setTimeout(() => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      setCountdown(null);
      setStatus(SensorStatus.ACQUIRING);
      
      if (isBluetoothConnected) {
        bluetoothRef.current.startStreaming((voltage) => {
          incomingDataBuffer.current.push({
            time: Date.now(),
            voltage: voltage
          });
        }).catch(err => {
           setBtError("Stream failed");
           handleStop();
        });
        
        const startTime = Date.now();
        timerRef.current = window.setInterval(() => {
             if (incomingDataBuffer.current.length > 0) {
                 const newPoints = [...incomingDataBuffer.current].map(p => ({...p, time: p.time - startTime}));
                 incomingDataBuffer.current = [];
                 setEcgData(prev => {
                    const newHistory = [...prev, ...newPoints];
                    return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
                 });
             }
        }, UPDATE_INTERVAL);
      } else {
        simulatorRef.current.setBPM(targetBpm);
        simulatorRef.current.start();
        timerRef.current = window.setInterval(() => {
          const point = simulatorRef.current.getDataPoint();
          if (point) {
            setEcgData(prev => {
              const newHistory = [...prev, point];
              return newHistory.length > 1000 ? newHistory.slice(-1000) : newHistory;
            });
          }
        }, UPDATE_INTERVAL);
      }
    }, 5000);
  };

  const handleStop = () => {
    if (isBluetoothConnected) bluetoothRef.current.stopStreaming();
    else simulatorRef.current.stop();
    
    setStatus(isBluetoothConnected ? SensorStatus.CONNECTED : SensorStatus.DISCONNECTED);
    if (timerRef.current) clearInterval(timerRef.current);
    if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(null);
  };

  const handleReset = () => {
    handleStop();
    setEcgData([]);
    setAnalysis(null);
    setBpm(0);
  };

  const handleExportCSV = () => {
    if (ecgData.length === 0) return;
    const headers = "Time(ms),Voltage(mV)\n";
    const rows = ecgData.map(p => `${p.time},${p.voltage.toFixed(4)}`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ecg_session_${new Date().getTime()}.csv`;
    link.click();
  };

  useEffect(() => {
    if (status === SensorStatus.ACQUIRING) {
      const interval = setInterval(() => {
        if (!isBluetoothConnected) {
             setBpm(targetBpm + Math.floor(Math.random() * 4 - 2));
        } else {
            setBpm(70 + Math.floor(Math.random() * 5)); 
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [status, targetBpm, isBluetoothConnected]);

  const handleAnalyze = async () => {
    if (ecgData.length < 50) {
      alert("Not enough data. Record for at least 1-2 seconds.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await analyzeECGSegment(ecgData.map(d => d.voltage), bpm || 72);
      setAnalysis(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-lg p-1.5 shadow-sm">
              <Activity className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-800">CardioSense</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
               onClick={isBluetoothConnected ? handleBluetoothDisconnect : handleBluetoothConnect}
               className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isBluetoothConnected ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
               disabled={status === SensorStatus.ACQUIRING || status === SensorStatus.CONNECTING}
            >
               {isBluetoothConnected ? <Bluetooth size={14} className="fill-current" /> : <BluetoothOff size={14} />}
               <span className="hidden sm:inline">{isBluetoothConnected ? (deviceName || 'Connected') : 'Connect Sensor'}</span>
            </button>
            <div className={`hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'AI Online' : 'AI Offline'}</span>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full">
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {btError && (
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 text-sm">
            <AlertCircle size={18} />
            <span>{btError}</span>
            <button onClick={() => setBtError(null)} className="ml-auto font-bold">✕</button>
          </div>
        )}

        {showSettings && !isBluetoothConnected && (
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <label className="text-sm font-semibold text-slate-600">Simulated Heart Rate: {targetBpm} BPM</label>
            <input 
              type="range" min="40" max="180" value={targetBpm} 
              onChange={(e) => setTargetBpm(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500 mt-2"
            />
          </div>
        )}

        <StatsCard bpm={bpm} status={status} signalQuality={status === SensorStatus.ACQUIRING ? (isBluetoothConnected ? 92 : 98) : 0} />

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-50 flex flex-col gap-4">
            <div className="flex justify-between items-center">
               <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${status === SensorStatus.ACQUIRING ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  Real-time Stream
                </h2>
               </div>
               <div className="flex gap-2">
                 <button onClick={handleExportCSV} disabled={ecgData.length === 0} className="p-2 text-slate-400 hover:text-indigo-600"><Download size={18} /></button>
                 <button onClick={handleReset} className="p-2 text-slate-400 hover:text-slate-600"><RefreshCw size={18} /></button>
               </div>
            </div>
            <div className="flex gap-3">
               {status === SensorStatus.CONNECTING ? (
                 <button disabled className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-semibold"><Loader2 className="animate-spin" size={20} /><span>Starting {countdown}s...</span></button>
              ) : status !== SensorStatus.ACQUIRING ? (
                <button onClick={handleStart} className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200"><Play size={20} fill="currentColor" /><span>Start Recording</span></button>
              ) : (
                <button onClick={handleStop} className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold"><Square size={20} fill="currentColor" /><span>Stop Recording</span></button>
              )}
            </div>
          </div>
          <div className="h-64 sm:h-80 bg-slate-900 relative">
            <ECGChart data={ecgData} isPlaying={status === SensorStatus.ACQUIRING} />
          </div>
          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-t border-slate-100">
             <div className="text-xs font-medium text-slate-400">{isBluetoothConnected ? 'Bluetooth Device' : 'Simulator Mode'}</div>
             <button onClick={handleAnalyze} disabled={ecgData.length < 50 || isAnalyzing} className="flex items-center space-x-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-sm font-semibold">
              {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <FileText size={16} />}
              <span>Analyze ECG</span>
            </button>
          </div>
        </div>

        {analysis && (
          <div className="bg-white rounded-3xl shadow-sm border border-indigo-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-indigo-600 px-6 py-4"><h3 className="text-lg font-bold text-white">AI Analysis Report</h3></div>
            <div className="p-6 space-y-4">
               <div className="flex items-center gap-4">
                 <span className={`text-2xl font-bold ${analysis.status === 'Normal' ? 'text-emerald-600' : 'text-amber-600'}`}>{analysis.status}</span>
                 <span className="text-xs bg-slate-100 px-2 py-1 rounded-full text-slate-500">{analysis.confidence}% Confidence</span>
               </div>
               <p className="text-slate-600 text-sm leading-relaxed">{analysis.detailedAnalysis}</p>
               <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Recommendation</h4>
                  <p className="text-sm font-medium text-slate-800">{analysis.recommendation}</p>
               </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;