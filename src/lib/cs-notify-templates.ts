export type CsNotifyTemplateId = 'custom' | 'request_completed' | 'shipped' | 'need_cs_help'

import { appendNotifyShippingDetails, type NotifyShippingFields } from './notify-shipping-details'

export type CsNotifyTemplateContext = {
  warehouseStatus?: string | null
  orderNumber: string
} & NotifyShippingFields

export type CsNotifyTemplate = {
  id: CsNotifyTemplateId
  label: string
  buildMessage: (ctx: CsNotifyTemplateContext) => string
}

function withShippingDetails(message: string, ctx: NotifyShippingFields) {
  return appendNotifyShippingDetails(message, ctx)
}

export const CS_NOTIFY_TEMPLATES: CsNotifyTemplate[] = [
  {
    id: 'custom',
    label: 'Write your own message',
    buildMessage: () => '',
  },
  {
    id: 'request_completed',
    label: 'CS request completed',
    buildMessage: (ctx) => {
      const { warehouseStatus, orderNumber } = ctx
      const statusLine = warehouseStatus?.trim()
        ? `Warehouse status: ${warehouseStatus.trim()}\n\n`
        : ''
      return withShippingDetails(
        `Hi CS team,\n\n` +
          `The warehouse request for order #${orderNumber} has been completed.\n\n` +
          statusLine +
          `Please proceed with customer follow-up and update the case in Incident Tracker as needed.\n\n` +
          `Thank you.`,
        ctx
      )
    },
  },
  {
    id: 'shipped',
    label: 'Replacement / shipment sent',
    buildMessage: (ctx) => {
      const { warehouseStatus, orderNumber } = ctx
      const statusLine = warehouseStatus?.trim() ? `Status: ${warehouseStatus.trim()}\n` : ''
      return withShippingDetails(
        `Hi CS team,\n\n` +
          `We have shipped the replacement for order #${orderNumber}.\n` +
          statusLine +
          `\nPlease inform the customer and add tracking details to the case if available.\n\n` +
          `Thank you.`,
        ctx
      )
    },
  },
  {
    id: 'need_cs_help',
    label: 'Need CS assistance',
    buildMessage: (ctx) =>
      withShippingDetails(
        `Hi CS team,\n\n` +
          `We need your help on order #${ctx.orderNumber} before we can complete the warehouse request.\n\n` +
          `Please review the case and reply with instructions.\n\n` +
          `Thank you.`,
        ctx
      ),
  },
]

export function getCsNotifyTemplate(id: CsNotifyTemplateId) {
  return CS_NOTIFY_TEMPLATES.find(t => t.id === id) ?? CS_NOTIFY_TEMPLATES[0]
}
