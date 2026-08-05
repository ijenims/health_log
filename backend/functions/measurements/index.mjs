import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { aggregateMeasurements, isValidDate, validateMeasurement } from './domain.mjs'

export { aggregateMeasurements, validateMeasurement } from './domain.mjs'

const tableName = process.env.TABLE_NAME
const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const response = (statusCode, body = null) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: body === null ? '' : JSON.stringify(body),
})

const getUserId = (event) => {
  const subject = event.requestContext?.authorizer?.jwt?.claims?.sub
  if (subject) return subject
  if (process.env.ALLOW_LOCAL_USER === 'true') return process.env.LOCAL_USER_ID || 'local-user'
  return null
}

const parseBody = (event) => {
  try {
    return event.body ? JSON.parse(event.body) : null
  } catch {
    return undefined
  }
}

const batchWrite = async (client, requests) => {
  for (let index = 0; index < requests.length; index += 25) {
    let pending = requests.slice(index, index + 25)
    for (let attempt = 0; pending.length && attempt < 5; attempt += 1) {
      const result = await client.send(new BatchWriteCommand({ RequestItems: { [tableName]: pending } }))
      pending = result.UnprocessedItems?.[tableName] ?? []
    }
    if (pending.length) throw new Error('DynamoDBへの一部書込みを完了できませんでした')
  }
}

const queryUserItems = async (client, userId, prefix = null) => {
  const items = []
  let lastKey
  do {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: prefix ? 'PK = :pk AND begins_with(SK, :prefix)' : 'PK = :pk',
      ExpressionAttributeValues: prefix ? { ':pk': `USER#${userId}`, ':prefix': prefix } : { ':pk': `USER#${userId}` },
      ExclusiveStartKey: lastKey,
    }))
    items.push(...(result.Items ?? []))
    lastKey = result.LastEvaluatedKey
  } while (lastKey)
  return items
}

const replaceDate = async (client, userId, date, body) => {
  const existing = await queryUserItems(client, userId, `DATE#${date}#`)
  const deleteRequests = existing.map((item) => ({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } }))
  if (deleteRequests.length) await batchWrite(client, deleteRequests)

  const now = new Date().toISOString()
  const putRequests = Object.entries(body.values).map(([itemCode, value]) => {
    const range = body.referenceRanges?.[itemCode]
    return {
      PutRequest: {
        Item: {
          PK: `USER#${userId}`,
          SK: `DATE#${date}#ITEM#${itemCode}`,
          examinationDate: date,
          itemCode,
          value,
          ...(range?.lower !== undefined ? { lowerLimit: range.lower } : {}),
          ...(range?.upper !== undefined ? { upperLimit: range.upper } : {}),
          source: body.source ?? '',
          updatedAt: now,
        },
      },
    }
  })
  await batchWrite(client, putRequests)
}

export const createHandler = (client) => async (event) => {
  const userId = getUserId(event)
  if (!userId) return response(401, { message: '認証が必要です' })
  const method = event.requestContext?.http?.method
  const date = event.pathParameters?.date

  try {
    if (method === 'GET') {
      const items = await queryUserItems(client, userId)
      return response(200, { measurements: aggregateMeasurements(items) })
    }

    if (method === 'POST' || method === 'PUT') {
      const body = parseBody(event)
      if (body === undefined) return response(400, { message: 'JSONを解析できません' })
      const validationError = validateMeasurement(body, method === 'PUT' ? date : null)
      if (validationError) return response(400, { message: validationError })
      const targetDate = method === 'PUT' ? date : body.examinationDate
      if (method === 'POST') {
        const existing = await queryUserItems(client, userId, `DATE#${targetDate}#`)
        if (existing.length) return response(409, { message: '同じ年月のデータが既にあります' })
      }
      await replaceDate(client, userId, targetDate, body)
      return response(method === 'POST' ? 201 : 200, { examinationDate: targetDate })
    }

    if (method === 'DELETE') {
      if (!isValidDate(date)) return response(400, { message: '年月が正しくありません' })
      const existing = await queryUserItems(client, userId, `DATE#${date}#`)
      if (!existing.length) return response(404, { message: '対象データがありません' })
      await batchWrite(client, existing.map((item) => ({ DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } })))
      return response(204)
    }

    return response(405, { message: '許可されていないメソッドです' })
  } catch (error) {
    console.error('measurements request failed', { message: error.message })
    return response(500, { message: 'サーバーエラーが発生しました' })
  }
}

export const handler = createHandler(documentClient)
