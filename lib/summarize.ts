import Anthropic from '@anthropic-ai/sdk'

const PROMPT = (text: string) =>
  `Summarize this WhatsApp customer support conversation in 1-2 sentences. Focus on the customer's issue and current status:\n\n${text}`

async function summarizeWithAnthropic(text: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: PROMPT(text) }],
  })
  return (response.content[0] as { text: string }).text
}

async function summarizeWithOpenAI(text: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 150,
      messages: [{ role: 'user', content: PROMPT(text) }],
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function summarizeConversation(messages: string[]): Promise<string> {
  if (messages.length === 0) return ''
  const text = messages.join('\n')

  const hasAnthropic =
    process.env.ANTHROPIC_API_KEY &&
    process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here'
  const hasOpenAI =
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY !== 'your_openai_api_key_here'

  if (hasAnthropic) return summarizeWithAnthropic(text)
  if (hasOpenAI) return summarizeWithOpenAI(text)

  // No LLM key available — fall back to the first customer message truncated
  return messages[messages.length - 1]?.slice(0, 200) ?? ''
}
