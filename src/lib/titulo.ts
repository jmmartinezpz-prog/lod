// Titular de un periódico a partir de su <title> (sin el "El Napicol ·" del principio)
export const tituloDe = (html: string, fallback: string) => {
  const t = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  return (t ? t.replace(/^El Napicol\s*[·|:-]\s*/i, "") : fallback).trim() || fallback;
};
