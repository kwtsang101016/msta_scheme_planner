import { NextResponse } from "next/server";

type Body = {
  interests: string;
  track: string;
  plan: unknown;
  courses: unknown;
};

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-llm-api-key")?.trim();
  if (!apiKey) {
    return new NextResponse("Missing API key.", { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse("Invalid JSON body.", { status: 400 });
  }

  const prompt = [
    "You are an academic adviser for a Master of Statistics programme.",
    "Given the course list (with recommended offering terms) and a proposed 2-term plan, provide concise suggestions:",
    "- confirm the plan respects offering terms",
    "- suggest 1-2 alternative electives aligned to the student's interests/track",
    "- warn about gaps (e.g., programming/linear algebra/probability) if relevant",
    "",
    `Track: ${body.track}`,
    `Interests: ${body.interests || "(not provided)"}`,
    "",
    "Plan JSON:",
    JSON.stringify(body.plan, null, 2),
    "",
    "Courses JSON:",
    JSON.stringify(body.courses, null, 2),
  ].join("\n");

  // OpenAI-compatible endpoint. Users can swap via env if needed.
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Be practical, brief, and avoid hallucinating course offerings." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return new NextResponse(txt || "LLM request failed.", { status: 502 });
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const suggestion = data.choices?.[0]?.message?.content?.trim() || "No suggestion returned.";
  return NextResponse.json({ suggestion });
}

