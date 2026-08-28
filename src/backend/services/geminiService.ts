// src/backend/services/geminiService.ts
//
// Talks to the Gemini API. No vscode import — the key and the source text are
// passed in, so this can be exercised from a plain script.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const TIMEOUT_MS = 30000;

export interface GenerateRequest {
  symbolName: string;
  /** Relative path, shown to the model for context. */
  filePath: string;
  /** The function body exactly as it appears in the editor. */
  source: string;
  /** An existing comment above the function, if any. Passed so the model
   *  extends the author's intent instead of contradicting it. */
  existingComment?: string;
  /** Prior turns of this refinement session, oldest first. */
  history?: Turn[];
  /** What the user just asked for, e.g. "make it shorter". Absent on the
   *  first generation. */
  instruction?: string;
  model?: string;
}

export interface Turn {
  role: 'user' | 'model';
  text: string;
}

const SYSTEM_INSTRUCTION = `You write documentation for individual functions.

Rules:
- Describe what the function does, what it returns, and anything a caller must
  know (thrown errors, side effects, assumptions). Lead with the behaviour.
- Two to five sentences. No headings, no bullet lists, no code fences.
- Plain prose. Do not restate the signature or list parameters mechanically.
- Do not invent behaviour the code does not show. If something is unclear from
  the source, say nothing about it rather than guessing.
- Output only the documentation text. No preamble, no "Here is the
  documentation", no markdown formatting around it.`;

/**
 * Generates (or refines) documentation for one function.
 *
 * Stateless: `history` is resent each turn, because the API keeps no session.
 */
export async function generateDocumentation(
  apiKey: string,
  request: GenerateRequest
): Promise<string> {
  const model = request.model ?? DEFAULT_MODEL;
  const url = `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  

  const contents = [
    { role: 'user' as const, parts: [{ text: buildPrompt(request) }] },
    ...(request.history ?? []).map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
  ];

  if (request.instruction) {
    contents.push({
      role: 'user' as const,
      parts: [{ text: `Revise the documentation: ${request.instruction}` }],
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Gemini timed out.');
    }
    throw new Error('Could not reach the Gemini API. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${response.status}: ${body.slice(0, 400)}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    const reason = data.candidates?.[0]?.finishReason;
    throw new Error(
      reason === 'SAFETY'
        ? 'Gemini declined to answer for this function.'
        : 'Gemini returned an empty response.'
    );
  }

  return stripFences(text);
}

function buildPrompt(request: GenerateRequest): string {
  const parts = [
    `Document the function \`${request.symbolName}\` from ${request.filePath}.`,
  ];

  if (request.existingComment?.trim()) {
    parts.push(
      `An existing comment above it reads:\n${request.existingComment.trim()}\n` +
        `Build on this rather than contradicting it.`
    );
  }

  parts.push('Source:', '```', request.source, '```');
  return parts.join('\n\n');
}

/** Models often wrap prose in ``` despite being told not to. */
function stripFences(text: string): string {
  return text
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
}

function explainError(status: number, body: string): string {
  if (status === 400 && body.includes('API key not valid')) {
    return 'That Gemini API key is not valid. Run "Doc Manager: Set Gemini API Key" to replace it.';
  }
  if (status === 403) {
    return 'Gemini refused the request. The API key may lack access to this model.';
  }
  if (status === 429) {
    return 'Gemini rate limit reached. Wait a moment and try again.';
  }
  return `Gemini returned ${status}.`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}