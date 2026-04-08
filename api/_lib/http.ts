type QueryValue = string | string[] | undefined

export type NodeApiRequest = {
  method?: string
  url?: string
  query?: Record<string, QueryValue>
  body?: unknown
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | string>
}

export type NodeApiResponse = {
  status: (code: number) => NodeApiResponse
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
  json?: (data: unknown) => void
  send?: (body: string) => void
}

function firstQueryValue(value: QueryValue): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null
  return typeof value === 'string' ? value : null
}

export function getQueryParam(req: NodeApiRequest, key: string): string | null {
  const direct = firstQueryValue(req.query?.[key])
  if (direct) return direct
  if (!req.url) return null

  try {
    return new URL(req.url, 'https://local.vercel.internal').searchParams.get(key)
  } catch {
    return null
  }
}

export async function readJsonBody<T>(req: NodeApiRequest): Promise<T | null> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body) as T
      } catch {
        return null
      }
    }

    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf8')) as T
      } catch {
        return null
      }
    }

    return req.body as T
  }

  if (typeof req[Symbol.asyncIterator] !== 'function') return null

  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) return null

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T
  } catch {
    return null
  }
}

export function sendJson(res: NodeApiResponse, data: unknown, status = 200) {
  res.status(status)
  if (typeof res.json === 'function') {
    res.json(data)
    return
  }
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export function sendText(res: NodeApiResponse, body: string, status = 200) {
  res.status(status)
  if (typeof res.send === 'function') {
    res.send(body)
    return
  }
  res.end(body)
}
