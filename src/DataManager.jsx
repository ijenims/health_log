import { useMemo, useState } from 'react'

const DERIVED_CODES = new Set(['bmi', 'pepsinogen_ratio'])

const downloadFile = (content, mimeType, fileName) => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const fileStamp = () => {
  const now = new Date()
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value) => String(value).padStart(2, '0')).join('')
  const time = [now.getHours(), now.getMinutes()]
    .map((value) => String(value).padStart(2, '0')).join('')
  return `${date}-${time}`
}

const escapeCsv = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const formatRange = (range) => {
  if (!range) return '基準値なし'
  if (range.lower === null) return `上限 ${range.upper}`
  if (range.upper === null) return `下限 ${range.lower}`
  return `${range.lower}〜${range.upper}`
}

export default function DataManager({ categories, items, dataset, onSave, onClose }) {
  const [examinationDate, setExaminationDate] = useState('')
  const [values, setValues] = useState({})
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('add')
  const inputItems = useMemo(() => items.filter((item) => !DERIVED_CODES.has(item.itemCode)), [items])

  const exportJson = () => downloadFile(
    `${JSON.stringify(dataset, null, 2)}\n`,
    'application/json',
    `health-log-backup-${fileStamp()}.json`,
  )

  const exportCsv = () => {
    const header = ['examination_date', 'item_code', 'value', 'unit', 'lower_limit', 'upper_limit', 'source']
    const rows = dataset.measurements.flatMap((record) => Object.entries(record.values).map(([itemCode, value]) => {
      const item = items.find((entry) => entry.itemCode === itemCode)
      const range = dataset.referenceRanges?.[itemCode] ?? item?.referenceRange
      return [record.examinationDate, itemCode, value, item?.unit ?? '', range?.lower ?? '', range?.upper ?? '', record.source ?? '']
    }))
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
    downloadFile(`\uFEFF${csv}\r\n`, 'text/csv;charset=utf-8', `health-log-backup-${fileStamp()}.csv`)
  }

  const updateValue = (itemCode, rawValue) => {
    setValues((current) => ({ ...current, [itemCode]: rawValue }))
  }

  const changeMode = (nextMode) => {
    setMode(nextMode)
    setExaminationDate('')
    setValues({})
    setMessage('')
  }

  const selectExistingDate = (date) => {
    setExaminationDate(date)
    const record = dataset.measurements.find((entry) => entry.examinationDate === date)
    setValues(record ? Object.fromEntries(Object.entries(record.values)
      .filter(([code]) => !DERIVED_CODES.has(code)).map(([code, value]) => [code, String(value)])) : {})
    setMessage('')
  }

  const saveMeasurement = async (event) => {
    event.preventDefault()
    setMessage('')
    if (!/^\d{4}-\d{2}$/.test(examinationDate)) {
      setMessage('健診年月を入力してください')
      return
    }
    if (mode === 'add' && dataset.measurements.some((record) => record.examinationDate === examinationDate)) {
      setMessage('同じ年月のデータが既にあります。修正機能は次段階で追加します。')
      return
    }

    const numericValues = Object.entries(values).reduce((result, [code, rawValue]) => {
      if (rawValue !== '') result[code] = Number(rawValue)
      return result
    }, {})
    if (!Object.keys(numericValues).length) {
      setMessage('測定値を1項目以上入力してください')
      return
    }
    if (Object.values(numericValues).some((value) => !Number.isFinite(value))) {
      setMessage('測定値は数値で入力してください')
      return
    }

    if (numericValues.height > 0 && Number.isFinite(numericValues.weight)) {
      numericValues.bmi = Number((numericValues.weight / ((numericValues.height / 100) ** 2)).toFixed(1))
    }
    if (Number.isFinite(numericValues.pepsinogen_1) && numericValues.pepsinogen_2 > 0) {
      numericValues.pepsinogen_ratio = Number((numericValues.pepsinogen_1 / numericValues.pepsinogen_2).toFixed(2))
    }

    const existingRecord = dataset.measurements.find((record) => record.examinationDate === examinationDate)
    const nextRecord = {
      examinationDate,
      values: numericValues,
      source: mode === 'edit' ? (existingRecord?.source ?? `${examinationDate.slice(0, 4)}年度健康診断`)
        : `${examinationDate.slice(0, 4)}年度健康診断（手入力）`,
    }
    const nextDataset = {
      ...dataset,
      measurements: (mode === 'edit'
        ? dataset.measurements.map((record) => record.examinationDate === examinationDate ? nextRecord : record)
        : [...dataset.measurements, nextRecord]).sort((a, b) => a.examinationDate.localeCompare(b.examinationDate)),
    }

    setSaving(true)
    try {
      await onSave(nextDataset)
      setValues({})
      setExaminationDate('')
      setMessage(`${examinationDate}のデータを${mode === 'edit' ? '更新' : '登録'}しました。バックアップ書出しを推奨します。`)
    } catch {
      setMessage('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const deleteMeasurement = async () => {
    if (!examinationDate) {
      setMessage('削除する健診年月を選択してください')
      return
    }
    if (!window.confirm(`${examinationDate}の健診データを削除します。元に戻せません。よろしいですか？`)) return
    setSaving(true)
    try {
      await onSave({
        ...dataset,
        measurements: dataset.measurements.filter((record) => record.examinationDate !== examinationDate),
      })
      setValues({})
      setExaminationDate('')
      setMessage('健診データを削除しました。バックアップ書出しを推奨します。')
    } catch {
      setMessage('削除に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="manager-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="data-manager" role="dialog" aria-modal="true" aria-labelledby="manager-title">
        <header className="manager-header">
          <div><span>非公開データ</span><h2 id="manager-title">データ管理</h2></div>
          <button type="button" className="manager-close" onClick={onClose} aria-label="閉じる">×</button>
        </header>

        <div className="backup-panel">
          <div><h3>バックアップ</h3><p>現在の全データを端末へ保存します。</p></div>
          <div className="backup-actions">
            <button type="button" onClick={exportJson}>JSON書出し</button>
            <button type="button" onClick={exportCsv}>CSV書出し</button>
          </div>
        </div>

        <form onSubmit={saveMeasurement}>
          <div className="entry-mode" role="tablist" aria-label="入力モード">
            <button type="button" className={mode === 'add' ? 'active' : ''} onClick={() => changeMode('add')}>新規追加</button>
            <button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => changeMode('edit')}>既存データ編集</button>
          </div>
          <div className="entry-heading">
            <div><h3>{mode === 'add' ? '健診結果を追加' : '健診結果を修正・削除'}</h3>
              <p>{mode === 'add' ? '未測定の項目は空欄のままで登録できます。' : '対象年月を選び、値を修正してください。'}</p></div>
            <label>健診年月{mode === 'add'
              ? <input type="month" value={examinationDate} onChange={(event) => setExaminationDate(event.target.value)} required />
              : <select value={examinationDate} onChange={(event) => selectExistingDate(event.target.value)} required>
                <option value="">選択してください</option>
                {[...dataset.measurements].reverse().map((record) => <option key={record.examinationDate}
                  value={record.examinationDate}>{record.examinationDate}</option>)}
              </select>}</label>
          </div>

          <div className="entry-categories">
            {categories.map((category) => {
              const categoryItems = inputItems.filter((item) => item.category === category.id)
              if (!categoryItems.length) return null
              return (
                <details key={category.id} open={category.id === 'body'}>
                  <summary>{category.name}<span>{categoryItems.length}項目</span></summary>
                  <div className="entry-fields">
                    {categoryItems.map((item) => <label key={item.itemCode}>
                      <span>{item.displayName}<small>{formatRange(item.referenceRange)} {item.unit}</small></span>
                      <div><input type="number" inputMode="decimal" step="any" value={values[item.itemCode] ?? ''}
                        onChange={(event) => updateValue(item.itemCode, event.target.value)} />
                        <em>{item.unit}</em></div>
                    </label>)}
                  </div>
                </details>
              )
            })}
          </div>

          {message && <p className={message.includes('しました') ? 'manager-message success' : 'manager-message'}>{message}</p>}
          <div className="manager-footer">
            <p>BMIとペプシノゲン比は元の測定値から自動計算します。</p>
            <div>
              {mode === 'edit' && <button type="button" className="delete-button" disabled={saving || !examinationDate}
                onClick={deleteMeasurement}>削除</button>}
              <button type="submit" disabled={saving || (mode === 'edit' && !examinationDate)}>
                {saving ? '保存中…' : mode === 'edit' ? '変更を保存' : '健診結果を登録'}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
