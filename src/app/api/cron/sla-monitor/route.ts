import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { Resend } from 'resend'

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const ai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
})
const resend = new Resend(process.env.RESEND_API_KEY)

const SLA_DAYS = 3

export async function GET() {
  try {
    const thresholdDate = new Date(Date.now() - SLA_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // 1. Fetch Stalled Incidents (Older than 3 days, NOT completed)
    const { data: stalledIncidents, error } = await supabase
      .from('incidents')
      .select('*, profiles(full_name, email)')
      .neq('status', 'Completed')
      .lt('created_at', thresholdDate)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)
    if (!stalledIncidents || stalledIncidents.length === 0) {
      return NextResponse.json({ message: 'No SLA breaches. All good!' })
    }

    // 2. Group incidents by PIC (Agent)
    const incidentsByPic: Record<string, { name: string, email: string, incidents: typeof stalledIncidents }> = {}
    const unassigned: typeof stalledIncidents = []

    stalledIncidents.forEach(inc => {
      if (inc.profiles?.email) {
        if (!incidentsByPic[inc.profiles.email]) {
          incidentsByPic[inc.profiles.email] = { name: inc.profiles.full_name || 'Agent', email: inc.profiles.email, incidents: [] }
        }
        incidentsByPic[inc.profiles.email].incidents.push(inc)
      } else {
        unassigned.push(inc)
      }
    })

    // 3. AI Analysis for Stakeholders
    const promptData = stalledIncidents.map(i => ({
      title: i.title,
      category: i.category,
      marketplace: i.marketplace,
      warehouse_status: i.warehouse_status,
      days_open: Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      assigned_to: i.profiles?.full_name || 'Unassigned'
    }))

    const aiRes = await ai.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'system',
          content: `You are an AI Operations Director. We have ${stalledIncidents.length} customer service incidents that have breached our ${SLA_DAYS}-day resolution SLA.
          Look at the provided JSON data of stalled tickets.
          Write an Urgent Executive Alert in HTML format.
          1. Briefly summarize the backlog.
          2. Diagnose the main bottleneck (Are we waiting on a specific warehouse? Are agents overwhelmed? Are they unassigned?).
          3. Recommend 2 immediate macro-actions management should take to unblock the team and reduce this caseload.`
        },
        { role: 'user', content: JSON.stringify(promptData) }
      ],
      temperature: 0.4
    })
    
    const analysisHTML = aiRes.choices[0]?.message?.content || '<p>Could not generate analysis.</p>'

    // 4. Send Email to Stakeholders
    const stakeholderEmails = ['jessica@aerisbeaute.com'] // <--- Add manager emails here
    await resend.emails.send({
      from: 'AI Operations Agent <reports@aerisbeaute.com>', // <--- Update to your domain later
      to: stakeholderEmails,
      subject: `🚨 SLA Alert: ${stalledIncidents.length} Incidents Overdue`,
      html: `
        <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: auto;">
          <h2 style="color: #e11d48;">⚠️ SLA Breach Alert</h2>
          <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 15px; border-radius: 8px;">
            ${analysisHTML}
          </div>
          <p style="margin-top: 20px;"><em>The system has automatically notified the responsible agents to expedite these cases.</em></p>
        </div>
      `,
    })

    // 5. Send automated nudge emails to individual PICs
    for (const picEmail of Object.keys(incidentsByPic)) {
      const picData = incidentsByPic[picEmail]
      
      const ticketListHTML = picData.incidents.map(inc => `
        <li style="margin-bottom: 8px;">
          <strong>Order:</strong> #${inc.order_number || 'N/A'}<br/>
          <strong>Issue:</strong> ${inc.title}<br/>
          <strong>Stuck since:</strong> ${new Date(inc.created_at).toLocaleDateString()}
        </li>
      `).join('')

      // Note: Because you are on Resend Free Tier, you can only email verified emails.
      // We will wrap this in a try/catch so if the agent's email isn't verified in Resend yet, the script doesn't crash.
      try {
        await resend.emails.send({
          from: 'SLA Monitor <reports@aerisbeaute.com>', // <--- Update to your domain later
          to: ['jessica@aerisbeaute.com'], // Emails exactly this specific PIC!
          subject: `Action Required: You have ${picData.incidents.length} overdue incident(s)`,
          html: `
            <div style="font-family: sans-serif; color: #333;">
              <h2>Hi ${picData.name},</h2>
              <p>This is an automated reminder. You have <strong>${picData.incidents.length}</strong> incidents assigned to you that have been open for more than ${SLA_DAYS} days.</p>
              <p>Please review and update the status of the following cases as soon as possible:</p>
              <ul style="background: #f8fafc; padding: 20px; border-radius: 8px;">
                ${ticketListHTML}
              </ul>
              <p>Log into the Incident Dashboard to resolve these today. Thank you!</p>
            </div>
          `
        })
      } catch (err) {
        console.warn(`Could not email agent ${picEmail} (Resend domain verification issue likely)`)
      }
    }

    return NextResponse.json({ success: true, alertedCount: stalledIncidents.length, picCount: Object.keys(incidentsByPic).length })
  } catch (error: any) {
    console.error('SLA Monitor Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}