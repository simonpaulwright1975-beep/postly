import type { Handler } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

// Latest capable Claude model for on-brand copywriting.
const MODEL = "claude-sonnet-4-6";

const PLATFORM_GUIDANCE: Record<string, string> = {
  instagram:
    "Warm, sensory, first-person brand voice. 1–3 short paragraphs. 5–12 relevant hashtags. Emoji sparingly if on-brand.",
  facebook:
    "Conversational and a little longer than Instagram. A soft call to action. 0–3 hashtags.",
  linkedin:
    "Professional but human. Lead with insight or a story. No more than 3 hashtags. No emoji spam.",
  x: "Punchy, under 280 characters total including hashtags. 1–2 hashtags max.",
  tiktok: "Hooky, casual, trend-aware caption. A few hashtags.",
  threads: "Casual and concise, under 500 characters. Minimal hashtags.",
};

const OUTPUT_TOOL: Anthropic.Tool = {
  name: "emit_content",
  description: "Return the generated, platform-tailored social content.",
  input_schema: {
    type: "object",
    properties: {
      idea: {
        type: "string",
        description: "One-sentence summary of the core post idea.",
      },
      alt_text: {
        type: "string",
        description: "Accessibility alt text, if an image is implied.",
      },
      variants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            platform: { type: "string" },
            body: { type: "string", description: "Caption WITHOUT hashtags." },
            hashtags: {
              type: "array",
              items: { type: "string" },
              description: "Hashtags WITHOUT the leading # symbol.",
            },
          },
          required: ["platform", "body", "hashtags"],
        },
      },
      blog_body: {
        type: "string",
        description: "400–800 word Markdown blog post. Omit unless requested.",
      },
    },
    required: ["idea", "variants"],
  },
};

interface GenerateImage {
  role: "attach" | "inspiration";
  media_type: string;
  data: string;
}

interface GenerateBody {
  prompt?: string;
  product?: { title: string; description: string; price?: number; currency?: string };
  platforms: string[];
  includeBlog: boolean;
  images?: GenerateImage[];
  brand: {
    voice: string;
    tone: string;
    audience: string;
    product_list: string;
    do_words: string;
    dont_words: string;
  };
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 400,
      body: "ANTHROPIC_API_KEY is not set on the server. Add it to the environment and redeploy.",
    };
  }

  let body: GenerateBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body." };
  }

  const platforms = body.platforms?.length ? body.platforms : ["instagram"];
  const { brand } = body;

  const system = [
    "You are the social copywriter for TUMCH, a wellness lifestyle brand.",
    "Write only in the TUMCH brand voice described below. Never invent product claims, prices, or facts not given.",
    brand?.voice && `VOICE: ${brand.voice}`,
    brand?.tone && `TONE: ${brand.tone}`,
    brand?.audience && `AUDIENCE: ${brand.audience}`,
    brand?.product_list && `PRODUCTS: ${brand.product_list}`,
    brand?.do_words && `PREFER these words/themes: ${brand.do_words}`,
    brand?.dont_words && `AVOID these words/themes: ${brand.dont_words}`,
  ]
    .filter(Boolean)
    .join("\n");

  const source = body.product
    ? `Write about this product:\nTitle: ${body.product.title}\nDescription: ${body.product.description}` +
      (body.product.price != null
        ? `\nPrice: ${body.product.currency ?? "GBP"} ${body.product.price}`
        : "")
    : `Topic / brief: ${body.prompt ?? "An on-brand TUMCH post."}`;

  const guidance = platforms
    .map((p) => `- ${p}: ${PLATFORM_GUIDANCE[p] ?? "On-brand caption."}`)
    .join("\n");

  const images = (body.images ?? []).filter((img) =>
    SUPPORTED_IMAGE_TYPES.includes(img.media_type),
  );
  const attached = images.filter((img) => img.role === "attach");
  const inspiration = images.filter((img) => img.role === "inspiration");

  const imageNotes = [
    attached.length
      ? "An ATTACHED photo is included — this is the actual image that will be published. " +
        "Ground the caption and alt_text on what is genuinely visible in it; do not invent details."
      : "",
    inspiration.length
      ? "INSPIRATION image(s) are included as mood/tone reference only. Let them guide the " +
        "feeling and styling of the copy. Do NOT describe them literally — they are not being published."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
    source,
    imageNotes ? "\n" + imageNotes : "",
    "",
    `Produce one tailored variant for each of these platforms: ${platforms.join(", ")}.`,
    "Per-platform guidance:",
    guidance,
    body.includeBlog
      ? "\nAlso write a 400–800 word blog post in Markdown (blog_body)."
      : "",
    "\nReturn your answer by calling the emit_content tool.",
  ].join("\n");

  const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
    { type: "text", text: userPrompt },
  ];
  for (const img of images) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type as never, data: img.data },
    });
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools: [OUTPUT_TOOL],
      tool_choice: { type: "tool", name: "emit_content" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { statusCode: 502, body: "Model did not return structured content." };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toolUse.input),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { statusCode: 502, body: `Claude request failed: ${msg}` };
  }
};
