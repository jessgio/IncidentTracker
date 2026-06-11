import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../../utils/supabase/server'
import {
  STATUS_VALUES,
  WAITING_ON_WAREHOUSE,
  statusChangePatch,
} from '../../../../../lib/incident-status'
import { getAppOrigin } from '../../../../../lib/app-origin'
import { isLarkConfigured, sendLarkText } from '../../../../../lib/lark'
import { buildWaitingOnWarehouseLarkText } from '../../../../../lib/lark-messages'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id: incidentId } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const newStatus = typeof body.status === 'string' ? body.status.trim() : ''
    if (!newStatus || !STATUS_VALUES.includes(newStatus)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }

    const { data: incident, error: incError } = await supabase
      .from('incidents')
      .select(
        'id, title, order_number, status, category, marketplace, warehouse_status, resolved_at'
      )
      .eq('id', incidentId)
      .single()

    if (incError || !incident) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    if (incident.status === newStatus) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const patch = statusChangePatch(newStatus, {
      resolved_at: incident.resolved_at,
      warehouse_status: incident.warehouse_status,
    })

    const { error: updateError } = await supabase
      .from('incidents')
      .update(patch)
      .eq('id', incidentId)

    if (updateError) {
      console.error('status update error:', updateError)
      return NextResponse.json({ error: 'Could not update status.' }, { status: 500 })
    }

    let larkError: string | undefined
    if (
      newStatus === WAITING_ON_WAREHOUSE &&
      isLarkConfigured('alerts')
    ) {
      const { data: actor } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      const caseUrl = `${getAppOrigin(req.nextUrl.origin)}/incidents/${incidentId}`
      const text = buildWaitingOnWarehouseLarkText({
        orderNumber: incident.order_number || 'N/A',
        caseTitle: incident.title,
        category: incident.category,
        marketplace: incident.marketplace,
        warehouseStatus: (patch.warehouse_status as string | null) ?? incident.warehouse_status,
        actorName: actor?.full_name || actor?.email || 'A team member',
        caseUrl,
      })
      const larkResult = await sendLarkText(text, { webhookKind: 'alerts' })
      if (!larkResult.ok) {
        console.error('Lark warehouse handoff alert failed:', larkResult.error)
        larkError = larkResult.error
      }
    }

    return NextResponse.json({
      success: true,
      patch,
      larkError,
    })
  } catch (err) {
    console.error('status PATCH error:', err)
    return NextResponse.json({ error: 'Could not update status.' }, { status: 500 })
  }
}
