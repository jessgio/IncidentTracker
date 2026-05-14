import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
})

export async function POST(req: NextRequest) {
  try {
    const { title, category, marketplace } = await req.json()

    if (!title) {
      return NextResponse.json({ error: 'No title provided' }, { status: 400 })
    }

    const completion = await client.chat.completions.create({
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert customer service advisor for an e-commerce business. 
          When given a customer complaint, you respond with a single, short, practical action 
          the agent should take to resolve it. 
          Keep it to 1-2 sentences maximum. 
          Be specific and actionable. 
          Do not use bullet points or lists.
          Do not start with "I" or "The agent should".
          Start directly with the action verb.
          Examples: 
          "Contact the customer within 24 hours to apologize and arrange a replacement shipment."
          "Verify the order details in the system and issue a full refund if the wrong item was sent."`,
        },
        {
          role: 'user',
          content: `Incident: ${title}
Category: ${category}
Marketplace: ${marketplace}

What is the best course of action?`,
        },
      ],
      max_tokens: 100,
      temperature: 0.4,
    })

    const suggestion = completion.choices[0]?.message?.content?.trim() || ''
    return NextResponse.json({ suggestion })
  } catch (error) {
    console.error('OpenRouter error:', error)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}