import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, ReferenceLine, Label } from 'recharts';
import { ECGDataPoint } from '../types.ts';

interface ECGChartProps {
  data: ECGDataPoint[];
  isPlaying: boolean;
}

const ECGChart: React.FC<ECGChartProps> = ({ data, isPlaying }) => {
  const windowSize = 250;
  const displayData = data.slice(-windowSize);

  return (
    <div className="w-full h-full relative">
      <div className="absolute inset-0 pointer-events-none opacity-5" 
           style={{
             backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
             backgroundSize: '20px 20px'
           }}
      />
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
          <XAxis hide dataKey="time" />
          <YAxis domain={[-0.5, 1.5]} hide />
          <Line
            type="monotone"
            dataKey="voltage"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        </LineChart>
      </ResponsiveContainer>
      
      {!isPlaying && data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 z-10 font-medium">
          <p>Stream ready. Click Start.</p>
        </div>
      )}
    </div>
  );
};

export default ECGChart;