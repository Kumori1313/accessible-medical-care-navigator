export interface OcrResult {
  text: string;
  /** Mean OCR word confidence, 0-100, or null when no words were found. */
  confidence: number | null;
  low_confidence: boolean;
}

export interface RedactResult {
  text: string;
  counts: Record<string, number>;
}

export interface Section {
  title: string;
  what_it_asks: string;
  required: boolean | null;
  /** Verbatim excerpt of the source text, or "" when unavailable. */
  quote: string;
}

export interface Explanation {
  document_type: string;
  summary: string;
  sections: Section[];
  uncertain: string[];
}

export type ReadingLevel = "simple" | "standard" | "detailed";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function createApi(
  baseUrl = "/api",
  fetchImpl: typeof fetch = (...a) => fetch(...a),
) {
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, init);
    } catch {
      throw new ApiError(
        "Could not reach the service. Check your connection and try again.",
        0,
      );
    }
    if (!response.ok) {
      let detail = "Something went wrong.";
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        /* keep generic message */
      }
      throw new ApiError(detail, response.status);
    }
    return (await response.json()) as T;
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    ocr(file: File) {
      const form = new FormData();
      form.append("file", file);
      return request<OcrResult>("/ocr", { method: "POST", body: form });
    },
    redact(text: string) {
      return request<RedactResult>("/redact", json({ text }));
    },
    explain(text: string, readingLevel: ReadingLevel) {
      return request<Explanation>(
        "/explain",
        json({ text, reading_level: readingLevel }),
      );
    },
  };
}

export type Api = ReturnType<typeof createApi>;
