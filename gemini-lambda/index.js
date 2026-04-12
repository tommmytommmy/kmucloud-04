const { GoogleGenerativeAI } = require("@google/generative-ai");

const buildPrompt = (sourceText) => `You are an expert academic editor.
Rewrite the following text in a formal academic paper style.

Rules:
- Keep the ORIGINAL LANGUAGE of the input. Do NOT translate to another language.
- Use objective tone, prefer passive voice where natural, and precise terminology.
- Remove colloquialisms, contractions, and subjective expressions.
- Preserve the original meaning; do not add new facts or commentary.
- Output ONLY the rewritten text. No explanations, no quotes, no labels.

Input:
${sourceText}`;

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  let input;
  try {
    input = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (err) {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const sourceText = input?.sourceText;
  if (!sourceText || typeof sourceText !== "string" || !sourceText.trim()) {
    return jsonResponse(400, { error: "sourceText is required" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return jsonResponse(500, { error: "GEMINI_API_KEY not configured" });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(buildPrompt(sourceText));
    const translatedText = (await result.response).text().trim();
    return jsonResponse(200, { translatedText });
  } catch (err) {
    console.error("Gemini 호출 실패:", err);
    return jsonResponse(502, { error: "Gemini request failed" });
  }
};
