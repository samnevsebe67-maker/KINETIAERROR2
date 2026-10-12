// Netlify Function: заявка с сайта KINETIA -> Telegram.
// Переменные Netlify: TG_BOT_TOKEN, TG_CHAT_ID. Адрес: /.netlify/functions/lead
const MAX_BODY = 8000;
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const cut = (s, n) => String(s ?? '').trim().slice(0, n);
const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const tg = async (token, method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  return r.json().catch(() => ({ ok: false, description: 'HTTP ' + r.status }));
};

export default async (req) => {
  const url = new URL(req.url);
  const token = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;

  // Самодиагностика: откройте в браузере /.netlify/functions/lead  и  /.netlify/functions/lead?check=1
  if (req.method === 'GET') {
    const out = { ok: true, service: 'kinetia-lead', variables: { TG_BOT_TOKEN: !!token, TG_CHAT_ID: !!chat } };
    if (url.searchParams.get('check') === '1') {
      if (!token) out.telegram = 'нет TG_BOT_TOKEN';
      else {
        try {
          const me = await tg(token, 'getMe');
          out.telegram = me.ok ? 'токен принят, бот @' + me.result.username : 'токен отклонён: ' + (me.description || '?');
          if (me.ok) {
            if (!chat) out.chat = 'нет TG_CHAT_ID';
            else { const c = await tg(token, 'getChat', { chat_id: chat }); out.chat = c.ok ? 'чат найден' : 'чат не найден: ' + (c.description || '?'); }
          }
        } catch { out.telegram = 'Telegram недоступен с сервера'; }
      }
    }
    return json(out);
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  if (origin && new URL(origin).host !== host && origin !== url.origin) return json({ ok: false, error: 'origin' }, 403);
  if (!token || !chat) return json({ ok: false, error: 'not_configured', detail: 'нет переменных TG_BOT_TOKEN / TG_CHAT_ID' }, 500);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: 'too_large' }, 413);
  let d;
  try { d = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  if (!d || typeof d !== 'object') return json({ ok: false, error: 'bad_json' }, 400);
  if (d.hp) return json({ ok: true });

  const name = cut(d.name, 100), contact = cut(d.contact, 150);
  if (name.length < 2 || contact.length < 5) return json({ ok: false, error: 'invalid' }, 400);

  const rows = [
    ['Имя', name], ['Контакт', contact], ['Компания', cut(d.company, 150)],
    ['Сайт / соцсети', cut(d.website, 200)], ['Что нужно', cut(d.need, 60)],
    ['Задача', cut(d.message, 1500)], ['Страница', cut(d.source, 200)]
  ].filter(([, v]) => v);
  const text = '<b>Новая заявка с сайта KINETIA</b>\n\n' + rows.map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join('\n');

  try {
    const r = await tg(token, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) return json({ ok: false, error: 'telegram', detail: r.description || '' }, 502);
  } catch { return json({ ok: false, error: 'telegram_unreachable' }, 502); }
  return json({ ok: true });
};
