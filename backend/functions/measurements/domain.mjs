const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const ITEM_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

export const isValidDate = (date) => DATE_PATTERN.test(date ?? '')

export const validateMeasurement = (body, expectedDate = null) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'JSONオブジェクトが必要です'
  const examinationDate = expectedDate ?? body.examinationDate
  if (!isValidDate(examinationDate)) return 'examinationDateはYYYY-MM形式で指定してください'
  if (expectedDate && body.examinationDate && body.examinationDate !== expectedDate) return 'URLと本文の年月が一致しません'
  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) return 'valuesが必要です'
  const entries = Object.entries(body.values)
  if (!entries.length) return '測定値を1項目以上指定してください'
  for (const [itemCode, value] of entries) {
    if (!ITEM_CODE_PATTERN.test(itemCode)) return `不正な項目コードです: ${itemCode}`
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${itemCode}の測定値は有限数で指定してください`
  }
  if (body.referenceRanges !== undefined && (typeof body.referenceRanges !== 'object' || Array.isArray(body.referenceRanges))) {
    return 'referenceRangesはオブジェクトで指定してください'
  }
  return null
}

export const aggregateMeasurements = (items) => {
  const byDate = new Map()
  for (const item of items) {
    if (!byDate.has(item.examinationDate)) {
      byDate.set(item.examinationDate, { examinationDate: item.examinationDate, values: {}, source: item.source ?? '' })
    }
    byDate.get(item.examinationDate).values[item.itemCode] = item.value
  }
  return [...byDate.values()].sort((a, b) => a.examinationDate.localeCompare(b.examinationDate))
}

export const latestReferenceRanges = (items) => {
  const ranges = {}
  const sorted = [...items].sort((a, b) => b.examinationDate.localeCompare(a.examinationDate))
  for (const item of sorted) {
    if (ranges[item.itemCode]) continue
    const hasLower = Object.hasOwn(item, 'lowerLimit')
    const hasUpper = Object.hasOwn(item, 'upperLimit')
    if (hasLower || hasUpper) {
      ranges[item.itemCode] = {
        lower: hasLower ? item.lowerLimit : null,
        upper: hasUpper ? item.upperLimit : null,
      }
    }
  }
  return ranges
}
