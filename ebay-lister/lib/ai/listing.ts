const BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = process.env.NVIDIA_MODEL || "qwen/qwen3.5-397b-a17b";

export type AIListing = {
  title: string;
  description: string;
  condition: "New" | "Like New" | "Very Good" | "Good" | "Acceptable";
  category_id?: string;
  category_name?: string;
  price_gbp: number;
  price_is_estimate: boolean;
  item_specifics: Record<string, string>;
  confidence: "high" | "medium" | "low";
  notes?: string;
};

const SYSTEM = `You analyse photos of items a UK seller is listing on eBay.co.uk and produce a draft listing.
Target marketplace: eBay UK (EBAY_GB). Currency: GBP. UK English only.
Item types you see most: educational books, general books, magazines, ornaments/collectibles.

Rules:
- Title must be a COMPLETE, self-contained title of <= 80 characters (count every character including spaces). It must NEVER be cut off mid-word or end with a hanging preposition/article ("for", "the", "with", "and", "by", "of"). If everything doesn't fit, drop lower-priority details and end cleanly — do not truncate. Priority order: [item identifier (book title / magazine title / ornament name)] > [edition/issue/author/brand] > [format/condition cue] > [extras]. No ALL CAPS, no emoji, no trailing ellipsis.
- Description: short paragraphs (not bullets), open with a clear identification, include edition/publisher/ISBN (books), issue/date (magazines), material/brand (ornaments). Focus on what the item IS, not its condition — condition is captured in a separate field, so do NOT describe wear, marks, yellowing, or overall condition in the description. Do NOT mention digital access codes, online service codes, ActiveLearn codes, or any similar online/activation codes — these are almost always expired and mentioning them is misleading. No salesy fluff.
- Condition must be one of: "New", "Like New", "Very Good", "Good", "Acceptable".
- Item specifics should be appropriate to the category (books -> Author/Publisher/ISBN/Format/Language/Topic/Publication Year/Edition; magazines -> Title/Issue Number/Publication Date/Language/Topic; ornaments -> Brand/Material/Type/Theme/Colour/Dimensions).
- Price: estimate a reasonable GBP price based on the item and typical eBay UK market value; set price_is_estimate=true unless you are highly confident. Price must be a positive GBP number.
- If you cannot identify the exact product, DO NOT return an error or empty fields. Describe what you can actually see in detail — type of item, material, colour, size, brand if visible, any readable text or labels. Use those visual details to produce a usable, descriptive title and description. For furniture and household items: describe style, material, estimated dimensions, and distinguishing features. Always produce a complete, listable draft from whatever is visible. Set confidence="low" when you're working from visual description only.
- Never return an error, a placeholder like "Unknown item", or an empty title/description. A best-effort visual description is always better than nothing.

Respond with ONLY a single JSON object matching this schema (no prose, no markdown fence):
{
  "title": string,
  "description": string,
  "condition": "New"|"Like New"|"Very Good"|"Good"|"Acceptable",
  "category_id": string | null,
  "category_name": string | null,
  "price_gbp": number,
  "price_is_estimate": boolean,
  "item_specifics": { [key: string]: string },
  "confidence": "high"|"medium"|"low",
  "notes": string | null
}`;

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function generateListing(
  images: { data: string; mediaType: string }[],
): Promise<{ listing: AIListing; raw: unknown }> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY not set");

  const content: ContentPart[] = images.map((img) => ({
    type: "image_url",
    image_url: { url: `data:${img.mediaType};base64,${img.data}` },
  }));
  content.push({
    type: "text",
    text: "Analyse these photos and produce the JSON listing draft as instructed.",
  });

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NVIDIA API ${res.status}: ${body.slice(0, 300)}`);
  }

  const raw = await res.json();
  const text: string | undefined = raw?.choices?.[0]?.message?.content;
  if (!text) throw new Error("No text in model response");
  const listing = parseJSON(text) as AIListing;
  return { listing, raw };
}

// Trim title to the last COMPLETE word. Safe to call even when title is already fine.
export function cleanTitle(raw: string, max = 80): string {
  let t = raw.trim().replace(/\s+/g, " ");
  // Drop any trailing ellipsis the model may have added.
  t = t.replace(/[\u2026]+\s*$/u, "").replace(/\.\.\.+\s*$/u, "").trimEnd();
  if (t.length <= max) return finishClean(t);

  // Over-length: cut to max, then back up to the last space if we're mid-word.
  let cut = t.slice(0, max);
  const endsOnWordChar = /[A-Za-z0-9]/.test(t.charAt(max - 1)) && /[A-Za-z0-9]/.test(t.charAt(max) ?? "");
  if (endsOnWordChar) {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > 20) cut = cut.slice(0, lastSpace);
  }
  return finishClean(cut);
}

// Strip trailing punctuation/stop-words so the title doesn't end with "for", "-", etc.
const HANGING = new Set([
  "for", "the", "a", "an", "and", "or", "of", "with", "by", "to", "in", "on", "at",
]);
function finishClean(s: string): string {
  let t = s.trim();
  // Remove trailing dashes, commas, colons, semicolons.
  t = t.replace(/[\s,;:\-–—]+$/u, "");
  // Remove trailing hanging word if any.
  const words = t.split(" ");
  while (words.length > 1 && HANGING.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return words.join(" ").replace(/[\s,;:\-–—]+$/u, "").trim();
}

function parseJSON(s: string): unknown {
  const trimmed = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model returned no JSON object");
  return JSON.parse(trimmed.slice(start, end + 1));
}
