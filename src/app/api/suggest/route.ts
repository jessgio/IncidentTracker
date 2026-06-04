import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '../../../utils/supabase/server'

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
})

export async function POST(req: NextRequest) {
  try {
    // Only authenticated users may spend AI credits
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Extract the variables being sent from the dashboard
    const { title, category, marketplace } = await req.json()

    if (!title) {
      return NextResponse.json({ error: 'No title provided' }, { status: 400 })
    }

    // 2. Ask the AI to write a draft response for the customer
    const completion = await client.chat.completions.create({
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert, empathetic customer service representative for an e-commerce business. 
          When given a customer complaint, write a short, professional draft response that the agent can copy and send directly to the customer. 
          Keep it to 2 to 3 sentences maximum. 
          Be polite, apologetic, and solution-oriented. 
          Use placeholders like [Customer Name] if needed.
          Example: "Dear [Customer Name], I am so sorry to hear that your item arrived damaged. We will immediately ship out a replacement to you at no extra cost, which you should receive in 2-3 days."`,
        },
        {
          role: 'user',
          content: `Incident: ${title}
Category: ${category}
Marketplace: ${marketplace}

Write a short draft response to the customer.`,
        },
      ],
      max_tokens: 150,
      temperature: 0.5,
    })

    const suggestion = completion.choices[0]?.message?.content?.trim() || ''
    
    // 3. Send it back to the dashboard
    return NextResponse.json({ suggestion })
  } catch (error) {
    console.error('OpenRouter error:', error)
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  }
}