// src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, max, sql, asc } from 'drizzle-orm'
import * as schema from './schema'
import md5 from 'js-md5'
import validator from 'validator'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

const maxNotes = parseInt('128')

// 允许跨域
app.use('/*', cors({
            origin: '*',
            allowHeaders: ['Content-Type', 'Authorization']
        }))

// 数据库操作工具
const useDB = (c: Hono.Context) => drizzle(c.env.DB, { schema })

const validatePinboardId = (id: string) => {
  return validator.isAlphanumeric(id) && validator.isLength(id, { min: 14, max: 14 })
}

const validateHash = (hash: string) => {
  return validator.isAlphanumeric(hash) && validator.isLength(hash, { min: 32, max: 32 })
}

app.get('/', async (c) => {
    return c.json({ message: 'Hello!' })
})

// 添加留言板
app.get('/addPinboard', async (c) => {
  const pinboardId = c.req.query('pinboardId')
  const hashKey = c.req.query('hashKey')

  if (!pinboardId || !hashKey) {
    throw new HTTPException(400, { message: '参数错误' })
  }

  if (!validatePinboardId(pinboardId)) {
    throw new HTTPException(400, { message: '无效的留言板ID' })
  }

  if (!validateHash(hashKey)) {
    throw new HTTPException(400, { message: '无效的HashKey' })
  }

  const db = useDB(c)
  
  try {
    await db.insert(schema.pinboards).values({
      pinboardId,
      hashKey
    })
    return c.json({ success: true })
  } catch (error) {
    throw new HTTPException(500, { message: '操作失败' })
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

  if (!validatePinboardId(pinboardId)) {
    throw new HTTPException(400, { message: '无效的留言板ID' })
  }
  
  if (!validateHash(userHash)) {
    throw new HTTPException(400, { message: '无效的用户Hash' })
  }
  
  if (!validateHash(hash)) {
    throw new HTTPException(400, { message: '无效的校验Hash' })
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
    throw new HTTPException(418, { message: '留言板不存在' })
  }

  // 验证数据完整性
  const data = pinboardId + localPosition + angle + colorHue + userHash + pinboard.hashKey
  const calculatedHash = md5(data)

  if (calculatedHash !== hash) {
    console.warn('数据校验失败:', { calculatedHash, receivedHash: hash })
    throw new HTTPException(401, { message: '数据校验失败' })
  }

try {
  let nextIndex = 0;

  const stats = await db
      .select({
        count: sql<number>`COUNT(*)`,
        maxIndex: max(schema.notes.noteindex)
      })
      .from(schema.notes)
      .where(eq(schema.notes.pinboardId, pinboardId))
      .get();

      const noteCount = stats?.count ?? 0
      const maxIndex = stats?.maxIndex ?? -1

    // 如果留言数量达到限制，删除最旧的一条
    if (noteCount >= maxNotes) {
      const oldestNote = await db.select({ id: schema.notes.id, noteindex: schema.notes.noteindex })
          .from(schema.notes)
          .where(eq(schema.notes.pinboardId, pinboardId))
          .orderBy(schema.notes.timestamp)
          .limit(1)
          .get()
      if (oldestNote) {
        // 直接使用被删除留言的noteindex
        nextIndex = oldestNote.noteindex
        await db.delete(schema.notes)
          .where(eq(schema.notes.id, oldestNote.id))
          .run()
      } else {
        // 理论上不应该发生
        console.error('无法找到最旧的留言进行替换')
        throw new HTTPException(500, { message: '操作失败' });
      }
    } else {
      // 留言未满，使用maxIndex + 1
      const potentialNextIndex = maxIndex + 1;
      if (noteCount === potentialNextIndex && potentialNextIndex < maxNotes) {
            nextIndex = potentialNextIndex;
          } else {
            // nextIndex超限，查找可用的最小noteindex
            // 获取当前所有已用的noteindex
            const usedIndexes = await db.select({ noteindex: schema.notes.noteindex })
              .from(schema.notes)
              .where(eq(schema.notes.pinboardId, pinboardId))
              .orderBy(asc(schema.notes.noteindex))
              .all()
              .then(notes => new Set(notes.map(note => note.noteindex)));
            // 查找最小的可用noteindex
            for (let i = 0; i < maxNotes; i++) {
                if (!usedIndexes.has(i)) {
                    nextIndex = i;
                    break;
                }
            }
          }
      }
    if (nextIndex === undefined || nextIndex >= maxNotes) {
        console.error('最终未能确定有效nextIndex', { nextIndex, noteCount, maxIndex });
        throw new HTTPException(500, { message: '操作失败' });
    }

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
  throw new HTTPException(500, { message: '操作失败' })
}
})

// 获取留言
app.get('/getNotes', async (c) => {
  const pinboardId = c.req.query('pinboardId')
  
  if (!pinboardId) {
    throw new HTTPException(400, { message: '缺少必要参数' })
  }

  if (!validatePinboardId(pinboardId)) {
    throw new HTTPException(400, { message: '无效的留言板ID' })
  }

  const db = useDB(c)
  
  try {
    const notes = await db.select().from(schema.notes)
      .where(eq(schema.notes.pinboardId, pinboardId))
      .orderBy(schema.notes.noteindex)
      .limit(maxNotes)
      .all()

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
  } catch (error) {
    console.error('获取留言失败:', error)
    throw new HTTPException(500, { message: '操作失败' })
  }
})

// 删除留言
app.get('/deleteNote', async (c) => {
  const pinboardId = c.req.query('pinboardId')
  const hashKey = c.req.query('hashKey')
  const index = c.req.query('index')

  if (!pinboardId || !hashKey || !index) {
    throw new HTTPException(400, { message: '缺少必要参数' })
  }

  if (!validatePinboardId(pinboardId)) {
    throw new HTTPException(400, { message: '无效的留言板ID' })
  }
  
  if (!validateHash(hashKey)) {
    throw new HTTPException(400, { message: '无效的HashKey' })
  }

  const dbIndex = parseInt(index);
  if (!Number.isInteger(dbIndex) || dbIndex < 0) {
    throw new HTTPException(400, { message: '无效的索引' })
  }

  const db = useDB(c)
  
  // 验证留言板密钥
  const pinboard = await db.select().from(schema.pinboards)
    .where(eq(schema.pinboards.pinboardId, pinboardId))
    .get()

  if (!pinboard || pinboard.hashKey !== hashKey) {
    throw new HTTPException(403, { message: '认证失败' })
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
    throw new HTTPException(500, { message: '操作失败' })
  }
})

export default app