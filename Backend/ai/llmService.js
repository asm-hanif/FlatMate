/**
 * Optional LLM layer for Mira.
 *
 * No environment variables are changed by FlatMate. If an OpenAI-compatible
 * API key is already present in the runtime, Mira uses it for natural-language
 * chat. Otherwise the deterministic property assistant remains fully usable.
 */

function getConfig() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
    const baseUrl = (process.env.LLM_API_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';
    return { apiKey, baseUrl, model };
}

async function chat({ messages = [], propertyContext = null }) {
    const { apiKey, baseUrl, model } = getConfig();
    if (!apiKey) return null;

    const system = `You are Mira, the friendly AI assistant inside FlatMate, a Bangladesh property marketplace.\n` +
        `Help users understand property listings, prices, renting/buying, and how to use FlatMate. ` +
        `Never invent a property price as a verified market fact. When asked for valuation, direct the user to the structured AI Price Advisor, which uses the site's trained valuation pipeline. ` +
        `Keep answers concise, useful, warm, and professional. Bangladesh currency is BDT. ` +
        (propertyContext ? `Current property context: ${JSON.stringify(propertyContext)}` : '');

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            temperature: 0.35,
            max_tokens: 450,
            messages: [
                { role: 'system', content: system },
                ...messages.slice(-12).map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: String(m.content || '').slice(0, 3000)
                }))
            ]
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        const err = new Error(`LLM request failed (${response.status})`);
        err.status = response.status;
        err.details = text.slice(0, 300);
        throw err;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? String(content).trim() : null;
}

function isConfigured() {
    return Boolean(getConfig().apiKey);
}

module.exports = { chat, isConfigured };
