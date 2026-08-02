import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import itemMaster from './data/item-master.json'
import measurementData from './data/measurements.json'

const LINE_COLORS = ['#177d5b', '#d06b3c', '#3f6fb0', '#8b5ea8', '#a78724']

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
  const rawMin = Math.min(...plottedValues)
  const rawMax = Math.max(...plottedValues)
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
                const color = active ? LINE_COLORS[selectedCodes.indexOf(item.itemCode) % LINE_COLORS.length] : null
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
              {selectedItems.map((item, index) => {
                const difference = previous ? Number((latest[item.itemCode] - previous[item.itemCode]).toFixed(2)) : null
                return (
                  <div className="latest-item" key={item.itemCode} style={{ '--series-color': LINE_COLORS[index % LINE_COLORS.length] }}>
                    <span>{item.displayName}</span>
                    <strong>{latest[item.itemCode]}<small>{item.unit}</small></strong>
                    {difference !== null && <em>前回比 {difference > 0 ? '+' : ''}{difference}</em>}
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
                  {selectedItems.map((item, index) => {
                    const color = LINE_COLORS[index % LINE_COLORS.length]
                    return (
                      <Line key={item.itemCode} type="linear" dataKey={item.itemCode} name={item.displayName}
                        stroke={color} strokeWidth={3} dot={{ r: 4, fill: '#fff', stroke: color, strokeWidth: 3 }} activeDot={{ r: 7 }}>
                        {showPointLabels && <LabelList dataKey={item.itemCode} content={<PointLabel fill={color} />} />}
                      </Line>
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
                </div>
              </div>
            </div>
            <p className="chart-note">横に動かして過去の記録を確認できます。点に触れると年月と測定値を表示します。</p>
          </div>
        </section>
      </main>
      <footer>サンプルデータを表示しています</footer>
    </div>
  )
}
