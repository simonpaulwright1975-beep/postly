import type { Handler } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

// Claude reads the PDF directly (text-based or scanned), so factory packing
// lists in any layout can be totalled into the figures needed to price a
// shipment. Sonnet is plenty for structured extraction.
const MODEL = "claude-sonnet-4-6";

const OUTPUT_TOOL: Anthropic.Tool = {
  name: "emit_loading_list",
  description: "Return the totalled figures read from a factory loading / packing list.",
  input_schema: {
    type: "object",
    properties: {
      total_cartons: {
        type: "number",
        description: "Total number of cartons / packages across all line items.",
      },
      total_cbm: {
        type: "number",
        description: "Total volume in cubic metres (CBM / measurement / m3).",
      },
      total_weight_kg: {
        type: "number",
        description: "Total GROSS weight in kilograms.",
      },
      line_items: {
        type: "number",
        description: "Number of distinct product line items on the list.",
      },
      origin_port: {
        type: "string",
        description:
          "Origin port or city if stated (e.g. Shanghai, Huangpu, Ningbo). Empty string if not shown.",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Anything the user should double-check: figures that were unclear, a scanned/low-quality document, multiple shipments combined, units assumed, etc.",
      },
    },
    required: ["total_cartons", "total_cbm", "total_weight_kg", "line_items", "warnings"],
  },
};

interface Body {
  data?: string; // base64 PDF
  media_type?: string;
  file_name?: string;
}

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

  let body: Body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON body." };
  }
  if (!body.data) return { statusCode: 400, body: "No document data provided." };
  const mediaType = body.media_type ?? "application/pdf";
  if (mediaType !== "application/pdf") {
    return { statusCode: 400, body: "Only PDF documents are supported by this reader." };
  }

  const system = [
    "You read factory packing / loading lists for an importer and extract the totals needed to price a shipment.",
    "Rules:",
    "- Sum the product LINE ITEMS. If the sheet also prints a TOTAL/Grand Total row, use it only to sanity-check — never add it on top of the line items.",
    "- total_cbm is the total volume in cubic metres (often labelled CBM, MEAS, Measurement, Volume, M3).",
    "- total_weight_kg is the GROSS weight in kilograms (G.W / Gross Weight). If only net weight is shown, use it and add a warning.",
    "- If a line shows a per-carton value and a carton quantity, multiply to get the line total.",
    "- If the document clearly contains more than one separate shipment/container, total everything but add a warning to split it.",
    "Return your answer by calling the emit_loading_list tool. Do not guess wildly — if a figure is genuinely unreadable, return 0 for it and add a warning.",
  ].join("\n");

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [OUTPUT_TOOL],
      tool_choice: { type: "tool", name: "emit_loading_list" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Read this loading list${body.file_name ? ` (${body.file_name})` : ""} and return the shipment totals.`,
            },
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: body.data } },
          ],
        },
      ],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { statusCode: 502, body: "Model did not return structured totals." };
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
