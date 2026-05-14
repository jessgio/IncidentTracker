import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { Resend } from 'resend'

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS to fetch data securely in the background
)
const ai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
})
const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET() {
  try {
    // 1. Calculate Timestamps
    const today = new Date()
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000)

    // 2. Fetch Data (This Week vs Last Week)
    const { data: thisWeek } = await supabase
      .from('incidents')
      .select('*, profiles(full_name, email)')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })

    const { data: lastWeek } = await supabase
      .from('incidents')
      .select('id')
      .gte('created_at', fourteenDaysAgo.toISOString())
      .lt('created_at', sevenDaysAgo.toISOString())

    const currentIncidents = thisWeek || []
    const priorCount = lastWeek?.length || 0

    // 3. Calculate Category Percentages
    const categoryCounts: Record<string, number> = {}
    currentIncidents.forEach(inc => {
      categoryCounts[inc.category] = (categoryCounts[inc.category] || 0) + 1
    })
    const categoryStats = Object.entries(categoryCounts).map(([cat, count]) => ({
      category: cat,
      count,
      percentage: Math.round((count / currentIncidents.length) * 100) || 0
    }))

    // 4. Generate AI Analysis (Bilingual)
    const promptData = {
      thisWeekTotal: currentIncidents.length,
      lastWeekTotal: priorCount,
      categories: categoryStats,
      marketplaces: currentIncidents.map(i => i.marketplace),
    }

    const aiRes = await ai.chat.completions.create({
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert operations analyst. Analyze the weekly customer service incident data. 
          Provide an executive summary addressing: 
          1. Are things improving? 
          2. Which marketplace has the most issues and why? 
          3. Provide 2 actionable insights.
          
          RETURN FORMAT: Must be clean HTML. 
          First, output the English version under a <h3 style="margin-top:0; color:#4338ca;">🇺🇸 English Summary</h3> tag.
          Then, add a divider: <hr style="margin: 20px 0; border: 0; border-top: 1px solid #e2e8f0;">.
          Then, output the EXACT translation in Bahasa Indonesia under a <h3 style="margin-top:0; color:#4338ca;">🇮🇩 Ringkasan Bahasa Indonesia</h3> tag.
          Use <p>, <strong>, and <ul> inside both sections for readability.`
        },
        { role: 'user', content: JSON.stringify(promptData) }
      ]
    })
    const aiAnalysisHTML = aiRes.choices[0]?.message?.content || '<p>No analysis generated.</p>'

    // 5. Construct the Data Table HTML
    const tableRows = currentIncidents.map(inc => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${inc.title}</strong><br><small style="color: #666;">${inc.category} | ${inc.marketplace}</small></td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${inc.profiles?.full_name || inc.profiles?.email || 'Unassigned'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${inc.status}</td>
      </tr>
    `).join('')

    // 6. Build Final Email HTML (Bilingual Headers)
    const htmlEmail = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h1 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Weekly Incident Intelligence Report</h1>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${aiAnalysisHTML}
        </div>

        <h3>Category Breakdown / Rincian Kategori</h3>
        <ul>
          ${categoryStats.map(c => `<li><strong>${c.category}:</strong> ${c.percentage}% (${c.count} incidents)</li>`).join('')}
        </ul>
        <p><em>Trend: ${currentIncidents.length} incidents this week / insiden minggu ini (compared to ${priorCount} last week / dibanding minggu lalu).</em></p>

        <h3 style="margin-top: 30px;">Recent Incident Log / Catatan Insiden Terbaru</h3>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
          <tr style="background-color: #f1f5f9;">
            <th style="padding: 8px;">Incident / Insiden</th>
            <th style="padding: 8px;">PIC</th>
            <th style="padding: 8px;">Status</th>
          </tr>
          ${tableRows || '<tr><td colspan="3" style="padding: 8px; text-align: center;">No incidents this week / Tidak ada insiden minggu ini.</td></tr>'}
        </table>
      </div>
    `

    // 7. Send Email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Incident Tracker <reports@aerisbeaute.com>', // UPDATE ONCE DOMAIN IS VERIFIED
      to: ['jsc.giovanni@gmail.com', 'jessica@aerisbeaute.com', 'suci.rahmadanti@aerisbeaute.com'], 
      subject: `Weekly Incident Report - ${today.toLocaleDateString()}`,
      html: htmlEmail,
    })

    if (emailError) throw new Error(emailError.message)

    return NextResponse.json({ success: true, emailData })
  } catch (error: any) {
    console.error('Report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}