// ============================================================================
// WDOS translate — Phase 129 (fast, reliable cloud translation).
//
// The room's translation lane leaned on the browser's built-in translator
// (great when present, absent on many phones) and then on a free public
// service that throttles shared connections — which showed up in real use
// as slow or missing translations. This function translates with a fast
// Groq language model using the SAME free GROQ_API_KEY as the ears and
// the voice. Typical answer time is well under a second.
//
// Deploy WITHOUT any CLI: Supabase Dashboard → Edge Functions →
// Deploy a new function → name it exactly  translate  → paste this whole
// file → Deploy. Leave "Verify JWT" on. No new secret.
//
// Invocation from the app:
//   GET  → { configured }
//   POST { text, from, to }  → { text }
// Errors: 401 not signed in · 400 bad input · 502 translate_failed ·
//         503 not_configured
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const NAMES: Record<string, string> = {
  en: "English", fr: "French", ar: "Arabic", pt: "Portuguese",
  sw: "Swahili", ha: "Hausa", yo: "Yoruba", ig: "Igbo",
};
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Phase 142: several models in order. A refusal that names the model
// (retired, 400/404) or a rate/capacity refusal (429/503) moves to the next;
// every refusal is logged with Groq's own words so the Logs tab shows why.
const MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "gemma2-9b-it"];
const MAX_CHARS = 1200;

async function whoAmI(userJwt: string): Promise<{ id: string } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${userJwt}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id } : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const tStart = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const key = (Deno.env.get("GROQ_API_KEY") || "").trim();
  if (req.method === "GET") return json({ configured: !!key });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!key) return json({ error: "not_configured", missing: ["GROQ_API_KEY"] }, 503);

  const auth = req.headers.get("Authorization") || "";
  const userJwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!userJwt) return json({ error: "not_signed_in" }, 401);
  const me = await whoAmI(userJwt);
  if (!me) return json({ error: "not_signed_in" }, 401);

  let body: { text?: string; from?: string; to?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const text = String(body.text || "").trim().slice(0, MAX_CHARS);
  const from = NAMES[String(body.from || "").trim().toLowerCase()];
  const to = NAMES[String(body.to || "").trim().toLowerCase()];
  if (!text || !from || !to) return json({ error: "bad_input" }, 400);
  if (from === to) return json({ text });

  try {
    let lastStatus = 0, lastDetail = "";
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const r = await fetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model, temperature: 0, max_tokens: 800,
            messages: [
              { role: "system",
                content: "You are a professional interpreter. Reply with ONLY " +
                  "the translation of the user's text, nothing else: no notes, " +
                  "no quotation marks, no explanations." },
              { role: "user", content: `Translate this from ${from} to ${to}:\n${text}` },
            ],
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const out = String(data?.choices?.[0]?.message?.content || "").trim();
          if (out) return json({ text: out, model, ms: Date.now() - tStart });
          lastStatus = 200; lastDetail = "empty";
          break;
        }
        lastStatus = r.status; lastDetail = (await r.text()).slice(0, 300);
        console.error(`translate ${model} -> ${r.status}: ${lastDetail}`);
        // 429 / 503: wait briefly and retry once on the same model
        if ((r.status === 429 || r.status === 503) && attempt === 0) {
          await new Promise((res) => setTimeout(res, 400));
          continue;
        }
        break; // any other refusal (400 retired model, 404, 401) → next model
      }
    }
    return json({ error: "translate_failed", status: lastStatus, detail: lastDetail }, 502);
  } catch (e) {
    return json({ error: "translate_failed", detail: String(e).slice(0, 300) }, 502);
  }
});
