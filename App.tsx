import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Square, FileText, Settings, Upload, AlertCircle, Loader2, Activity, RefreshCw, Wifi, WifiOff, Download, Bluetooth, BluetoothOff } from 'lucide-react';
import ECGChart from './components/ECGChart';
import StatsCard from './components/StatsCard';
import { ECGSimulator } from './services/ecgSimulator';
import { BluetoothService } from './services/bluetoothService';
import { analyzeECGSegment } from './services/geminiService';
import { ECGDataPoint, SensorStatus, AnalysisResult } from './types';

// Constants
const SAMPLE_RATE = 50; // Hz
const UPDATE_INTERVAL = 1000 / SAMPLE_RATE;

const App: React.FC = () => {
  // State
  const [status, setStatus] = useState<SensorStatus>(SensorStatus.DISCONNECTED);
  const [ecgData, setEcgData] = useState<ECGDataPoint[]>([]);
  const [bpm, setBpm] = useState<number>(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Bluetooth State
  const [isBluetoothConnected, setIsBluetoothConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  
  // Simulation Settings
  const [targetBpm, setTargetBpm] = useState(72);
  
  // Refs
  const simulatorRef = useRef<ECGSimulator>(new ECGSimulator());
  const bluetoothRef = useRef<BluetoothService>(new BluetoothService());
  const timerRef = useRef<number | null>(null);
  const startupTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  
  // Data Buffer for Bluetooth high-frequency updates
  const incomingDataBuffer = useRef<ECGDataPoint[]>([]);

  // Monitor Online Status
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

  // Handle Bluetooth Connection
  const handleBluetoothConnect = async () => {
    setBtError(null);
    try {
      const connected = await bluetoothRef.current.connect();
      if (connected) {
        setIsBluetoothConnected(true);
        setDeviceName(bluetoothRef.current.getDeviceName());
        setStatus(SensorStatus.CONNECTED);
        
        // Disable simulation if connected
        simulatorRef.current.stop(); 
      }
    } catch (err: any) {
      console.error(err);
      // Gracefully handle user cancellation (NotFoundError) or explicit cancellation messages
      if (err.name === 'NotFoundError' || err.message?.includes('cancelled')) {
        return;
      }
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

  // Start Acquisition
  const handleStart = () => {
    setStatus(SensorStatus.CONNECTING);
    setCountdown(5);
    setEcgData([]); // Clear previous data
    setAnalysis(null);
    incomingDataBuffer.current = []; // Clear buffer

    // Countdown logic for UI
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    // Actual start after 5 seconds
    startupTimerRef.current = window.setTimeout(() => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdown(null);
      setStatus(SensorStatus.ACQUIRING);
      
      if (isBluetoothConnected) {
        // Start Bluetooth Stream
        bluetoothRef.current.startStreaming((voltage) => {
          // Add to buffer with current timestamp
          incomingDataBuffer.current.push({
            time: Date.now() - (timerRef.current ? 0 : Date.now()), // Relative time fix needed
            voltage: voltage
          });
        }).catch(err => {
           console.error("Stream error", err);
           setBtError("Stream failed");
           handleStop();
        });
        
        // We still need a timer to flush the buffer to the UI at a readable frame rate
        const startTime = Date.now();
        timerRef.current = window.setInterval(() => {
             // Process buffered points
             if (incomingDataBuffer.current.length > 0) {
                 const newPoints = [...incomingDataBuffer.current].map(p => ({...p, time: Date.now() - startTime}));
                 incomingDataBuffer.current = []; // clear buffer
                 
                 setEcgData(prev => {
                    const newHistory = [...prev, ...newPoints];
                    return newHistory.length > 5000 ? newHistory.slice(-5000) : newHistory;
                 });
             }
        }, UPDATE_INTERVAL);

      } else {
        // Start Simulator
        simulatorRef.current.setBPM(targetBpm);
        simulatorRef.current.start();
        
        // Timer to pull data from simulator
        timerRef.current = window.setInterval(() => {
          const point = simulatorRef.current.getDataPoint();
          if (point) {
            setEcgData(prev => {
              const newHistory = [...prev, point];
              return newHistory.length > 5000 ? newHistory.slice(-5000) : newHistory;
            });
          }
        }, UPDATE_INTERVAL);
      }
    }, 5000);
  };

  // Stop Acquisition
  const handleStop = () => {
    if (isBluetoothConnected) {
        bluetoothRef.current.stopStreaming();
    } else {
        simulatorRef.current.stop();
    }
    
    setStatus(SensorStatus.CONNECTED);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Clear startup timers
    if (startupTimerRef.current) {
      clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  };

  // Reset
  const handleReset = () => {
    handleStop();
    setEcgData([]);
    // Don't disconnect Bluetooth on reset, just go to Connected status
    setStatus(isBluetoothConnected ? SensorStatus.CONNECTED : SensorStatus.DISCONNECTED);
    setAnalysis(null);
    setBpm(0);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (ecgData.length === 0) return;
    
    // Create CSV content
    const headers = "Time(ms),Voltage(mV)\n";
    const rows = ecgData.map(p => `${p.time},${p.voltage.toFixed(4)}`).join("\n");
    const csvContent = headers + rows;
    
    // Create blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ecg_session_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Update BPM display
  useEffect(() => {
    if (status === SensorStatus.ACQUIRING) {
      const interval = setInterval(() => {
        // If bluetooth, we would implement real BPM detection here.
        // For now, if simulated, show jittered target. If BT, show placeholder or simple calc.
        if (!isBluetoothConnected) {
             setBpm(targetBpm + Math.floor(Math.random() * 4 - 2));
        } else {
            // Very basic Real-time BPM estimation placeholder
            // In a real app, you'd run a QRS detector on `ecgData`
            setBpm(prev => prev === 0 ? 70 : prev); 
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [status, targetBpm, isBluetoothConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (startupTimerRef.current) clearTimeout(startupTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (bluetoothRef.current.isConnected()) bluetoothRef.current.disconnect();
    };
  }, []);

  // AI Analysis Handler
  const handleAnalyze = async () => {
    if (ecgData.length < 100) {
      alert("Not enough data to analyze. Please record for at least a few seconds.");
      return;
    }

    if (!isOnline) {
      alert("Internet connection required for AI analysis.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const voltageData = ecgData.map(d => d.voltage);
      // Use user provided BPM or estimated
      const result = await analyzeECGSegment(voltageData, bpm || 72);
      setAnalysis(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-lg p-1.5 shadow-sm">
              <Activity className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-800">CardioSense</span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Bluetooth Connect Button */}
            <button
               onClick={isBluetoothConnected ? handleBluetoothDisconnect : handleBluetoothConnect}
               className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isBluetoothConnected ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
               disabled={status === SensorStatus.ACQUIRING || status === SensorStatus.CONNECTING}
            >
               {isBluetoothConnected ? <Bluetooth size={14} className="fill-current" /> : <BluetoothOff size={14} />}
               <span className="hidden sm:inline">{isBluetoothConnected ? (deviceName || 'Device Connected') : 'Connect Sensor'}</span>
            </button>

            {/* Connectivity Status */}
            <div className={`hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'AI Online' : 'AI Offline'}</span>
            </div>

            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors active:scale-95"
              disabled={isBluetoothConnected} // Disable simulator settings if using real device
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        
        {/* Error Message */}
        {btError && (
             <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 text-sm">
                 <AlertCircle size={18} />
                 <span>{btError}</span>
                 <button onClick={() => setBtError(null)} className="ml-auto font-bold">✕</button>
             </div>
        )}

        {/* Settings Panel */}
        {showSettings && !isBluetoothConnected && (
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-col space-y-3">
              <div className="flex justify-between items-center">
                   <label className="text-sm font-semibold text-slate-600">Simulated Heart Rate</label>
                   <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded">Simulation Mode</span>
              </div>
              <div className="flex items-center space-x-4">
                <input 
                  type="range" 
                  min="40" 
                  max="180" 
                  value={targetBpm} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setTargetBpm(val);
                    simulatorRef.current.setBPM(val);
                  }}
                  className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-sm font-bold text-slate-900 min-w-[3rem] text-center bg-slate-100 py-1 px-2 rounded-lg">{targetBpm}</span>
              </div>
            </div>
          </div>
        )}

        {/* Vital Stats */}
        <StatsCard 
          bpm={bpm} 
          status={status} 
          signalQuality={status === SensorStatus.ACQUIRING ? (isBluetoothConnected ? 92 : 98) : 0} 
        />

        {/* Main Chart Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          {/* Chart Header & Controls */}
          <div className="p-4 border-b border-slate-50 flex flex-col gap-4">
            <div className="flex items-center justify-between">
               <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${status === SensorStatus.ACQUIRING ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                  Lead I View
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                    {isBluetoothConnected ? `Live Feed: ${deviceName || 'Unknown Device'}` : 'Simulated Sensor Stream'}
                </p>
               </div>
               
               {/* Header Actions */}
               <div className="flex items-center space-x-1">
                 {/* Export Button */}
                 <button 
                    onClick={handleExportCSV}
                    disabled={ecgData.length === 0 || status === SensorStatus.ACQUIRING}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all disabled:opacity-30 active:scale-95"
                    title="Export to CSV"
                  >
                    <Download size={18} />
                  </button>

                 {/* Reset Button */}
                 <button 
                    onClick={handleReset}
                    disabled={status === SensorStatus.ACQUIRING || status === SensorStatus.CONNECTING}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all disabled:opacity-30 active:scale-95"
                    title="Reset Data"
                  >
                    <RefreshCw size={18} />
                  </button>
               </div>
            </div>

            {/* Main Action Buttons */}
            <div className="flex gap-3">
               {status === SensorStatus.CONNECTING ? (
                 <button 
                  disabled
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-semibold transition-all cursor-wait border border-emerald-100"
                >
                  <Loader2 className="animate-spin" size={20} />
                  <span>Starting in {countdown}s...</span>
                </button>
              ) : status !== SensorStatus.ACQUIRING ? (
                <button 
                  onClick={handleStart}
                  disabled={!isBluetoothConnected && status === SensorStatus.DISCONNECTED && /* Allow sim if disconnected but logic handled in click */ false}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-semibold shadow-lg transition-all active:scale-95 active:shadow-none text-white ${isBluetoothConnected || status === SensorStatus.CONNECTED || status === SensorStatus.DISCONNECTED ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200' : 'bg-slate-300 cursor-not-allowed'}`}
                >
                  <Play size={20} fill="currentColor" />
                  <span>Start Recording</span>
                </button>
              ) : (
                <button 
                  onClick={handleStop}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-semibold shadow-lg shadow-rose-200 transition-all active:scale-95 active:shadow-none"
                >
                  <Square size={20} fill="currentColor" />
                  <span>Stop Recording</span>
                </button>
              )}
            </div>
          </div>
          
          {/* Chart Area */}
          <div className="h-64 sm:h-72 bg-slate-900 relative">
            <ECGChart data={ecgData} isPlaying={status === SensorStatus.ACQUIRING} />
            
            {/* Status Overlay */}
            <div className="absolute top-3 right-3 flex items-center space-x-2 bg-slate-800/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-slate-700">
               <span className={`w-1.5 h-1.5 rounded-full ${status === SensorStatus.ACQUIRING ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
               <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wide">
                 {status === SensorStatus.ACQUIRING ? 'Live' : 'Standby'}
               </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-t border-slate-100">
             <div className="text-xs font-medium text-slate-400">
                50Hz Sampling • {isBluetoothConnected ? 'BLE Mode' : 'Sim Mode'}
             </div>
             <button 
               onClick={handleAnalyze}
               disabled={ecgData.length === 0 || isAnalyzing || status === SensorStatus.CONNECTING}
               className="flex items-center space-x-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:bg-transparent"
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={16}/> : <FileText size={16} />}
              <span>{isOnline ? 'Analyze AI' : 'Offline'}</span>
            </button>
          </div>
        </div>

        {/* AI Analysis Result */}
        {analysis && (
          <div className="bg-white rounded-3xl shadow-sm border border-indigo-100 overflow-hidden animate-in fade-in slide-in-from-bottom-8">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 flex items-center gap-4">
              <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                <FileText className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Analysis Report</h3>
                <p className="text-indigo-100 text-xs font-medium opacity-90">Generated by Gemini 2.5 Flash</p>
              </div>
            </div>
            
            <div className="p-5 space-y-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Diagnosis</h4>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`text-2xl font-bold ${analysis.status === 'Normal' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {analysis.status}
                    </span>
                    {analysis.confidence > 0 && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold uppercase rounded-full tracking-wide">
                        {analysis.confidence}% Conf.
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-xs text-slate-500 block mb-1">Heart Rate</span>
                        <span className="text-lg font-bold text-slate-800">{Math.round(analysis.heartRate)} <span className="text-xs text-slate-400 font-normal">BPM</span></span>
                     </div>
                     <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-xs text-slate-500 block mb-1">HRV</span>
                        <span className="text-lg font-bold text-slate-800">{Math.round(analysis.hrv)} <span className="text-xs text-slate-400 font-normal">ms</span></span>
                     </div>
                  </div>
                </div>

                <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={16} className="text-indigo-500"/>
                    <h4 className="text-sm font-bold text-slate-700">Interpretation</h4>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4">
                    {analysis.detailedAnalysis}
                  </p>
                  <div className="pt-3 border-t border-slate-200">
                     <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-1">Recommendation</h5>
                     <p className="text-sm text-slate-800 font-medium">
                       {analysis.recommendation}
                     </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-amber-50 px-5 py-3 border-t border-amber-100">
               <p className="text-[10px] text-amber-800/80 text-center font-medium leading-tight">
                 For demonstration only. Not a medical device. Consult a physician for advice.
               </p>
            </div>
          </div>
        )}
        
        {/* Instructions */}
        {!analysis && ecgData.length === 0 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wide">Instructions</h3>
                    <ul className="space-y-3">
                      {[
                        "Click 'Connect Sensor' to pair your device.",
                        "Hold the sensors steadily with both hands.",
                        "Press 'Start Recording' to stream data.",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">{i+1}</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                </div>
                 <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-3xl text-white shadow-lg shadow-indigo-200">
                    <div className="flex items-start justify-between mb-4">
                       <h3 className="font-bold text-lg">Upload Data</h3>
                       <Upload className="text-indigo-200" size={24} />
                    </div>
                    <p className="text-indigo-100 text-sm mb-6 leading-relaxed">Have existing ECG data? Upload a JSON or CSV file to analyze it instantly.</p>
                    <button className="w-full bg-white/20 hover:bg-white/30 py-3 rounded-xl transition-colors text-sm font-bold backdrop-blur-sm border border-white/10 active:scale-95">
                        Select File
                    </button>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;