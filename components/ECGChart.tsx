import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, ReferenceLine, Label } from 'recharts';
import { ECGDataPoint } from '../types';

interface ECGChartProps {
  data: ECGDataPoint[];
  isPlaying: boolean;
}

const ECGChart: React.FC<ECGChartProps> = ({ data, isPlaying }) => {
  // Only show the last N points to keep the chart readable and performant
  const windowSize = 300;
  const displayData = data.slice(-windowSize);

  return (
    <div className="w-full h-full relative">
       {/* Grid overlay for realistic ECG paper look - subtle background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-10" 
           style={{
             backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
             backgroundSize: '20px 20px'
           }}
      />
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          data={displayData}
          margin={{ top: 10, right: 10, bottom: 20, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
          
          <XAxis 
            dataKey="time" 
            type="number" 
            domain={['auto', 'auto']} 
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickFormatter={(val) => (val / 1000).toFixed(1)} // Convert ms to s
            interval="preserveStartEnd"
            minTickGap={40}
          >
            <Label value="Time (s)" position="insideBottom" offset={-5} fill="#94a3b8" fontSize={11} />
          </XAxis>
          
          <YAxis 
            domain={[-0.5, 1.5]} 
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            width={40}
          >
             <Label value="Voltage (mV)" angle={-90} position="insideLeft" offset={15} fill="#94a3b8" fontSize={11} style={{ textAnchor: 'middle' }} />
          </YAxis>

          <Line
            type="monotone"
            dataKey="voltage"
            stroke="#10b981" // Emerald 500
            strokeWidth={2}
            dot={false}
            isAnimationActive={false} // Disable animation for real-time performance
          />
          {/* Isoline */}
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        </LineChart>
      </ResponsiveContainer>
      
      {!isPlaying && data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 z-10">
          <p>Start acquisition to view ECG stream</p>
        </div>
      )}
    </div>
  );
};

export default ECGChart;