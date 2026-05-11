import { ApiError, apiRequest, toUserMessage } from '../services/apiClient'

const mockResponse = (value: { ok: boolean; status: number; json: () => Promise<unknown> }) =>
  value as unknown as Response

describe('apiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('toUserMessage maps known and unknown errors', () => {
    expect(toUserMessage(new ApiError(400, 'bad request'))).toBe('bad request')
    expect(toUserMessage(new Error('plain error'))).toBe('plain error')
    expect(toUserMessage('unexpected')).toBe('Unexpected error. Please try again.')
  })

  test('apiRequest normalizes path and returns json payload', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }))

    await expect(apiRequest<{ ok: boolean }>('detectors')).resolves.toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost/api/detectors', undefined)
  })

  test('apiRequest rejects unsafe paths', async () => {
    await expect(apiRequest('//evil.test')).rejects.toMatchObject({
      status: 400,
      message: 'Invalid API path',
    })
  })

  test('apiRequest returns undefined for 204 responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse({
      ok: true,
      status: 204,
      json: async () => undefined,
    }))

    await expect(apiRequest<void>('/detectors/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  test('apiRequest prefers structured error fields', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 400,
        json: async () => ({ error: 'explicit error' }),
      }))
      .mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'not found' }),
      }))
      .mockResolvedValueOnce(mockResponse({
        ok: false,
        status: 409,
        json: async () => ({ message: 'conflict' }),
      }))

    await expect(apiRequest('/a')).rejects.toMatchObject({ status: 400, message: 'explicit error' })
    await expect(apiRequest('/b')).rejects.toMatchObject({ status: 404, message: 'not found' })
    await expect(apiRequest('/c')).rejects.toMatchObject({ status: 409, message: 'conflict' })
  })

  test('apiRequest falls back to status text when body parsing fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('invalid json')
      },
    }))

    await expect(apiRequest('/broken')).rejects.toMatchObject({
      status: 503,
      message: 'Request failed: 503',
    })
  })
})
