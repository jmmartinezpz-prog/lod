import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { tituloDe } from "@/lib/titulo";

// Escribir un número entero lleva un par de minutos
export const maxDuration = 300;

const SYSTEM = `Eres el redactor jefe de El Napicol, el periódico satírico de la LOD (liga de dados de un grupo de amigos en el bar Rui).
Escribes el número del día con exactamente la misma estética, estructura, tono y running gags que los números anteriores que te pasan.
Respondes ÚNICAMENTE con el documento HTML completo, empezando por <!DOCTYPE html> y terminando en </html>: sin explicaciones, sin bloques de código markdown.
Pon en <title> "El Napicol · " seguido del titular principal.`;

// Genera el periódico del día con Claude y lo guarda en la hemeroteca.
// Devuelve el HTML en streaming para ir enseñando el progreso.
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return new Response("Falta ANTHROPIC_API_KEY en Vercel", { status: 500 });

  // Solo con llave o cuenta de admin: si no, cualquiera gastaría los créditos
  const headers: Record<string, string> = {};
  const llave = req.headers.get("x-lod-llave");
  const auth = req.headers.get("authorization");
  if (llave) headers["x-lod-llave"] = llave;
  if (auth) headers.Authorization = auth;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers },
    auth: { persistSession: false },
  });
  const { data: yo } = await db.rpc("quien_soy");
  if (!yo?.admin && !yo?.llave) return new Response("Hace falta llave", { status: 403 });

  const { prompt, fecha, dia_number } = (await req.json()) as { prompt?: string; fecha?: string; dia_number?: number | null };
  if (typeof prompt !== "string" || !prompt || prompt.length > 400_000 || !fecha) return new Response("Petición no válida", { status: 400 });

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      let html = "";
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            html += ev.delta.text;
            ctrl.enqueue(enc.encode(ev.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") throw new Error("Claude no ha querido escribir este número");
        if (final.stop_reason === "max_tokens") throw new Error("El periódico ha salido demasiado largo");
        const ini = html.search(/<!DOCTYPE html|<html/i);
        const fin = html.lastIndexOf("</html>");
        if (ini < 0 || fin < 0) throw new Error("No ha salido un HTML completo");
        html = html.slice(ini, fin + 7);
        // Se guarda aquí, así no se pierde aunque se cierre la app a medias
        const { data, error } = await db
          .from("periodicos")
          .insert({ titulo: tituloDe(html, `El Napicol · ${fecha}`), fecha, dia_number: dia_number ?? null, html })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        ctrl.enqueue(enc.encode(`\n<!--LOD-OK:${data.id}-->`));
      } catch (e) {
        const msg = e instanceof Anthropic.APIError ? `Error de Claude (${e.status})` : (e as Error).message;
        ctrl.enqueue(enc.encode(`\n<!--LOD-ERROR:${msg}-->`));
      }
      ctrl.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
