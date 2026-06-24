import Anthropic from '@anthropic-ai/sdk'

export async function summarizeConversation(messages: string[]): Promise<string> {
  if (messages.length === 0) return ''
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    return messages[messages.length - 1]?.slice(0, 200) ?? ''
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const text = messages.join('\n')
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `Summarize this WhatsApp customer support conversation in 1-2 sentences. Focus on the customer's issue and current status:\n\n${text}`,
    }],
  })
  return (response.content[0] as { text: string }).text
}
