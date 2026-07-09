/**
 * Cloudflare Worker - 羽毛球排赛房间后端
 * 用 KV 存储房间数据，替代微信云数据库
 *
 * 环境变量要求：
 *   ROOMS - KV 命名空间绑定
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function handleOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * 深度合并嵌套对象，支持 null 删除
 * e.g. mergeNested({scores:{0:{a:'10'}}}, {'scores.0.a':'21'}) => {scores:{0:{a:'21'}}}
 * e.g. mergeNested({scores:{0:{a:'10'},1:{a:'5'}}}, {'scores.0':null}) => {scores:{1:{a:'5'}}}
 */
function applyNestedUpdate(target, updates) {
  for (const keyPath of Object.keys(updates)) {
    const value = updates[keyPath]
    const parts = keyPath.split('.')
    let obj = target
    for (let i = 0; i < parts.length - 1; i++) {
      const k = /^\d+$/.test(parts[i]) ? parseInt(parts[i]) : parts[i]
      if (obj[k] === undefined || obj[k] === null || typeof obj[k] !== 'object') {
        obj[k] = {}
      }
      obj = obj[k]
    }
    const lastKey = /^\d+$/.test(parts[parts.length - 1])
      ? parseInt(parts[parts.length - 1])
      : parts[parts.length - 1]
    if (value === null) {
      delete obj[lastKey]
    } else {
      obj[lastKey] = value
    }
  }
}

function mergeScores(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') return

  if (!existing.scores || typeof existing.scores !== 'object') {
    existing.scores = {}
  }

  if (Object.keys(incoming).length === 0) {
    existing.scores = {}
    return
  }

  for (const idx of Object.keys(incoming)) {
    if (idx.endsWith('_ts')) continue

    if (incoming[idx] === null) {
      delete existing.scores[idx]
      delete existing.scores[idx + '_ts']
    } else if (typeof incoming[idx] === 'object' && incoming[idx] !== null) {
      const incomingTs = incoming[idx + '_ts'] || {}
      const existingScore = existing.scores[idx] && typeof existing.scores[idx] === 'object'
        ? existing.scores[idx]
        : {}
      const existingTs = existing.scores[idx + '_ts'] || {}

      for (const field of Object.keys(incoming[idx])) {
        const newTs = incomingTs[field] || 0
        const oldTs = existingTs[field] || 0
        if (newTs >= oldTs) {
          existingScore[field] = incoming[idx][field] || ''
          existingTs[field] = newTs
        }
      }

      existing.scores[idx] = existingScore
      existing.scores[idx + '_ts'] = existingTs
    } else {
      existing.scores[idx] = incoming[idx]
    }
  }
}

async function handleGet(request, env) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return json({ error: '缺少房间号' }, 400)

  const room = await env.ROOMS.get(`room:${code}`, 'json')
  if (!room) return json({ error: '房间不存在' }, 404)
  return json(room)
}

async function handlePost(request, env) {
  const body = await request.json()
  const { roomCode, adminId, players, schedule, scores, settings } = body
  if (!roomCode) return json({ error: '缺少房间号' }, 400)

  // 检查房间是否已存在
  const existing = await env.ROOMS.get(`room:${roomCode}`, 'json')
  if (existing) return json({ error: '房间已存在' }, 409)

  const room = {
    roomCode,
    adminId: adminId || '',
    players: players || [],
    schedule: schedule || [],
    scores: scores || {},
    settings: settings || { matchCount: 12, repeatLimit: 1 },
    createdAt: new Date().toISOString(),
    _lastWriterId: body._lastWriterId || '',
  }

  await env.ROOMS.put(`room:${roomCode}`, JSON.stringify(room))
  return json(room, 201)
}

async function handlePut(request, env) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return json({ error: '缺少房间号' }, 400)

  const existing = await env.ROOMS.get(`room:${code}`, 'json')
  if (!existing) return json({ error: '房间不存在' }, 404)

  const body = await request.json()

  const nestedUpdates = {}
  const topLevelUpdates = {}
  for (const key of Object.keys(body)) {
    if (key.includes('.')) nestedUpdates[key] = body[key]
    else topLevelUpdates[key] = body[key]
  }

  if (Object.keys(nestedUpdates).length) {
    applyNestedUpdate(existing, nestedUpdates)
  }

  if (Object.prototype.hasOwnProperty.call(topLevelUpdates, 'scores')) {
    mergeScores(existing, topLevelUpdates.scores)
    delete topLevelUpdates.scores
  }

  Object.assign(existing, topLevelUpdates)

  await env.ROOMS.put(`room:${code}`, JSON.stringify(existing))
  return json(existing)
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return handleOptions()

    const url = new URL(request.url)
    const path = url.pathname

    // 路由
    if (path === '/api/room' || path === '/api/room/') {
      switch (request.method) {
        case 'GET': return handleGet(request, env)
        case 'POST': return handlePost(request, env)
        case 'PUT': return handlePut(request, env)
        default: return json({ error: 'Method not allowed' }, 405)
      }
    }

    // 健康检查
    if (path === '/' || path === '/api/health') {
      return json({ status: 'ok', time: new Date().toISOString() })
    }

    return json({ error: 'Not found' }, 404)
  },
}
