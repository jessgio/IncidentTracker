import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '../../../../../utils/supabase/server'
import {
  buildCsNotifyEmailHtml,
  csNotifySubject,
  type CsNotifyIncident,
} from '../../../../../lib/cs-notify-email'
import { getCsNotifyTemplate, type CsNotifyTemplateId } from '../../../../../lib/cs-notify-templates'

const resend = new Resend(process.env.RESEND_API_KEY)

const VALID_TEMPLATE_IDS = new Set<CsNotifyTemplateId>([
  'custom',
  'request_completed',
  'shipped',
  'need_cs_help',
])

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: incidentId } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', user.id)
      .single()

    if (senderProfile?.role !== 'warehouse') {
      return NextResponse.json({ error: 'Only warehouse users can notify CS by email.' }, { status: 403 })
    }

    const body = await req.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const templateId =
      typeof body.templateId === 'string' && VALID_TEMPLATE_IDS.has(body.templateId as CsNotifyTemplateId)
        ? (body.templateId as CsNotifyTemplateId)
        : 'custom'
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds.filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : []

    if (!message) {
      return NextResponse.json({ error: 'Please enter a message for the CS team.' }, { status: 400 })
    }
    if (message.length > 8000) {
      return NextResponse.json({ error: 'Message is too long (max 8000 characters).' }, { status: 400 })
    }
    if (recipientIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one CS recipient.' }, { status: 400 })
    }

    const { data: incident, error: incError } = await supabase
      .from('incidents')
      .select(
        'id, title, order_number, complaint_date, category, marketplace, status, customer_address, province, bpb_number, action_taken, delivery_deadline, courier, shipping_label, notes, warehouse_status'
      )
      .eq('id', incidentId)
      .single()

    if (incError || !incident) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    const { data: recipients, error: recipError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', recipientIds)

    if (recipError || !recipients?.length) {
      return NextResponse.json({ error: 'Could not load recipients.' }, { status: 400 })
    }

    const csRecipients = recipients.filter(r => (r.role === 'cs' || r.role === 'manager') && r.email)
    if (csRecipients.length === 0) {
      return NextResponse.json({ error: 'No valid CS recipients selected.' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email is not configured on the server.' }, { status: 503 })
    }

    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      req.nextUrl.origin
    const caseUrl = `${appOrigin}/incidents/${incidentId}`
    const senderName = senderProfile?.full_name || senderProfile?.email || 'Warehouse'
    const from =
      process.env.CS_NOTIFY_FROM ||
      process.env.WAREHOUSE_NOTIFY_FROM ||
      process.env.REPORT_FROM ||
      'Incident Tracker <reports@aerisbeaute.com>'

    const template = getCsNotifyTemplate(templateId)
    const html = buildCsNotifyEmailHtml({
      incident: incident as CsNotifyIncident,
      message,
      senderName,
      caseUrl,
      templateLabel: templateId !== 'custom' ? template.label : undefined,
    })

    const to = csRecipients.map(r => r.email as string)
    const { error: emailError } = await resend.emails.send({
      from,
      to,
      subject: csNotifySubject(incident.order_number || 'N/A', templateId),
      html,
    })

    if (emailError) {
      console.error('CS notify email error:', emailError)
      return NextResponse.json(
        { error: emailError.message || 'Failed to send email.' },
        { status: 502 }
      )
    }

    const names = csRecipients.map(r => r.full_name || r.email).join(', ')
    const templateNote = templateId !== 'custom' ? ` [${template.label}]` : ''
    await supabase.from('comments').insert([{
      incident_id: incidentId,
      user_id: user.id,
      comment_text: `CS notified by email (${names})${templateNote}.\n\nMessage:\n${message}`,
    }])

    return NextResponse.json({
      success: true,
      sentTo: csRecipients.map(r => ({ id: r.id, email: r.email, name: r.full_name })),
    })
  } catch (err) {
    console.error('notify-cs error:', err)
    return NextResponse.json({ error: 'Could not send notification.' }, { status: 500 })
  }
}
