import OpenAI from 'openai'

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined
}

export const openai =
  globalForOpenAI.openai ??
  new OpenAI({
    apiKey: process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY,
    baseURL: process.env.GROQ_API_KEY 
      ? 'https://api.groq.com/openai/v1' 
      : 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
      'X-Title': 'FeedbackOS',
    },
    maxRetries: 3,
    timeout: 30000,
  })

if (process.env.NODE_ENV !== 'production') globalForOpenAI.openai = openai
