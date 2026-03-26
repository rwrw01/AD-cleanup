const https = require('https');

/**
 * Call an LLM API to classify job titles into personas.
 * @param {object} options
 * @param {string} options.provider - 'anthropic' or 'openai'
 * @param {string} options.apiKey - API key
 * @param {string[]} options.titles - Job titles to classify
 * @param {string[]} options.personas - Available persona names
 * @returns {Promise<Array<{title: string, persona: string, confidence: number}>>}
 */
function classifyTitles({ provider, apiKey, titles, personas }) {
  const prompt = `Je bent een AD-beheer expert voor een Nederlandse zorgorganisatie.

Gegeven deze persona-definities:
${personas.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Classificeer elke functietitel in de best passende persona.
Geef je antwoord als een JSON array van objecten met: {"title": "...", "persona": "...", "confidence": 0.0-1.0}

Functietitels om te classificeren:
${titles.map(t => `- ${t}`).join('\n')}

Antwoord ALLEEN met de JSON array, geen andere tekst.`;

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, prompt);
  } else if (provider === 'openai') {
    return callOpenAI(apiKey, prompt);
  }
  return Promise.reject(new Error('Onbekende provider: ' + provider));
}

function callAnthropic(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const data = JSON.parse(raw);
          if (data.error) {
            reject(new Error(data.error.message || 'Anthropic API fout'));
            return;
          }
          const text = data.content?.[0]?.text || '';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) {
            reject(new Error('Geen geldige JSON in API-antwoord'));
            return;
          }
          resolve(JSON.parse(jsonMatch[0]));
        } catch (err) {
          reject(new Error('Fout bij verwerken API-antwoord: ' + err.message));
        }
      });
    });

    req.on('error', (err) => reject(new Error('Verbindingsfout: ' + err.message)));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout na 60 seconden')); });
    req.write(body);
    req.end();
  });
}

function callOpenAI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const data = JSON.parse(raw);
          if (data.error) {
            reject(new Error(data.error.message || 'OpenAI API fout'));
            return;
          }
          const text = data.choices?.[0]?.message?.content || '';
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) {
            reject(new Error('Geen geldige JSON in API-antwoord'));
            return;
          }
          resolve(JSON.parse(jsonMatch[0]));
        } catch (err) {
          reject(new Error('Fout bij verwerken API-antwoord: ' + err.message));
        }
      });
    });

    req.on('error', (err) => reject(new Error('Verbindingsfout: ' + err.message)));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout na 60 seconden')); });
    req.write(body);
    req.end();
  });
}

module.exports = { classifyTitles };
