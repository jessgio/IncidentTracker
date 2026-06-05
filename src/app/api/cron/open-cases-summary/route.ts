import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { Resend } from 'resend'
import {
  buildLatestUpdate,
  buildOpenCasesSummaryEmailHtml,
  openCasesSummarySubject,
  type OpenCaseSummaryItem,
} from '../../../../lib/open-cases-summary-email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const ai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY!,
})
const resend = new Resend(process.env.RESEND_API_KEY)

function daysInStatus(anchor: string | null | undefined) {
  const start = new Date(anchor || Date.now()).getTime()
  return Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24))
}

function jakartaDateLabel() {
  return new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://incident-tracker.vercel.app').replace(/\/$/, '')
    const reportDate = jakartaDateLabel()

    const { data: openIncidents, error: incError } = await supabase
      .from('incidents')
      .select('id, title, order_number, status, warehouse_status, category, marketplace, status_changed_at, created_at, profiles(full_name, email)')
      .not('status', 'in', '("Resolved","Closed")')
      .order('status_changed_at', { ascending: true })

    if (incError) throw new Error(incError.message)

    type IncidentRow = {
      id: string
      title: string
      order_number: string
      status: string
      warehouse_status: string | null
      category: string
      marketplace: string
      status_changed_at: string | null
      created_at: string
      profiles: { full_name: string | null; email: string } | null
    }

    type CommentRow = {
      incident_id: string
      comment_text: string
      created_at: string
      profiles: { full_name: string | null } | null
    }

    const incidents = (openIncidents ?? []) as unknown as IncidentRow[]
    const incidentIds = incidents.map(i => i.id)

    const latestCommentByIncident = new Map<string, CommentRow>()

    if (incidentIds.length > 0) {
      const { data: comments, error: commentError } = await supabase
        .from('comments')
        .select('incident_id, comment_text, created_at, profiles(full_name)')
        .in('incident_id', incidentIds)
        .order('created_at', { ascending: false })

      if (commentError) throw new Error(commentError.message)

      for (const comment of (comments ?? []) as unknown as CommentRow[]) {
        if (!latestCommentByIncident.has(comment.incident_id)) {
          latestCommentByIncident.set(comment.incident_id, comment)
        }
      }
    }

    const cases: OpenCaseSummaryItem[] = incidents.map(inc => ({
      id: inc.id,
      title: inc.title,
      order_number: inc.order_number,
      status: inc.status,
      warehouse_status: inc.warehouse_status ?? null,
      category: inc.category,
      marketplace: inc.marketplace,
      days_in_status: daysInStatus(inc.status_changed_at || inc.created_at),
      pic_name: inc.profiles?.full_name?.trim() || inc.profiles?.email || 'Unassigned',
      latest_update: buildLatestUpdate(latestCommentByIncident.get(inc.id)),
      case_url: `${appUrl}/incidents/${inc.id}`,
    }))

    const promptData = {
      report_date: reportDate,
      total_open: cases.length,
      by_status: cases.reduce<Record<string, number>>((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1
        return acc
      }, {}),
      stalled_over_3_days: cases.filter(c => c.days_in_status >= 3).length,
      waiting_on_warehouse: cases.filter(c => c.status === 'Waiting on Warehouse').length,
      unassigned: cases.filter(c => c.pic_name === 'Unassigned').length,
      cases: cases.map(c => ({
        order: c.order_number,
        title: c.title,
        status: c.status,
        warehouse_status: c.warehouse_status,
        days_in_status: c.days_in_status,
        pic: c.pic_name,
        latest_update: c.latest_update
          ? `${c.latest_update.author}: ${c.latest_update.text.slice(0, 160)}`
          : 'No comments yet',
      })),
    }

    let aiSummaryHtml = '<p>All open cases are listed below. Please review and take action where needed.</p>'

    if (process.env.OPENROUTER_API_KEY) {
      const aiRes = await ai.chat.completions.create({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'system',
            content: `You are an operations analyst for a customer service incident tracker.
Write a concise daily briefing summary in clean HTML for the team.
Rules:
- Use only <p>, <strong>, and <ul>/<li> tags (no headings, no tables).
- Keep it under 180 words.
- If there are zero open cases, congratulate the team briefly.
- If there are open cases: highlight total count, main bottlenecks (warehouse queue, customer replies, marketplace appeals), cases stuck 3+ days, and 2–3 priority actions for today.
- Reference specific order numbers only when calling out urgent items (max 3).
- Professional, direct tone. No emojis.`,
          },
          { role: 'user', content: JSON.stringify(promptData) },
        ],
        temperature: 0.3,
      })
      aiSummaryHtml = aiRes.choices[0]?.message?.content?.trim() || aiSummaryHtml
    }

    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .not('email', 'is', null)

    if (usersError) throw new Error(usersError.message)

    const recipients = (users ?? []).filter(u => u.email?.trim())
    if (recipients.length === 0) {
      return NextResponse.json({ message: 'No users with email addresses found.' })
    }

    const summaryFrom = process.env.SUMMARY_FROM || process.env.REPORT_FROM || 'Incident Tracker <reports@aerisbeaute.com>'
    const subject = openCasesSummarySubject(cases.length, reportDate)

    let sent = 0
    const failures: string[] = []

    for (const user of recipients) {
      const html = buildOpenCasesSummaryEmailHtml({
        recipientName: user.full_name?.trim() || user.email.split('@')[0],
        aiSummaryHtml,
        cases,
        reportDate,
        appUrl,
      })

      try {
        const { error: emailError } = await resend.emails.send({
          from: summaryFrom,
          to: [user.email],
          subject,
          html,
        })
        if (emailError) {
          failures.push(`${user.email}: ${emailError.message}`)
        } else {
          sent++
        }
      } catch (err) {
        failures.push(`${user.email}: ${err instanceof Error ? err.message : 'send failed'}`)
      }
    }

    return NextResponse.json({
      success: true,
      openCases: cases.length,
      recipients: recipients.length,
      sent,
      failures: failures.length > 0 ? failures : undefined,
    })
  } catch (error: unknown) {
    console.error('Open cases summary error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
