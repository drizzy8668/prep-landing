// ============================================================
// POST /lead — Cloudflare Pages Function (v2)
// Same pattern as v1, extended to carry goals/region/age from
// the multi-step form into amoCRM tags and custom fields.
//
// SARDOR — Cloudflare env vars (Settings → Variables and secrets):
//   AMOCRM_SUBDOMAIN, AMOCRM_ACCESS_TOKEN, AMOCRM_PIPELINE_ID, AMOCRM_STATUS_NAME
//   (optional) AMOCRM_STATUS_ID — takes priority over AMOCRM_STATUS_NAME if set
//   (optional) META_PIXEL_ID, META_ACCESS_TOKEN
// ============================================================

const GOAL_LABELS = {
  razgovor: 'Bemalol gaplashish',
  karyera: 'Ish/karyera',
  farzand: 'Farzandiga yordam',
  mukammal: "To'liq mukammal o'rganish",
};

// Resolves the pipeline status id by name (cached per warm worker instance),
// same pattern used for kurs.prep.uz's lead function.
let cachedStatusId = null;

async function resolveStatusId(env) {
  if (env.AMOCRM_STATUS_ID) return Number(env.AMOCRM_STATUS_ID);
  if (cachedStatusId) return cachedStatusId;
  if (!env.AMOCRM_STATUS_NAME) {
    console.error('AMOCRM_STATUS_NAME is not set');
    return null;
  }
  if (!env.AMOCRM_PIPELINE_ID) {
    console.error('AMOCRM_PIPELINE_ID is not set');
    return null;
  }

  const url = `https://${env.AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/pipelines/${env.AMOCRM_PIPELINE_ID}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${env.AMOCRM_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`amoCRM pipeline fetch failed: ${res.status} ${url} — ${errText}`);
    return null;
  }
  const data = await res.json();
  const statuses = data?._embedded?.statuses || [];
  const match = statuses.find(s => s.name === env.AMOCRM_STATUS_NAME);
  if (!match) {
    console.error(
      `No status named "${env.AMOCRM_STATUS_NAME}" in pipeline ${env.AMOCRM_PIPELINE_ID}. ` +
      `Available: ${statuses.map(s => `"${s.name}" (id ${s.id})`).join(', ')}`
    );
    return null;
  }
  cachedStatusId = match.id;
  return match.id;
}

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

  const statusId = await resolveStatusId(env);
  if (!statusId) {
    console.error('Could not resolve amoCRM status id — check AMOCRM_STATUS_NAME / AMOCRM_STATUS_ID');
    return new Response(JSON.stringify({ error: 'status_not_resolved' }), { status: 502 });
  }

  const leadPayload = [{
    name: leadName,
    pipeline_id: Number(env.AMOCRM_PIPELINE_ID),
    status_id: statusId,
    _embedded: {
      tags: tags.map(t => ({ name: t })),
      contacts: [{
        name,
        custom_fields_values: [
          // PHONE is a standard amoCRM field present on every account — addressed by
          // field_code, so no account-specific field_id lookup is needed.
          { field_code: 'PHONE', values: [{ value: phone, enum_code: 'MOB' }] },
        ],
      }],
    },
    // region / age / UTM / gclid / yclid / fbclid already travel as tags (see `tags`
    // above) and age is folded into the lead name — no lead-level custom fields needed
    // unless Sardor wants them broken out into separate CRM columns later.
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
