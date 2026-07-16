import { GoogleGenAI } from '@google/genai';

// Igual que el resto de integraciones externas de esta app (Resend, Cloudinary):
// se construye el cliente sin validar la key al arrancar — si falta, la llamada
// falla en el momento con un error claro, en vez de tumbar el proceso al boot.
// Se usa Gemini (nivel gratuito de Google AI Studio) en vez de la API de Claude
// para este feature específico, por decisión explícita del usuario de no sumar
// otro gasto recurrente — la tarea (redactar 2-4 frases sobre números ya
// calculados) es simple y cabe de sobra en el nivel gratuito.
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-3.5-flash existe pero devuelve 503 "high demand" de forma consistente
// en el nivel gratuito (verificado en vivo) — se usa flash-lite, que sí responde.
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
