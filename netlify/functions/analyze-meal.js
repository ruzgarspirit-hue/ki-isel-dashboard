// Yemek fotoğrafını Anthropic Claude ile analiz edip kalori tahmini döndürür.
// API anahtarı yalnızca sunucuda (Netlify ortam değişkeni) durur, tarayıcıya gitmez.
//
// Gerekli Netlify ortam değişkeni: ANTHROPIC_API_KEY
// İsteğe bağlı: ANTHROPIC_MODEL (varsayılan aşağıda; model hatası alırsanız
//   Anthropic konsolundaki güncel bir model adını buraya yazın)

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return resp(405, { error: "Yalnızca POST." });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return resp(500, { error: "Sunucuda ANTHROPIC_API_KEY tanımlı değil. Netlify → Site configuration → Environment variables." });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return resp(400, { error: "Geçersiz istek." }); }

  const { image, media_type, note } = body;
  if (!image) return resp(400, { error: "Görsel gönderilmedi." });

  const prompt = [
    "Sen deneyimli bir beslenme uzmanısın. Fotoğraftaki yemeği analiz et.",
    "Görseldeki her belirgin yiyeceği tahmini porsiyonuyla listele ve kalorisini (kcal) tahmin et.",
    "Türk mutfağını ve standart porsiyonları dikkate al. Emin değilsen makul bir tahmin yap.",
    note ? ("Kullanıcı notu: " + note) : "",
    "SADECE şu JSON ile yanıt ver, başka hiçbir metin ekleme:",
    '{"items":[{"name":"yiyecek","portion":"tahmini porsiyon","kcal":sayı}],"total_kcal":sayı,"confidence":"düşük|orta|yüksek","note":"kısa not"}',
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      return resp(r.status, { error: data?.error?.message || "Yapay zekâ hatası.", code: data?.error?.type });
    }
    const text = (data.content || []).map((c) => c.text || "").join("").trim();
    const parsed = extractJson(text);
    if (!parsed) return resp(502, { error: "Yanıt çözümlenemedi.", text });
    return resp(200, parsed);
  } catch (e) {
    return resp(500, { error: e.message || "Bilinmeyen hata." });
  }
};

function resp(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
function extractJson(t) {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
