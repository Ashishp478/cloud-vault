const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

const getAIClient = () => {
  console.log("Gemini key exists:", !!process.env.GEMINI_API_KEY);

  if (!process.env.GEMINI_API_KEY) {
    console.warn('[AIService] WARNING: GEMINI_API_KEY is not defined');
    return null;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  return genAI;
};

// ─── Summarize PDF text ──────────────────────────────────────────────────────
const generateSummary = async (text) => {
  const ai = getAIClient();
  if (!ai) {
    return '• AI summary unavailable: Please set GEMINI_API_KEY in backend env.';
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `
      You are an AI assistant for a secure cloud storage. Summarize the following text extracted from a PDF document in 3-5 concise, structured bullet points outlining the core content of the document. Keep it professional. Output only the bullet points (using bullet character •), nothing else.

      Document Text:
      ${text.slice(0, 15000)}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (err) {
    console.error('[AIService] Summary generation failed:', err.message);
    throw new Error('Summary generation failed: ' + err.message);
  }
};

// ─── Image OCR (Visual Text Extraction) ──────────────────────────────────────
const performOCR = async (imageBuffer, mimeType) => {
  const ai = getAIClient();
  if (!ai) {
    return 'AI OCR unavailable: Please set GEMINI_API_KEY in backend env.';
  }

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([
      imagePart,
      'You are an expert OCR engine. Extract and transcribe all readable text from this image exactly as it appears.',
    ]);

    const response = await result.response;
    return response.text().trim() || 'No text detected in image.';

  } catch (err) {
    console.error("[AIService] OCR FULL ERROR:", err);
    throw new Error(
      "OCR text extraction failed: " +
      (err.message || JSON.stringify(err))
    );
  }
};

// ─── AI Semantic Search ──────────────────────────────────────────────────────
const semanticSearch = async (filesList, query) => {
  const ai = getAIClient();
  if (!ai) {
    return [];
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: "application/json" }
    });

    const sanitizedFiles = filesList.map(f => ({
      id: f._id.toString(),
      name: f.originalName,
      tags: f.tags || [],
      aiSummary: f.aiSummary || '',
      extractedText: f.extractedText ? f.extractedText.slice(0, 200) : '',
    }));

    const prompt = `
      You are a semantic search assistant for a cloud drive called Cloud Vault.
      Here is a list of the user's files in JSON format:
      ${JSON.stringify(sanitizedFiles)}

      The user is searching for: "${query}"

      Analyze the file names, summaries, extracted OCR texts, and tags to perform a semantic search. Match files that are conceptually relevant, even if their names don't contain the exact search query terms.
      For example, if the query is "salary policy" and a file's summary contains "compensation plans", it is a match.
      
      Return a JSON array of matching file IDs. Do not return any other text, markdown formatting, or comments. Return a pure JSON array like ["id1", "id2"]. If no files match, return [].
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text().trim();

    try {
      const matchedIds = JSON.parse(jsonText);
      return Array.isArray(matchedIds) ? matchedIds : [];
    } catch (parseErr) {
      console.error('[AIService] Error parsing Gemini search JSON response:', parseErr.message, 'Raw response:', jsonText);
      const matches = jsonText.match(/[0-9a-fA-F]{24}/g);
      return matches ? [...new Set(matches)] : [];
    }
  } catch (err) {
    console.error('[AIService] Semantic search failed:', err.message);
    return [];
  }
};

module.exports = { generateSummary, performOCR, semanticSearch };