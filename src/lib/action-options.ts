export const ACTION_OPTIONS_TABLE = 'action_options'

export const DEFAULT_ACTION_OPTIONS = [
  'Retur Replace Manual',
  'Retur Replace By Marketplace',
  'Retur Refund Manual',
  'Retur Refund By Marketplace',
  'Voucher Kompensasi',
  'Only Refund',
  'Only Replacement',
  'Kirim Susulan Produk',
  'Dana Dicairkan Ke Penjual',
] as const

export type ActionOption = {
  id: string
  name: string
}

export function actionOptionNames(items: readonly { name: string }[] | null | undefined) {
  const names = (items ?? []).map(item => item.name.trim()).filter(Boolean)
  return names.length > 0 ? names : [...DEFAULT_ACTION_OPTIONS]
}

export function actionSelectOptions(
  items: readonly { name: string }[] | null | undefined,
  current?: string | null
) {
  const list = ['', ...actionOptionNames(items)]
  const value = current ?? ''
  if (value && !list.includes(value)) list.push(value)
  return list
}
