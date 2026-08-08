import { fetchAuthSession } from 'aws-amplify/auth'

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')

export const isCloudApiConfigured = Boolean(apiUrl)

const getToken = async (forceRefresh = false) => {
  const session = await fetchAuthSession({ forceRefresh })
  const token = session.tokens?.accessToken?.toString()
  if (!token) throw new Error('AUTH_REQUIRED')
  return token
}

const parseResponse = async (response) => {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('INVALID_RESPONSE')
  }
}

const request = async (path, options = {}, retry = true) => {
  if (!isCloudApiConfigured) throw new Error('API_NOT_CONFIGURED')
  const token = await getToken(!retry)
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (response.status === 401 && retry) return request(path, options, false)
  const body = await parseResponse(response)
  if (!response.ok) {
    const error = new Error(body?.message || `API_ERROR_${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

export const getCloudMeasurements = async () => {
  const result = await request('/measurements')
  return {
    measurements: Array.isArray(result?.measurements) ? result.measurements : [],
    referenceRanges: result?.referenceRanges && typeof result.referenceRanges === 'object'
      ? result.referenceRanges : {},
  }
}

export const createCloudMeasurement = (measurement) => request('/measurements', {
  method: 'POST',
  body: JSON.stringify(measurement),
})

export const updateCloudMeasurement = (date, measurement) => request(`/measurements/${encodeURIComponent(date)}`, {
  method: 'PUT',
  body: JSON.stringify(measurement),
})

export const deleteCloudMeasurement = (date) => request(`/measurements/${encodeURIComponent(date)}`, {
  method: 'DELETE',
})
