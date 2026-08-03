import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = path.join(projectRoot, 'private-data', 'originals', 'my_data_sheet.csv')
const outputPath = path.join(projectRoot, 'private-data', 'imports', 'measurements.json')

const parseCsv = (text) => {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (character === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }
  return rows
}

const columnMap = {
  '身長': 'height',
  '体重': 'weight',
  '腹囲': 'waist',
  '血圧_最高': 'systolic',
  '血圧_最低': 'diastolic',
  '白血球数': 'white_blood_cells',
  '赤血球数(RBC)': 'red_blood_cells',
  '血色素量(Hb)': 'hemoglobin',
  'ヘマトクリット(Ht)': 'hematocrit',
  'AST(GOT)': 'ast',
  'ALT(GPT)': 'alt',
  'γ-GTP': 'gamma_gtp',
  'ChE': 'che',
  'ALP(IFCC)': 'alp_ifcc',
  'ALP': 'alp_legacy',
  'Tch': 'total_cholesterol',
  'HDL-C': 'hdl',
  'LDL-C': 'ldl',
  'TG': 'triglyceride',
  'BUN': 'bun',
  'CREA': 'creatinine',
  'UA': 'uric_acid',
  '血糖': 'fasting_glucose',
  '高感度PSA': 'psa',
  'ペプシノゲンⅠ': 'pepsinogen_1',
  'ペプシノゲンⅡ': 'pepsinogen_2',
}

const sourceText = await readFile(inputPath, 'utf8')
const rows = parseCsv(sourceText.replace(/^\uFEFF/, ''))
const headers = rows[0]
const upperRow = rows.find((row) => row[0] === 'limit_upper')
const lowerRow = rows.find((row) => row[0] === 'limit_lower')
const indexOf = (name) => headers.indexOf(name)
const numberAt = (row, name) => {
  const raw = row[indexOf(name)]?.trim()
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

const referenceRanges = Object.entries(columnMap).reduce((result, [sourceName, itemCode]) => {
  const lower = numberAt(lowerRow, sourceName)
  const upper = numberAt(upperRow, sourceName)
  if (lower !== null || upper !== null) result[itemCode] = { lower, upper }
  return result
}, {})

const measurements = rows
  .filter((row) => /^\d{4}-\d{2}$/.test(row[0]))
  .map((row) => {
    const values = {}
    for (const [sourceName, itemCode] of Object.entries(columnMap)) {
      const value = numberAt(row, sourceName)
      if (value !== null) values[itemCode] = value
    }

    const hba1c = numberAt(row, 'HbA1C_NGSP') ?? numberAt(row, 'HbA1C')
    if (hba1c !== null) values.hba1c = hba1c

    const height = numberAt(row, '身長')
    const weight = numberAt(row, '体重')
    if (height !== null && weight !== null && height > 0) {
      values.bmi = Number((weight / ((height / 100) ** 2)).toFixed(1))
    }

    const pepsinogen1 = numberAt(row, 'ペプシノゲンⅠ')
    const pepsinogen2 = numberAt(row, 'ペプシノゲンⅡ')
    if (pepsinogen1 !== null && pepsinogen2 !== null && pepsinogen2 !== 0) {
      values.pepsinogen_ratio = Number((pepsinogen1 / pepsinogen2).toFixed(2))
    }

    const note = row[indexOf('備考')]?.trim()
    return {
      examinationDate: row[0],
      values,
      ...(note ? { note } : {}),
      source: `${row[0].slice(0, 4)}年度健康診断`,
    }
  })

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify({ referenceRanges, measurements }, null, 2)}\n`, 'utf8')

const bmiCount = measurements.filter((record) => record.values.bmi !== undefined).length
const ratioCount = measurements.filter((record) => record.values.pepsinogen_ratio !== undefined).length
console.log(`生成完了: ${outputPath}`)
console.log(`健診データ: ${measurements.length}回`)
console.log(`BMI: ${bmiCount}回 / ペプシノゲン比: ${ratioCount}回`)
console.log('ヘリコバクターピロリは取込み対象外です。')
