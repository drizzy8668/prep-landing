// ============================================================
// POST /lead — Cloudflare Pages Function (v2)
// Same pattern as v1, extended to carry goals/region/age from
// the multi-step form into amoCRM tags and custom fields.
//
// SARDOR — set in Cloudflare Pages → Settings → Environment variables:
//   AMOCRM_SUBDOMAIN, AMOCRM_ACCESS_TOKEN, AMOCRM_PIPELINE_ID, AMOCRM_STATUS_ID
//   (optional) META_PIXEL_ID, META_ACCESS_TOKEN
// ============================================================

const GOAL_LABELS = {
  razgovor: 'Bemalol gaplashish',
  karyera: 'Ish/karyera',
  farzand: 'Farzandiga yordam',
  mukammal: "To'liq mukammal o'rganish",
};

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  const { name, phone, goals, region, age, source, utm_source, utm_medium, utm_campaign,
          utm_content, utm_term, fbclid, yclid, gclid, page_url } = body;

  if (!name || !phone || phone.replace(/\D/g, '').length < 12) {
    return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400 });
  }

  const tags = [source || 'landing_prep_uz_v2'];
  if (utm_source) tags.push(`utm_${utm_source}`);
  if (utm_medium === 'cpc' || utm_source === 'yandex') tags.push('yandex_direct');
  if (utm_source === 'facebook' || utm_source === 'instagram' || fbclid) tags.push('meta_ads');
  if (gclid) tags.push('google_ads');
  if (Array.isArray(goals)) goals.forEach(g => tags.push(GOAL_LABELS[g] || g));
  if (region) tags.push(region);

  const leadName = `Заявка с лендинга — ${name}${age ? `, ${age} лет` : ''}`;

  const leadPayload = [{
    name: leadName,
    pipeline_id: Number(env.AMOCRM_PIPELINE_ID),
    status_id: Number(env.AMOCRM_STATUS_ID),
    _embedded: {
      tags: tags.map(t => ({ name: t })),
      contacts: [{
        name,
        custom_fields_values: [
          // TODO Sardor: replace with the real phone field_id for this amoCRM account
          // { field_id: PHONE_FIELD_ID, values: [{ value: phone }] }
        ],
      }],
    },
    custom_fields_values: [
      // TODO Sardor: map region / age / UTM / gclid / yclid / fbclid to real field_ids
    ],
  }];

  try {
    const amoRes = await fetch(`https://${env.AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/complex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.AMOCRM_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(leadPayload),
    });

    if (!amoRes.ok) {
      const errText = await amoRes.text();
      console.error('amoCRM error', amoRes.status, errText);
      return new Response(JSON.stringify({ error: 'crm_failed' }), { status: 502 });
    }

    if (env.META_PIXEL_ID && env.META_ACCESS_TOKEN) {
      const capiPayload = {
        data: [{
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'website',
          event_source_url: page_url,
          user_data: { ph: [await sha256(phone.replace(/\D/g, ''))] },
        }],
      };
      try {
        await fetch(`https://graph.facebook.com/v19.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capiPayload),
        });
      } catch (capiErr) {
        console.error('Meta CAPI error', capiErr);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });

  } catch (err) {
    console.error('Lead function error', err);
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500 });
  }
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
