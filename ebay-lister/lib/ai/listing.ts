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
- Title must be <= 80 characters, keyword-optimised for eBay search, no ALL CAPS, no emoji.
- Description: short paragraphs (not bullets), open with a clear identification, include edition/publisher/ISBN (books), issue/date (magazines), material/brand (ornaments). Focus on what the item IS, not its condition — condition is captured in a separate field, so do NOT describe wear, marks, yellowing, or overall condition in the description. Do NOT mention digital access codes, online service codes, ActiveLearn codes, or any similar online/activation codes — these are almost always expired and mentioning them is misleading. No salesy fluff.
- Condition must be one of: "New", "Like New", "Very Good", "Good", "Acceptable".
- Item specifics should be appropriate to the category (books -> Author/Publisher/ISBN/Format/Language/Topic/Publication Year/Edition; magazines -> Title/Issue Number/Publication Date/Language/Topic; ornaments -> Brand/Material/Type/Theme/Colour/Dimensions).
- Price: estimate a reasonable GBP price based on the item and typical eBay UK market value; set price_is_estimate=true unless you are highly confident. Price must be a positive GBP number.
- If you cannot confidently identify the item, set confidence="low" and still produce the best draft you can.

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

function parseJSON(s: string): unknown {
  const trimmed = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model returned no JSON object");
  return JSON.parse(trimmed.slice(start, end + 1));
}
