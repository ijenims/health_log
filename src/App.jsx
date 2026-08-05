import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid, LabelList, Line, LineChart, ReferenceArea,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import itemMaster from './data/item-master.json'
import sampleMeasurementData from './data/measurements.json'
import { clearPrivateDataset, loadPrivateDataset, savePrivateDataset } from './dataStore'
import DataManager from './DataManager'

const LINE_COLORS = ['#08a878', '#f07945', '#3688d8', '#8a6edb', '#e55f91']

const getItemColor = (itemCode) => {
  const item = itemMaster.items.find((entry) => entry.itemCode === itemCode)
  const siblings = itemMaster.items.filter((entry) => entry.category === item.category)
  return LINE_COLORS[siblings.findIndex((entry) => entry.itemCode === itemCode) % LINE_COLORS.length]
}

const formatMonth = (date) => {
  const [year, month] = date.split('-')
  return `${year}年${Number(month)}月`
}

const toTimestamp = (date) => {
  const [year, month] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, 1)
}

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const getNiceScale = (minimum, maximum, targetIntervals = 4) => {
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.2, 1)
  const paddedMinimum = minimum - spread * 0.08
  const paddedMaximum = maximum + spread * 0.08
  const roughStep = (paddedMaximum - paddedMinimum) / targetIntervals
  const exponent = Math.floor(Math.log10(roughStep))
  const magnitude = 10 ** exponent
  const normalized = roughStep / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = niceNormalized * magnitude
  const domainMinimum = Math.floor(paddedMinimum / step) * step
  const domainMaximum = Math.ceil(paddedMaximum / step) * step
  const precision = Math.max(0, -Math.floor(Math.log10(step)))
  const intervalCount = Math.round((domainMaximum - domainMinimum) / step)
  const ticks = Array.from({ length: intervalCount + 1 }, (_, index) =>
    Number((domainMaximum - step * index).toFixed(precision)))
  return { domain: [domainMinimum, domainMaximum], ticks }
}

const getFixedStepScale = (minimum, maximum, step) => {
  const domainMinimum = Math.floor(minimum / step) * step
  const domainMaximum = Math.ceil(maximum / step) * step
  const safeMaximum = domainMaximum === domainMinimum ? domainMaximum + step : domainMaximum
  const intervalCount = Math.round((safeMaximum - domainMinimum) / step)
  const ticks = Array.from({ length: intervalCount + 1 }, (_, index) => safeMaximum - step * index)
  return { domain: [domainMinimum, safeMaximum], ticks }
}

const getRangeStatus = (value, range) => {
  if (!range || !Number.isFinite(value)) return null
  if (range.lower !== null && value < range.lower) return '低値'
  if (range.upper !== null && value > range.upper) return '高値'
  return '基準内'
}

const formatRange = (range) => {
  if (!range) return '基準範囲なし'
  if (range.lower === null) return `${range.upper}以下`
  if (range.upper === null) return `${range.lower}以上`
  return `${range.lower}〜${range.upper}`
}

function PointLabel({ x, y, value, fill }) {
  if (!Number.isFinite(value) || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return <text x={x} y={y - 11} textAnchor="middle" className="point-label" style={{ fill }}>{value}</text>
}

function MeasurementDot({ cx, cy, value, range, color }) {
  if (!Number.isFinite(value) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null
  const status = getRangeStatus(value, range)
  const outside = status && status !== '基準内'
  const stroke = outside ? '#d44f45' : color
  return <circle cx={cx} cy={cy} r={4} fill={outside ? '#d44f45' : '#fff'} stroke={stroke} strokeWidth={3} />
}

function ChartTooltip({ active, payload, items }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tooltip">
      <span>{formatMonth(payload[0].payload.date)}</span>
      {payload.map((entry) => {
        const item = items.find((candidate) => candidate.itemCode === entry.dataKey)
        return <strong key={entry.dataKey} style={{ color: entry.color }}>
          {item.displayName}：{entry.value} {item.unit}
        </strong>
      })}
    </div>
  )
}

function HealthChart({ items, measurements, period }) {
  const scrollRef = useRef(null)
  const allChartData = useMemo(() => measurements.map((record) => ({
    date: record.examinationDate,
    timestamp: toTimestamp(record.examinationDate),
    month: formatMonth(record.examinationDate),
    ...items.reduce((values, item) => {
      if (record.values[item.itemCode] !== undefined) values[item.itemCode] = record.values[item.itemCode]
      return values
    }, {}),
  })), [items, measurements])

  const chartData = useMemo(() => {
    if (period === 'all' || !allChartData.length) return allChartData
    const latestDate = new Date(`${allChartData.at(-1).date}-01T00:00:00`)
    const cutoff = new Date(latestDate)
    cutoff.setFullYear(cutoff.getFullYear() - Number(period))
    return allChartData.filter((record) => new Date(`${record.date}-01T00:00:00`) >= cutoff)
  }, [allChartData, period])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [chartData])

  const plottedValues = chartData.flatMap((record) => items
    .map((item) => record[item.itemCode]).filter(Number.isFinite))
  const rangeValues = items.flatMap((item) => item.referenceRange
    ? [item.referenceRange.lower, item.referenceRange.upper].filter(Number.isFinite) : [])
  const scaleValues = [...plottedValues, ...rangeValues]
  const isBloodPressure = items.some((item) => item.itemCode === 'systolic')
  const isHeight = items.length === 1 && items[0].itemCode === 'height'
  const scaleMinimum = scaleValues.length ? Math.min(...scaleValues) : 0
  const scaleMaximum = scaleValues.length ? Math.max(...scaleValues) : 1
  const niceScale = isHeight
    ? getFixedStepScale(170, 180, 2)
    : isBloodPressure
      ? getFixedStepScale(scaleMinimum, scaleMaximum, 20)
      : getNiceScale(scaleMinimum, scaleMaximum)
  const yDomain = niceScale.domain
  const yTicks = niceScale.ticks
  const chartMinWidth = Math.max(320, chartData.length * 52)
  const showPointLabels = chartData.length <= 12
  const xAxisTickCount = Math.min(8, Math.max(2, chartData.length))
  const title = items.map((item) => item.displayName).join('・')

  return (
    <article className={isBloodPressure ? 'health-chart-card blood-pressure-chart' : 'health-chart-card'}>
      <div className="latest-grid">
        {items.map((item) => {
          const latestRecord = chartData.filter((record) => Number.isFinite(record[item.itemCode])).at(-1)
          return (
            <div className="latest-item" key={item.itemCode} style={{ '--series-color': getItemColor(item.itemCode) }}>
              <span>{item.displayName}</span>
              <strong>{latestRecord?.[item.itemCode] ?? '—'}<small>{item.unit}</small></strong>
            </div>
          )
        })}
      </div>
      <div className="chart-area">
        <div className="fixed-y-axis" aria-hidden="true">
          <div className="fixed-y-axis-scale">
            {yTicks.map((tick, index) => <span key={`${tick}-${index}`}
              style={{ top: `${(index / Math.max(1, yTicks.length - 1)) * 100}%` }}>{tick}</span>)}
          </div>
        </div>
        <div className="chart-scroll" ref={scrollRef}>
          <div className="chart-wrap" style={{ width: `max(100%, ${chartMinWidth}px)` }}
            role="img" aria-label={`${title}の時系列グラフ`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 35, right: 25, left: 58, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke="#e7ebe9" strokeDasharray="3 5" />
                <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  tickCount={xAxisTickCount} tickFormatter={formatTimestamp}
                  tick={{ fill: '#69736e', fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                <YAxis hide domain={yDomain} ticks={yTicks} />
                <Tooltip content={<ChartTooltip items={items} />} cursor={{ stroke: '#7bd7b7', strokeDasharray: '4 4' }} />
                {items.flatMap((item) => {
                  if (!item.referenceRange) return []
                  const color = getItemColor(item.itemCode)
                  const areas = []
                  if (item.referenceRange.lower !== null) areas.push(
                    <ReferenceArea key={`low-${item.itemCode}`} y1={yDomain[0]} y2={item.referenceRange.lower}
                      fill={color} fillOpacity={0.08} strokeOpacity={0} />)
                  if (item.referenceRange.upper !== null) areas.push(
                    <ReferenceArea key={`high-${item.itemCode}`} y1={item.referenceRange.upper} y2={yDomain[1]}
                      fill={color} fillOpacity={0.08} strokeOpacity={0} />)
                  return areas
                })}
                {items.map((item) => {
                  const color = getItemColor(item.itemCode)
                  return <Line key={item.itemCode} type="linear" dataKey={item.itemCode} name={item.displayName}
                    stroke={color} strokeWidth={3} connectNulls
                    dot={<MeasurementDot range={item.referenceRange} color={color} />} activeDot={{ r: 7 }}>
                    {showPointLabels && <LabelList dataKey={item.itemCode} content={<PointLabel fill={color} />} />}
                  </Line>
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="range-legend">
        {items.map((item) => <span key={item.itemCode}><i style={{ background: getItemColor(item.itemCode) }} />
          {item.displayName}：{formatRange(item.referenceRange)} {item.unit}</span>)}
      </div>
    </article>
  )
}

export default function App() {
  const [healthData, setHealthData] = useState(sampleMeasurementData)
  const [dataSource, setDataSource] = useState('sample')
  const [dataMessage, setDataMessage] = useState('')
  const [categoryId, setCategoryId] = useState('body')
  const [period, setPeriod] = useState('10')
  const [managerOpen, setManagerOpen] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const items = useMemo(() => itemMaster.items.map((item) => ({
    ...item,
    referenceRange: healthData.referenceRanges?.[item.itemCode] ?? item.referenceRange,
  })), [healthData])
  const availableCodes = useMemo(() => new Set(healthData.measurements
    .flatMap((record) => Object.keys(record.values))), [healthData])
  const categories = itemMaster.categories.filter((entry) => items
    .some((item) => item.category === entry.id && availableCodes.has(item.itemCode)))
  const category = categories.find((entry) => entry.id === categoryId) ?? categories[0]
  const categoryItems = items.filter((item) => item.category === category.id && availableCodes.has(item.itemCode))
  const graphGroups = (() => {
    if (category.id === 'blood_pressure') return [categoryItems]
    if (category.id === 'gastric_screening') {
      const pepsinogenValues = categoryItems.filter((item) => ['pepsinogen_1', 'pepsinogen_2'].includes(item.itemCode))
      const otherItems = categoryItems.filter((item) => !['pepsinogen_1', 'pepsinogen_2'].includes(item.itemCode))
      return [...(pepsinogenValues.length ? [pepsinogenValues] : []), ...otherItems.map((item) => [item])]
    }
    return categoryItems.map((item) => [item])
  })()

  useEffect(() => {
    loadPrivateDataset().then((dataset) => {
      if (dataset?.measurements?.length) {
        setHealthData(dataset)
        setDataSource('private')
      }
    }).catch(() => setDataMessage('保存済みデータを読み込めませんでした'))
  }, [])

  useEffect(() => {
    if (!categories.some((entry) => entry.id === categoryId)) setCategoryId(categories[0]?.id ?? 'body')
  }, [categories, categoryId])

  const importDataset = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataset = JSON.parse(await file.text())
      if (!Array.isArray(dataset.measurements) || !dataset.measurements.length) throw new Error('measurementsがありません')
      const valid = dataset.measurements.every((record) => /^\d{4}-\d{2}$/.test(record.examinationDate)
        && record.values && typeof record.values === 'object')
      if (!valid) throw new Error('データ形式が正しくありません')
      dataset.measurements.sort((a, b) => a.examinationDate.localeCompare(b.examinationDate))
      const currentDates = new Set(healthData.measurements.map((record) => record.examinationDate))
      setImportPreview({
        dataset,
        fileName: file.name,
        duplicateCount: dataset.measurements.filter((record) => currentDates.has(record.examinationDate)).length,
      })
    } catch (error) {
      setDataMessage(`読込み失敗：${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  const confirmImport = async () => {
    const dataset = importPreview.dataset
    await savePrivateDataset(dataset)
    setHealthData(dataset)
    setDataSource('private')
    setCategoryId('body')
    setDataMessage(`${dataset.measurements.length}回分を読み込みました`)
    setImportPreview(null)
  }

  const useSampleData = async () => {
    await clearPrivateDataset()
    setHealthData(sampleMeasurementData)
    setDataSource('sample')
    setCategoryId('body')
    setDataMessage('サンプルデータへ戻しました')
  }

  const saveManagedDataset = async (dataset) => {
    await savePrivateDataset(dataset)
    setHealthData(dataset)
    setDataSource('private')
    setDataMessage(`${dataset.measurements.length}回分をブラウザ内に保存しています`)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div className="brand-copy"><h1>Health Log</h1><p>からだの変化を、ひと目で。</p></div>
          <div className="data-controls">
            <span className={dataSource === 'private' ? 'data-badge private' : 'data-badge'}>
              {dataSource === 'private' ? '実データ' : 'サンプル'}</span>
            <label className="import-button">データを読み込む
              <input type="file" accept="application/json,.json" onChange={importDataset} />
            </label>
            {dataSource === 'private' && <button type="button" className="sample-button" onClick={useSampleData}>サンプルに戻す</button>}
            <button type="button" className="manage-button" onClick={() => setManagerOpen(true)}>データ管理</button>
          </div>
        </div>
        {dataMessage && <p className="data-message" role="status">{dataMessage}</p>}
      </header>

      <main>
        <section className="category-section" aria-labelledby="category-heading">
          <div className="section-heading">
            <span className="step-number">1</span>
            <div><h2 id="category-heading">分類を選ぶ</h2><p>確認したい検査の分類を選択してください</p></div>
          </div>
          <div className="category-list">
            {categories.map((entry) => <button type="button" key={entry.id}
              className={entry.id === category.id ? 'category-button active' : 'category-button'}
              onClick={() => setCategoryId(entry.id)} aria-pressed={entry.id === category.id}>{entry.name}</button>)}
          </div>
        </section>

        <section className="charts-section" aria-labelledby="charts-heading">
          <div className="charts-toolbar">
            <div><span className="eyebrow">{category.name}</span><h2 id="charts-heading">検査結果</h2></div>
            <div className="period-bar" aria-label="表示期間">
              <span>表示期間</span>
              <div>{[['5', '5年'], ['10', '10年'], ['all', '全期間']].map(([value, label]) =>
                <button type="button" key={value} className={period === value ? 'active' : ''}
                  onClick={() => setPeriod(value)} aria-pressed={period === value}>{label}</button>)}</div>
            </div>
          </div>
          <div className="charts-list">
            {graphGroups.map((group) => <HealthChart key={group.map((item) => item.itemCode).join('-')}
              items={group} measurements={healthData.measurements} period={period} />)}
          </div>
          <p className="reference-note">基準範囲は最新の健診情報を全期間に適用しています。</p>
        </section>
      </main>
      <footer>{dataSource === 'private' ? '実データをこのブラウザ内に保存しています' : 'サンプルデータを表示しています'}</footer>
      {managerOpen && <DataManager categories={itemMaster.categories} items={items} dataset={healthData}
        onSave={saveManagedDataset} onClose={() => setManagerOpen(false)} />}
      {importPreview && <div className="import-preview-backdrop">
        <section className="import-preview" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
          <span>取込み前確認</span>
          <h2 id="import-preview-title">データを置き換えますか？</h2>
          <p>現在のブラウザ内データを、選択したファイルの内容で全件置換します。</p>
          <dl>
            <div><dt>ファイル</dt><dd>{importPreview.fileName}</dd></div>
            <div><dt>取込み件数</dt><dd>{importPreview.dataset.measurements.length}回</dd></div>
            <div><dt>期間</dt><dd>{importPreview.dataset.measurements[0].examinationDate}〜{importPreview.dataset.measurements.at(-1).examinationDate}</dd></div>
            <div><dt>現在と同じ年月</dt><dd>{importPreview.duplicateCount}回</dd></div>
          </dl>
          <p className="import-warning">必要に応じて、先にデータ管理からバックアップを書き出してください。</p>
          <div><button type="button" onClick={() => setImportPreview(null)}>キャンセル</button>
            <button type="button" className="confirm" onClick={confirmImport}>全データを置換</button></div>
        </section>
      </div>}
    </div>
  )
}
