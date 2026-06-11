import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../../utils/supabase/server'
import { WAITING_ON_WAREHOUSE, statusChangePatch } from '../../../../../lib/incident-status'
import { incidentExtraFields } from '../../../../../lib/incident-extra-fields'
import { getAppOrigin } from '../../../../../lib/app-origin'
import { isLarkConfigured, sendLarkText } from '../../../../../lib/lark'
import { buildWarehouseCompletedLarkText } from '../../../../../lib/lark-messages'

const VALID_WAREHOUSE_STATUSES = new Set<string>(
  incidentExtraFields.find(f => f.key === 'warehouse_status')?.options ?? []
)

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
    const newWarehouseStatus =
      typeof body.warehouseStatus === 'string' ? body.warehouseStatus.trim() : ''
    if (!VALID_WAREHOUSE_STATUSES.has(newWarehouseStatus)) {
      return NextResponse.json({ error: 'Invalid warehouse status.' }, { status: 400 })
    }

    const { data: incident, error: incError } = await supabase
      .from('incidents')
      .select('id, title, order_number, status, warehouse_status, resolved_at')
      .eq('id', incidentId)
      .single()

    if (incError || !incident) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    const prevWarehouseStatus = incident.warehouse_status?.trim() || ''
    if (prevWarehouseStatus === newWarehouseStatus) {
      return NextResponse.json({ success: true, unchanged: true })
    }

    const now = new Date().toISOString()
    const patch: Record<string, string | null> = {
      warehouse_status: newWarehouseStatus || null,
      updated_at: now,
    }

    if (newWarehouseStatus === 'Completed') {
      patch.warehouse_completed_at = now
      if (incident.status === WAITING_ON_WAREHOUSE) {
        Object.assign(
          patch,
          statusChangePatch('Investigating', {
            resolved_at: incident.resolved_at,
            warehouse_status: newWarehouseStatus,
          })
        )
      }
    }

    const { error: updateError } = await supabase
      .from('incidents')
      .update(patch)
      .eq('id', incidentId)

    if (updateError) {
      console.error('warehouse status update error:', updateError)
      return NextResponse.json({ error: 'Could not update warehouse status.' }, { status: 500 })
    }

    if (newWarehouseStatus === 'Completed') {
      await supabase.from('comments').insert([{
        incident_id: incidentId,
        user_id: user.id,
        comment_text:
          'Warehouse marked fulfillment as Completed — case returned to CS for customer follow-up.',
      }])
    }

    let larkError: string | undefined
    if (
      newWarehouseStatus === 'Completed' &&
      prevWarehouseStatus !== 'Completed' &&
      isLarkConfigured('alerts')
    ) {
      const { data: actor } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      const caseUrl = `${getAppOrigin(req.nextUrl.origin)}/incidents/${incidentId}`
      const text = buildWarehouseCompletedLarkText({
        orderNumber: incident.order_number || 'N/A',
        caseTitle: incident.title,
        actorName: actor?.full_name || actor?.email || 'Warehouse team',
        caseUrl,
      })
      const larkResult = await sendLarkText(text, { webhookKind: 'alerts' })
      if (!larkResult.ok) {
        console.error('Lark warehouse completed alert failed:', larkResult.error)
        larkError = larkResult.error
      }
    }

    return NextResponse.json({
      success: true,
      patch,
      larkError,
    })
  } catch (err) {
    console.error('warehouse-status PATCH error:', err)
    return NextResponse.json({ error: 'Could not update warehouse status.' }, { status: 500 })
  }
}
