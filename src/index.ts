// src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, max } from 'drizzle-orm'
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
  const params = c.req.query();
  
  const {
    pinboardId,
    localPosition,
    angle,
    colorHue,
    content: encodedContent,
    userHash,
    hash
  } = params;

  // 验证所有必需参数
  if (!pinboardId || !localPosition || !angle || !colorHue || !encodedContent || !userHash || !hash) {
    throw new HTTPException(400, { message: '缺少必要参数' })
  }

  // 解码内容
  let content = '';
  try {
    content = decodeURIComponent(encodedContent);
  } catch (e) {
    console.error('内容解码失败:', e)
    throw new HTTPException(400, { message: '内容格式无效' })
  }

  const db = useDB(c)
  
  // 获取留言板密钥
  const pinboard = await db.select().from(schema.pinboards)
    .where(eq(schema.pinboards.pinboardId, pinboardId))
    .get()

  if (!pinboard) {
    throw new HTTPException(404, { message: '留言板不存在' })
  }

  // 验证数据完整性
  const data = pinboardId + localPosition + angle + colorHue + userHash + pinboard.hashKey
  const calculatedHash = md5(data)

  if (calculatedHash !== hash) {
    console.warn('数据校验失败:', { calculatedHash, receivedHash: hash })
    throw new HTTPException(401, { message: '数据校验失败' })
  }

  try {
    // 获取当前最大索引
    const maxIndexResult = await db
      .select({ maxIndex: max(schema.notes.noteindex) })
      .from(schema.notes)
      .where(eq(schema.notes.pinboardId, pinboardId))
      .get()
      
    // 计算下一个索引值
    const nextIndex = maxIndexResult?.maxIndex !== null ? 
                     (maxIndexResult?.maxIndex ?? -1) + 1 : 
                     0
    // 添加留言
    await db.insert(schema.notes).values({
      pinboardId,
      noteindex: nextIndex,
      localPosition,
      angle,
      colorHue,
      content,
      userHash,
      timestamp: Date.now()
    })
    
    return c.json({ success: true, index: nextIndex })
  } catch (error) {
    console.error('添加留言失败:', error)
    throw new HTTPException(500, { message: '添加留言失败' })
  }
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

  const dbIndex = parseInt(index);
  if (isNaN(dbIndex)) {
    throw new HTTPException(400, { message: '索引无效' })
  }

  const db = useDB(c)
  
  // 验证留言板密钥
  const pinboard = await db.select().from(schema.pinboards)
    .where(eq(schema.pinboards.pinboardId, pinboardId))
    .get()

  if (!pinboard || pinboard.hashKey !== hashKey) {
    throw new HTTPException(401, { message: '认证失败' })
  }

  // 删除留言
  try {
    await db.delete(schema.notes)
      .where(and(
        eq(schema.notes.pinboardId, pinboardId),
        eq(schema.notes.noteindex, dbIndex)
      ))
      .run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('删除留言失败:', error)
    throw new HTTPException(500, { message: '删除留言失败' })
  }
})

export default app