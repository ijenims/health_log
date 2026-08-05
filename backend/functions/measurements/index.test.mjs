import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateMeasurements, validateMeasurement } from './domain.mjs'

test('validates a measurement payload', () => {
  assert.equal(validateMeasurement({ examinationDate: '2026-07', values: { weight: 65.2 } }), null)
  assert.match(validateMeasurement({ examinationDate: '2026-13', values: { weight: 65.2 } }), /YYYY-MM/)
  assert.match(validateMeasurement({ examinationDate: '2026-07', values: { weight: '65.2' } }), /有限数/)
  assert.match(validateMeasurement({ examinationDate: '2026-07', values: {} }), /1項目以上/)
})

test('aggregates DynamoDB items into examinations', () => {
  const result = aggregateMeasurements([
    { examinationDate: '2026-07', itemCode: 'weight', value: 65.2, source: '健診' },
    { examinationDate: '2025-06', itemCode: 'weight', value: 66.1, source: '健診' },
    { examinationDate: '2026-07', itemCode: 'bmi', value: 22.1, source: '健診' },
  ])
  assert.deepEqual(result, [
    { examinationDate: '2025-06', values: { weight: 66.1 }, source: '健診' },
    { examinationDate: '2026-07', values: { weight: 65.2, bmi: 22.1 }, source: '健診' },
  ])
})
