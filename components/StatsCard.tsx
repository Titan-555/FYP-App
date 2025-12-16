import React from 'react';
import { Heart, Activity, Zap } from 'lucide-react';

interface StatsCardProps {
  bpm: number;
  status: string;
  signalQuality: number; // 0-100
}

const StatsCard: React.FC<StatsCardProps> = ({ bpm, status, signalQuality }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
      {/* BPM Card */}
      <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="p-2.5 bg-red-50 rounded-xl text-red-500 animate-pulse">
          <Heart size={20} fill="currentColor" />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Heart Rate</p>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-800">{bpm > 0 ? bpm : '--'} <span className="text-xs font-normal text-slate-400">BPM</span></h3>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="p-2.5 bg-blue-50 rounded-xl text-blue-500">
          <Activity size={20} />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Status</p>
          <h3 className="text-base sm:text-lg font-bold text-slate-800 capitalize truncate">{status === 'ACQUIRING' ? 'Acquiring' : status.toLowerCase().replace('_', ' ')}</h3>
        </div>
      </div>

      {/* Signal Quality Card - Spans 2 columns on mobile for balance */}
      <div className="col-span-2 md:col-span-1 bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-row items-center gap-3">
        <div className={`p-2.5 rounded-xl ${signalQuality > 80 ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
          <Zap size={20} />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Signal Quality</p>
          <h3 className="text-xl sm:text-2xl font-bold text-slate-800">{signalQuality}%</h3>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;