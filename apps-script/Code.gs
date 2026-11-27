/**
 * River Watch: team AI relay (Google Apps Script web app).
 *
 * Holds the Anthropic API key in Script Properties so it is never in the page or the repo.
 * SET-UP (once):
 *   1. script.google.com > New project (a STANDALONE project, not opened from the Sheet, so Sheet
 *      editors cannot open it and read the key). Paste this file as Code.gs.
 *   2. Project Settings > Script Properties > Add: ANTHROPIC_API_KEY = sk-ant-...
 *   3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the /exec URL
 *      into CONFIG.APPS_SCRIPT_URL in app.js (the URL is not a secret).
 *   4. In the Anthropic Console, put this key in its own workspace with a monthly spend limit
 *      ($5), prepaid credit only and auto-reload off. That limit is the hard cap if the URL is abused.
 * The page does all the Flood Plan arithmetic; this script only forwards the facts + question.
 */
const MODEL = 'claude-haiku-5-5';   // fixed here: callers cannot pick a dearer model
const MAX_TOKENS = 8000;            // fixed here; includes the model's thinking (worst case about $0.004 an answer)
const MAX_BODY_CHARS = 120000;      // about 30k tokens; River Watch sends far less
const MAX_PER_MINUTE = 20;          // simple throttle across all callers

const SHEET_ID = '1__se3fujZ6axbccCweG0kli16UDd-YTVw7mwao1-9Ek'; // River Watch Team Sheet (not a secret)
const SHEET_TAB = 'Towns';

/** GET ?action=sheet  -> live Towns rows read with the owner's access (the Sheet can stay private)
 *  GET ?action=fx     -> today's ECB euro reference rate (ECB sends no CORS header, so the page can't read it)
 *  GET (no action)    -> health check */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'sheet') {
      const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TAB);
      const v = sh.getDataRange().getDisplayValues();
      const head = v.shift().map(function (h) { return String(h).trim(); });
      const rows = v.filter(function (r) { return r.join('').trim() !== ''; }).map(function (r) {
        const o = {}; head.forEach(function (h, i) { if (h) o[h] = String(r[i]).trim(); }); return o;
      });
      return json_({ rows: rows, read_at: new Date().toISOString(), source: 'Google Sheet ' + SHEET_ID + ', tab ' + SHEET_TAB });
    }
    if (action === 'fx') {
      const xml = UrlFetchApp.fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml').getContentText();
      const rate = Number((xml.match(/currency='USD' rate='([\d.]+)'/) || [])[1]);
      const day = (xml.match(/time='(\d{4}-\d{2}-\d{2})'/) || [])[1];
      if (!rate) return json_({ error: { message: 'ECB file had no USD rate' } });
      return json_({ usdPerEur: rate, eurPerUsd: 1 / rate, date: day, source: 'ECB euro reference rate (eurofxref-daily.xml)' });
    }
    return json_({ ok: true, service: 'River Watch team server', model: MODEL,
                   key_configured: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') });
  } catch (err) {
    return json_({ error: { message: 'Team server error: ' + err.message } });
  }
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY_CHARS) return json_({ error: { message: 'Request too large.' } });
    if (!throttle_()) return json_({ error: { message: 'Too many questions in the last minute. Wait a moment and ask again.' } });

    const req = JSON.parse(raw);
    if (!Array.isArray(req.messages) || !req.messages.length) return json_({ error: { message: 'No question received.' } });
    const messages = req.messages.slice(-13).map(function (m) {
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') };
    });
    const system = Array.isArray(req.system) ? req.system.slice(0, 2).map(function (b) {
      return { type: 'text', text: String(b.text || ''), cache_control: { type: 'ephemeral' } };
    }) : [];

    const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
    if (!key) return json_({ error: { message: 'The team server has no API key set up yet.' } });

    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21' },
      payload: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: system, messages: messages,
                                output_config: { effort: 'low' } }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const data = JSON.parse(res.getContentText() || '{}');
    if (code !== 200) {
      // pass the API's own message through (e.g. the spend limit was reached), never the key
      return json_({ error: { message: (data.error && data.error.message) || ('Anthropic API error ' + code) } });
    }
    return json_({ content: data.content, stop_reason: data.stop_reason, usage: data.usage, model: data.model });
  } catch (err) {
    return json_({ error: { message: 'Team server error: ' + err.message } });
  }
}

function throttle_() {
  const cache = CacheService.getScriptCache();
  const k = 'rw-' + Math.floor(Date.now() / 60000);
  const n = Number(cache.get(k) || 0);
  if (n >= MAX_PER_MINUTE) return false;
  cache.put(k, String(n + 1), 120);
  return true;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
