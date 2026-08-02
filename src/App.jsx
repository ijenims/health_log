import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import itemMaster from './data/item-master.json'
import measurementData from './data/measurements.json'

const LINE_COLORS = ['#08a878', '#f07945', '#3688d8', '#8a6edb', '#e55f91']

const getItemColor = (itemCode) => {
  const item = itemMaster.items.find((entry) => entry.itemCode === itemCode)
  const siblings = itemMaster.items.filter((entry) => entry.category === item.category)
  const categoryIndex = siblings.findIndex((entry) => entry.itemCode === itemCode)
  return LINE_COLORS[categoryIndex % LINE_COLORS.length]
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
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`
}

const getDefaultSelection = (items) => {
  const groups = items.reduce((result, item) => {
    const key = item.unit || '単位なし'
    result[key] = [...(result[key] || []), item.itemCode]
    return result
  }, {})
  return Object.values(groups).sort((a, b) => b.length - a.length)[0] || []
}

function PointLabel({ x, y, value, fill }) {
  return (
    <text x={x} y={y - 11} textAnchor="middle" className="point-label" style={{ fill }}>
      {value}
    </text>
  )
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

function MeasurementDot({ cx, cy, value, range, color }) {
  const outside = getRangeStatus(value, range)
  const stroke = outside && outside !== '基準内' ? '#d44f45' : color
  return <circle cx={cx} cy={cy} r={4} fill="#fff" stroke={stroke} strokeWidth={3} />
}

function ChartTooltip({ active, payload, selectedItems }) {
  if (!active || !payload?.length) return null
  return (
    <div className="tooltip">
      <span>{formatMonth(payload[0].payload.date)}</span>
      {payload.map((entry) => {
        const item = selectedItems.find((candidate) => candidate.itemCode === entry.dataKey)
        return (
          <strong key={entry.dataKey} style={{ color: entry.color }}>
            {item.displayName}：{entry.value} {item.unit}
          </strong>
        )
      })}
    </div>
  )
}

export default function App() {
  const categories = itemMaster.categories
  const firstCategoryItems = itemMaster.items.filter((item) => item.category === categories[0].id)
  const [categoryId, setCategoryId] = useState(categories[0].id)
  const [selectedCodes, setSelectedCodes] = useState(getDefaultSelection(firstCategoryItems))
  const [period, setPeriod] = useState('10')
  const chartScrollRef = useRef(null)
  const category = categories.find((entry) => entry.id === categoryId)
  const categoryItems = itemMaster.items.filter((entry) => entry.category === categoryId)
  const selectedItems = selectedCodes.map((code) => itemMaster.items.find((item) => item.itemCode === code))
  const selectedUnit = selectedItems[0]?.unit ?? ''

  const selectCategory = (id) => {
    const nextItems = itemMaster.items.filter((entry) => entry.category === id)
    setCategoryId(id)
    setSelectedCodes(getDefaultSelection(nextItems))
  }

  const toggleItem = (item) => {
    if (selectedCodes.includes(item.itemCode)) {
      if (selectedCodes.length > 1) {
        setSelectedCodes(selectedCodes.filter((code) => code !== item.itemCode))
      }
      return
    }
    if (item.unit === selectedUnit) {
      setSelectedCodes([...selectedCodes, item.itemCode])
    } else {
      setSelectedCodes([item.itemCode])
    }
  }

  const allChartData = useMemo(
    () => measurementData.measurements.map((record) => {
      const values = selectedCodes.reduce((result, code) => {
        if (record.values[code] !== undefined) result[code] = record.values[code]
        return result
      }, {})
      return {
        date: record.examinationDate,
        timestamp: toTimestamp(record.examinationDate),
        month: formatMonth(record.examinationDate),
        source: record.source,
        ...values,
      }
    }),
    [selectedCodes],
  )

  const chartData = useMemo(() => {
    if (period === 'all' || !allChartData.length) return allChartData
    const latestDate = new Date(`${allChartData.at(-1).date}-01T00:00:00`)
    const cutoff = new Date(latestDate)
    cutoff.setFullYear(cutoff.getFullYear() - Number(period))
    return allChartData.filter((record) => new Date(`${record.date}-01T00:00:00`) >= cutoff)
  }, [allChartData, period])

  useEffect(() => {
    const container = chartScrollRef.current
    if (container) container.scrollLeft = container.scrollWidth
  }, [chartData, selectedCodes])

  const latest = chartData.at(-1)
  const previous = chartData.at(-2)
  const chartMinWidth = Math.max(320, chartData.length * 52)
  const showPointLabels = chartData.length <= 12
  const xAxisTickCount = Math.min(8, Math.max(2, chartData.length))
  const plottedValues = chartData.flatMap((record) => selectedCodes
    .map((code) => record[code])
    .filter((value) => Number.isFinite(value)))
  const rangeValues = selectedItems.flatMap((item) => item.referenceRange
    ? [item.referenceRange.lower, item.referenceRange.upper].filter(Number.isFinite)
    : [])
  const scaleValues = [...plottedValues, ...rangeValues]
  const rawMin = Math.min(...scaleValues)
  const rawMax = Math.max(...scaleValues)
  const yPadding = rawMax === rawMin ? Math.max(Math.abs(rawMax) * 0.1, 1) : (rawMax - rawMin) * 0.12
  const yDomain = [rawMin - yPadding, rawMax + yPadding]
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = yDomain[1] - ((yDomain[1] - yDomain[0]) * index / 4)
    return Number(value.toFixed(Math.abs(value) < 10 ? 2 : 1))
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <div><h1>Health Log</h1><p>からだの変化を、ひと目で。</p></div>
        </div>
      </header>

      <main>
        <section className="category-section" aria-labelledby="category-heading">
          <div className="section-heading">
            <span className="step-number">1</span>
            <div><h2 id="category-heading">分類を選ぶ</h2><p>確認したい検査の分類を選択してください</p></div>
          </div>
          <div className="category-list">
            {categories.map((entry) => (
              <button type="button" key={entry.id}
                className={entry.id === categoryId ? 'category-button active' : 'category-button'}
                onClick={() => selectCategory(entry.id)} aria-pressed={entry.id === categoryId}>
                {entry.name}
              </button>
            ))}
          </div>
        </section>

        <section className="result-card" aria-labelledby="item-heading">
          <div className="item-picker">
            <div className="section-heading compact">
              <span className="step-number">2</span>
              <div><h2 id="item-heading">検査項目を選ぶ</h2><p>同じ単位の項目を複数表示できます</p></div>
            </div>
            <div className="item-list" role="group" aria-label={`${category.name}の検査項目`}>
              {categoryItems.map((item) => {
                const active = selectedCodes.includes(item.itemCode)
                const disabled = !active && selectedCodes.length > 0 && item.unit !== selectedUnit
                const color = active ? getItemColor(item.itemCode) : null
                return (
                  <button type="button" key={item.itemCode}
                    className={active ? 'item-button active' : 'item-button'}
                    onClick={() => toggleItem(item)} aria-pressed={active}
                    title={disabled ? `選択中の項目と単位（${selectedUnit || 'なし'}）が異なります` : ''}>
                    <span className="series-dot" style={active ? { background: color } : {}} />
                    <span>{item.displayName}<small>{item.unit || '単位なし'}</small></span>
                    {disabled && <em>単位違い</em>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="chart-panel">
            <div className="chart-summary multi">
              <div>
                <span className="eyebrow">選択中の項目</span>
                <h2>{selectedItems.map((item) => item.displayName).join('・')}</h2>
              </div>
              <span className="unit-badge">単位：{selectedUnit || 'なし'}</span>
            </div>

            <div className="latest-grid">
              {selectedItems.map((item) => {
                const difference = previous ? Number((latest[item.itemCode] - previous[item.itemCode]).toFixed(2)) : null
                const values = chartData.map((record) => record[item.itemCode]).filter(Number.isFinite)
                const minimum = Math.min(...values)
                const maximum = Math.max(...values)
                const status = getRangeStatus(latest[item.itemCode], item.referenceRange)
                return (
                  <div className="latest-item" key={item.itemCode} style={{ '--series-color': getItemColor(item.itemCode) }}>
                    <span>{item.displayName}</span>
                    <strong>{latest[item.itemCode]}<small>{item.unit}</small></strong>
                    {difference !== null && <em>前回比 {difference > 0 ? '+' : ''}{difference}</em>}
                    {status && <b className={status === '基準内' ? 'range-ok' : 'range-alert'}>{status}</b>}
                    <small className="min-max">最小 {minimum} ／ 最大 {maximum}</small>
                  </div>
                )
              })}
            </div>

            <div className="period-bar" aria-label="表示期間">
              <span>表示期間</span>
              <div>
                {[['5', '5年'], ['10', '10年'], ['all', '全期間']].map(([value, label]) => (
                  <button type="button" key={value} className={period === value ? 'active' : ''}
                    onClick={() => setPeriod(value)} aria-pressed={period === value}>{label}</button>
                ))}
              </div>
            </div>

            <div className="chart-area">
              <div className="fixed-y-axis" aria-hidden="true">
                <div className="fixed-y-axis-scale">
                  {yTicks.map((tick, index) => (
                    <span key={`${tick}-${index}`} style={{ top: `${index * 25}%` }}>{tick}</span>
                  ))}
                </div>
              </div>
              <div className="chart-scroll" ref={chartScrollRef}>
                <div className="chart-wrap" style={{ width: `max(100%, ${chartMinWidth}px)` }}
                  role="img" aria-label={`${selectedItems.map((item) => item.displayName).join('、')}の時系列グラフ`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 35, right: 25, left: 58, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e7ebe9" strokeDasharray="3 5" />
                  <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']}
                    tickCount={xAxisTickCount} tickFormatter={formatTimestamp}
                    tick={{ fill: '#69736e', fontSize: 11 }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis hide domain={yDomain} />
                  <Tooltip content={<ChartTooltip selectedItems={selectedItems} />} cursor={{ stroke: '#9cc6b5', strokeDasharray: '4 4' }} />
                  {selectedItems.flatMap((item) => {
                    if (!item.referenceRange) return []
                    const color = getItemColor(item.itemCode)
                    const areas = []
                    if (item.referenceRange.lower !== null) {
                      areas.push(<ReferenceArea key={`low-${item.itemCode}`} y1={yDomain[0]}
                        y2={item.referenceRange.lower} fill={color} fillOpacity={0.08} strokeOpacity={0} />)
                    }
                    if (item.referenceRange.upper !== null) {
                      areas.push(<ReferenceArea key={`high-${item.itemCode}`} y1={item.referenceRange.upper}
                        y2={yDomain[1]} fill={color} fillOpacity={0.08} strokeOpacity={0} />)
                    }
                    return areas
                  })}
                  {selectedItems.map((item) => {
                    const color = getItemColor(item.itemCode)
                    return (
                      <Line key={item.itemCode} type="linear" dataKey={item.itemCode} name={item.displayName}
                        stroke={color} strokeWidth={3}
                        dot={<MeasurementDot range={item.referenceRange} color={color} />} activeDot={{ r: 7 }}>
                        {showPointLabels && <LabelList dataKey={item.itemCode} content={<PointLabel fill={color} />} />}
                      </Line>
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="range-legend">
              {selectedItems.map((item) => (
                <span key={item.itemCode}><i style={{ background: getItemColor(item.itemCode) }} />
                  {item.displayName}：{formatRange(item.referenceRange)} {item.unit}</span>
              ))}
            </div>
            <p className="chart-note">横に動かして過去の記録を確認できます。点に触れると年月と測定値を表示します。</p>
            <p className="reference-note">基準範囲は表示確認用のサンプルです。実際の健診結果に記載された基準値を使用してください。</p>
          </div>
        </section>
      </main>
      <footer>サンプルデータを表示しています</footer>
    </div>
  )
}
