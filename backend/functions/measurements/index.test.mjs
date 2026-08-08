import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateMeasurements, latestReferenceRanges, validateMeasurement } from './domain.mjs'

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

test('selects the latest stored reference range for each item', () => {
  const ranges = latestReferenceRanges([
    { examinationDate: '2024-01', itemCode: 'systolic', lowerLimit: null, upperLimit: 135 },
    { examinationDate: '2026-01', itemCode: 'systolic', lowerLimit: null, upperLimit: 129 },
    { examinationDate: '2025-01', itemCode: 'height', lowerLimit: null, upperLimit: null },
  ])
  assert.deepEqual(ranges, {
    systolic: { lower: null, upper: 129 },
    height: { lower: null, upper: null },
  })
})
