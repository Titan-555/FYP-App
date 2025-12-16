import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const GEMINI_API_KEY = process.env.API_KEY || '';

// Initialize Gemini Client
// Note: In a production app, you might want to proxy this through a backend to hide the key,
// or require the user to input their own key for a client-side only demo.
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const analyzeECGSegment = async (
  dataPoints: number[], 
  averageBPM: number
): Promise<AnalysisResult> => {
  
  // Sample the data to avoid token limits if the array is huge, though 500 points is usually fine.
  const sampledData = dataPoints.filter((_, i) => i % 2 === 0).slice(-200);
  const dataString = sampledData.map(v => v.toFixed(3)).join(', ');

  const prompt = `
    You are an expert cardiologist assistant. Analyze the following sequence of ECG voltage data points (millivolts) recorded from a Lead I configuration (Two-Point Sensor).
    
    Context:
    - Average BPM estimated: ${averageBPM}
    - Sampling Rate: Approx 50Hz (simulated)
    
    Data: [${dataString}]

    Task:
    1. Evaluate the rhythm regularity.
    2. Detect any potential anomalies (ST elevation, irregular R-R, noise).
    3. Provide a brief health recommendation.
    
    Return the response in strictly valid JSON format matching this structure:
    {
      "heartRate": number,
      "hrv": number,
      "status": "Normal" | "Irregular" | "Tachycardia" | "Bradycardia" | "Noise",
      "confidence": number (0-100),
      "recommendation": "string",
      "detailedAnalysis": "string"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            heartRate: { type: Type.NUMBER },
            hrv: { type: Type.NUMBER },
            status: { type: Type.STRING, enum: ["Normal", "Irregular", "Tachycardia", "Bradycardia", "Noise"] },
            confidence: { type: Type.NUMBER },
            recommendation: { type: Type.STRING },
            detailedAnalysis: { type: Type.STRING }
          },
          required: ["heartRate", "status", "recommendation", "detailedAnalysis"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Fallback Mock Response for demo robustness
    return {
      heartRate: averageBPM,
      hrv: 45,
      status: "Normal",
      confidence: 0,
      recommendation: "Analysis failed. Please try again.",
      detailedAnalysis: "Could not connect to AI service. Ensure API Key is valid."
    };
  }
};