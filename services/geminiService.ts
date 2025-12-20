import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types.ts";

const getApiKey = () => {
  try {
    return process.env.API_KEY || '';
  } catch (e) {
    return '';
  }
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export const analyzeECGSegment = async (
  dataPoints: number[], 
  averageBPM: number
): Promise<AnalysisResult> => {
  
  const sampledData = dataPoints.slice(-200);
  const dataString = sampledData.map(v => v.toFixed(3)).join(', ');

  const prompt = `
    Analyze this Lead I ECG data (mV).
    Estimated BPM: ${averageBPM}
    Data: [${dataString}]

    Return JSON:
    {
      "heartRate": number,
      "hrv": number,
      "status": "Normal" | "Irregular" | "Tachycardia" | "Bradycardia" | "Noise",
      "confidence": number,
      "recommendation": "string",
      "detailedAnalysis": "string"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
    if (!text) throw new Error("No response");
    return JSON.parse(text) as AnalysisResult;
  } catch (error) {
    console.error("Analysis Error:", error);
    return {
      heartRate: averageBPM,
      hrv: 0,
      status: "Normal",
      confidence: 0,
      recommendation: "Please try again or check connection.",
      detailedAnalysis: "AI analysis was unable to complete."
    };
  }
};