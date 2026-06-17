import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '../../../../../utils/supabase/server'
import {
  buildWarehouseNotifyEmailHtml,
  warehouseNotifySubject,
  type WarehouseNotifyIncident,
} from '../../../../../lib/warehouse-notify-email'
import { appendNotifyShippingDetails } from '../../../../../lib/notify-shipping-details'

const resend = new Resend(process.env.RESEND_API_KEY)

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

    const role = senderProfile?.role
    if (role !== 'cs' && role !== 'manager') {
      return NextResponse.json({ error: 'Only CS and manager roles can notify warehouse.' }, { status: 403 })
    }

    const body = await req.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const recipientIds = Array.isArray(body.recipientIds)
      ? body.recipientIds.filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : []

    if (!message) {
      return NextResponse.json({ error: 'Please enter a message for the warehouse team.' }, { status: 400 })
    }
    if (message.length > 8000) {
      return NextResponse.json({ error: 'Message is too long (max 8000 characters).' }, { status: 400 })
    }
    if (recipientIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one warehouse recipient.' }, { status: 400 })
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

    const warehouseRecipients = recipients.filter(r => r.role === 'warehouse' && r.email)
    if (warehouseRecipients.length === 0) {
      return NextResponse.json({ error: 'No valid warehouse recipients selected.' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email is not configured on the server.' }, { status: 503 })
    }

    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      req.nextUrl.origin
    const caseUrl = `${appOrigin}/incidents/${incidentId}`
    const senderName = senderProfile?.full_name || senderProfile?.email || 'CS Team'
    const from =
      process.env.WAREHOUSE_NOTIFY_FROM ||
      process.env.REPORT_FROM ||
      'Aeris CS Dashboard <reports@aerisbeaute.com>'

    const emailMessage = appendNotifyShippingDetails(message, incident)
    const html = buildWarehouseNotifyEmailHtml({
      incident: incident as WarehouseNotifyIncident,
      message: emailMessage,
      senderName,
      caseUrl,
    })

    const to = warehouseRecipients.map(r => r.email as string)
    const { error: emailError } = await resend.emails.send({
      from,
      to,
      subject: warehouseNotifySubject(incident.order_number || 'N/A'),
      html,
    })

    if (emailError) {
      console.error('Warehouse notify email error:', emailError)
      return NextResponse.json(
        { error: emailError.message || 'Failed to send email.' },
        { status: 502 }
      )
    }

    const names = warehouseRecipients.map(r => r.full_name || r.email).join(', ')
    await supabase.from('comments').insert([{
      incident_id: incidentId,
      user_id: user.id,
      comment_text: `Warehouse notified by email (${names}).\n\nMessage:\n${emailMessage}`,
    }])

    return NextResponse.json({
      success: true,
      sentTo: warehouseRecipients.map(r => ({ id: r.id, email: r.email, name: r.full_name })),
    })
  } catch (err) {
    console.error('notify-warehouse error:', err)
    return NextResponse.json({ error: 'Could not send notification.' }, { status: 500 })
  }
}
