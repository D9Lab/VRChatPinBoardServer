// src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import md5 from 'js-md5'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// 允许跨域
app.use('/*', cors())

// 数据库操作工具
const useDB = (c: Hono.Context) => drizzle(c.env.DB, { schema })

// 添加留言板
app.get('/addPinboard', async (c) => {
  const pinboardId = c.req.query('pinboardId')
  const hashKey = c.req.query('hashKey')

  if (!pinboardId || !hashKey) {
    throw new HTTPException(400, { message: '缺少必要参数' })
  }

  const db = useDB(c)
  
  try {
    await db.insert(schema.pinboards).values({
      pinboardId,
      hashKey
    })
    return c.json({ success: true, message: '留言板创建成功' })
  } catch (error) {
    throw new HTTPException(500, { message: '留言板创建失败' })
  }
})

// 添加留言
app.get('/addNote', async (c) => {
  const body = await c.req.json<{
    pinboardId: string
    localPosition: string
    angle: string
    colorHue: string
    content: string
    userHash: string
    hash: string
  }>()

  const { pinboardId, localPosition, angle, colorHue, content, userHash, hash } = body

  if (!pinboardId || !localPosition || !angle || !colorHue || !content || !userHash || !hash) {
    throw new HTTPException(400, { message: '缺少必要参数' })
  }

  const db = useDB(c)
  
  // 获取留言板密钥
  const pinboard = await db.query.pinboards.findFirst({
    where: (pinboards, { eq }) => eq(pinboards.pinboardId, pinboardId)
  })

  if (!pinboard) {
    throw new HTTPException(404, { message: '留言板不存在' })
  }

  // 验证数据完整性
  const data = pinboardId + localPosition + angle + colorHue + userHash + pinboard.hashKey
  const calculatedHash = md5(data)

  if (calculatedHash !== hash) {
    throw new HTTPException(401, { message: '数据校验失败' })
  }

  // 获取当前最大索引
  const maxIndexResult = await db
    .select({ maxIndex: schema.notes.noteindex })
    .from(schema.notes)
    .where(schema.notes.pinboardId.eq(pinboardId))
    .orderBy(schema.notes.noteindex.desc())
    .limit(1)

  const nextIndex = maxIndexResult[0]?.maxIndex !== undefined ? maxIndexResult[0].maxIndex + 1 : 0

  // 添加留言
  await db.insert(schema.notes).values({
    pinboardId,
    index: nextIndex,
    localPosition,
    angle,
    colorHue,
    content,
    userHash,
    timestamp: Date.now()
  })

  return c.json({ success: true, index: nextIndex })
})

// 获取留言
app.get('/getNotes', async (c) => {
  const pinboardId = c.req.query('pinboardId')
  
  if (!pinboardId) {
    throw new HTTPException(400, { message: '缺少留言板ID' })
  }

  const db = useDB(c)
  
  const notes = await db.query.notes.findMany({
    where: (notes, { eq }) => eq(notes.pinboardId, pinboardId),
    orderBy: (notes, { asc }) => [asc(notes.noteindex)]
  })

  // 转换为要求的格式
  const result: Record<string, any> = {}
  notes.forEach((note, i) => {
    result[i] = {
      localPosition: note.localPosition,
      angle: note.angle,
      colorHue: note.colorHue,
      content: note.content,
      timestamp: note.timestamp,
      userHash: note.userHash,
      index: note.noteindex
    }
  })

  return c.json(result)
})

// 删除留言
app.get('/deleteNote', async (c) => {
  const pinboardId = c.req.query('pinboardId')
  const hashKey = c.req.query('hashKey')
  const index = c.req.query('index')

  if (!pinboardId || !hashKey || !index) {
    throw new HTTPException(400, { message: '缺少必要参数' })
  }

  const db = useDB(c)
  
  // 验证留言板密钥
  const pinboard = await db.query.pinboards.findFirst({
    where: (pinboards, { eq }) => eq(pinboards.pinboardId, pinboardId)
  })

  if (!pinboard || pinboard.hashKey !== hashKey) {
    throw new HTTPException(401, { message: '认证失败' })
  }

  // 删除留言
  await db.delete(schema.notes).where(
    schema.notes.pinboardId.eq(pinboardId) &&
    schema.notes.noteindex.eq(parseInt(index))
  )

  return c.json({ success: true })
})

export default app