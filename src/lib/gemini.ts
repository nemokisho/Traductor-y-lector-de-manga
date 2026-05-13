import { GoogleGenAI } from "@google/genai";

export interface TranslationBox {
  text: string;
  originalText: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function translateMangaPage(base64Image: string, mimeType: string, targetLanguage: string = "ESPAÑOL"): Promise<TranslationBox[]> {
  try {
    const prompt = `Eres un traductor profesional de manga. Detecta todos los globos de texto y el texto fuera de los globos en esta página de manga. 
    Para cada elemento de texto encontrado, proporciona el texto original (en su idioma original, usualmente japonés) y su traducción al ${targetLanguage.toUpperCase()}.
    También proporciona las coordenadas y dimensiones aproximadas del bloque de texto como porcentajes (0 a 100) relativos al tamaño de la imagen.
    Devuelve el resultado como un array JSON de objetos con las siguientes claves: text (traducción al ${targetLanguage}), originalText, x, y, width, height.
    Devuelve ÚNICAMENTE el array JSON, sin ninguna otra explicación o texto.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: [
        { text: prompt },
        {
          inlineData: {
            data: base64Image.includes(',') ? base64Image.split(',')[1] : base64Image,
            mimeType: mimeType,
          },
        }
      ]
    });

    const responseText = response.text || "[]";
    // Clean markdown formatting if present
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const cleanedJson = jsonMatch ? jsonMatch[0] : responseText;

    try {
      return JSON.parse(cleanedJson);
    } catch (e) {
      console.error("Error parsing Gemini response:", responseText);
      return [];
    }
  } catch (error: any) {
    console.error("Error al llamar a la API de traducción:", error);
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("403")) {
      throw new Error("API_KEY_MISSING");
    }
    throw error;
  }
}
