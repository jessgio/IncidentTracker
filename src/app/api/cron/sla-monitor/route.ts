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

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Reject anything else.
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const thresholdDate = new Date(Date.now() - SLA_DAYS * 24 * 60 * 60 * 1000)

    // Open cases stuck in their current state for longer than SLA_DAYS (uses
    // status_changed_at when available, otherwise created_at).
    const { data: openIncidents, error } = await supabase
      .from('incidents')
      .select('*, profiles(full_name, email)')
      .not('status', 'in', '("Resolved","Closed")')
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    const stalledIncidents = (openIncidents || []).filter(inc => {
      const anchor = inc.status_changed_at || inc.created_at
      return new Date(anchor) < thresholdDate
    })

    if (stalledIncidents.length === 0) {
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
      days_open: Math.floor((Date.now() - new Date(i.status_changed_at || i.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      assigned_to: i.profiles?.full_name || 'Unassigned'
    }))

    const aiRes = await ai.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'system',
          content: `You are an AI Operations Director. We have ${stalledIncidents.length} customer service incidents that have been stuck in their current workflow state for more than ${SLA_DAYS} days.
          Statuses include: New, Investigating, Waiting on Warehouse, Waiting on Customer, Waiting on Marketplace, Resolved, Closed.
          Look at the provided JSON data of stalled tickets.
          Write an Urgent Executive Alert in HTML format.
          1. Briefly summarize the backlog.
          2. Diagnose the main bottleneck (warehouse queue? customer responses? marketplace appeals? unassigned cases?).
          3. Recommend 2 immediate macro-actions management should take to unblock the team and reduce this caseload.`
        },
        { role: 'user', content: JSON.stringify(promptData) }
      ],
      temperature: 0.4
    })
    
    const analysisHTML = aiRes.choices[0]?.message?.content || '<p>Could not generate analysis.</p>'

    // 4. Send Email to Stakeholders
    const slaFrom = process.env.SLA_FROM || 'AI Operations Agent <reports@aerisbeaute.com>'
    const stakeholderEmails = (process.env.SLA_STAKEHOLDERS || 'jessica@aerisbeaute.com')
      .split(',')
      .map(addr => addr.trim())
      .filter(Boolean)
    await resend.emails.send({
      from: slaFrom,
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
          <strong>Stuck since:</strong> ${new Date(inc.status_changed_at || inc.created_at).toLocaleDateString()}
        </li>
      `).join('')

      // Note: On the Resend Free Tier you can only email verified addresses, so an
      // unverified PIC address will throw — we wrap this in try/catch so one failure
      // doesn't abort the whole run.
      try {
        await resend.emails.send({
          from: slaFrom,
          to: [picData.email], // Nudge the actual responsible agent
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