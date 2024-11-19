const express = require('express')
const logger = require('morgan')
const { StatusCodes } = require('http-status-codes')
const cors = require('cors')
const fs = require('fs-extra')
const path = require('path')
const PORT = 8080
const PUBLIC_DIR = path.resolve(__dirname, '../public')
const TEMP_DIR = path.resolve(__dirname, '../temp')
const CHUNK_SIZE = 1024 * 1024 * 10 // 切片大小10m

// 存放上传且合并好的文件
fs.ensureDirSync(PUBLIC_DIR)
// 存放分片的文件
fs.ensureDirSync(TEMP_DIR)

const app = express()
app.use(logger('dev'))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(PUBLIC_DIR))

app.post('/upload/:filename', async (req: any, res: any, next: any) => {
  const { filename } = req.params // 文件名
  const { chunkFileName, start: st } = req.query // 分片名
  const start = isNaN(st) ? 0 : parseInt(st, 10)
  const chunkDir = path.resolve(TEMP_DIR, filename) // 分片目录
  const chunkFilePath = path.resolve(chunkDir, chunkFileName) // 分片路径
  // 确定分片目录存在
  await fs.ensureDir(chunkDir)
  // 创建文件的可写流
  const ws = fs.createWriteStream(chunkFilePath, {
    start, // 起始位置
    flags: 'a', // 追加模式
  })
  req.on('aborted', () => {
    ws.close()
  })
  // 使用管道的方式把请求中的请求体流数据写入到文件中
  try {
    await pipeStream(req, ws)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

app.get('/merge/:filename', async (req: any, res: any, next: any) => {
  const { filename } = req.params
  try {
    await mergeChunks(filename)
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

app.get('/verify/:filename', async (req: any, res: any, next: any) => {
  const { filename } = req.params
  const filePath = path.resolve(PUBLIC_DIR, filename)
  const isExist = await fs.pathExists(filePath)

  if (isExist) {
    res.json({
      success: true,
      needUpload: false,
    })
  }
  const chunksDir = path.resolve(TEMP_DIR, filename)
  const existDir = await fs.pathExists(chunksDir)
  let uploadedChunkList = [] // 已经上传的分片的对象数组
  if (existDir) {
    const chunkFiles = await fs.readdir(chunksDir)
    // 读取temp下该文件目录的所有chunk，返回已上传文件大小
    uploadedChunkList = await Promise.all(
      chunkFiles.map(async function (chunkFileName: string) {
        const { size } = await fs.stat(path.resolve(chunksDir, chunkFileName))
        return {
          chunkFileName,
          size,
        }
      })
    )
  }
  return res.json({
    success: true,
    needUpload: true,
    uploadedChunkList,
  })
})

async function mergeChunks(filename: string) {
  const mergedFilePath = path.resolve(PUBLIC_DIR, filename)
  const chunkDir = path.resolve(TEMP_DIR, filename)
  const chunkFiles = await fs.readdir(chunkDir)
  // 对分片排序
  chunkFiles.sort(
    (a: any, b: any) => Number(a.split('-')[1]) - Number(b.split('-')[1])
  )

  try {
    // 并行写入
    const pipes = chunkFiles.map((chunkFile: any, index: number) => {
      return pipeStream(
        fs.createReadStream(path.resolve(chunkDir, chunkFile), {
          autoClose: true,
        }),
        fs.createWriteStream(mergedFilePath, { start: index * CHUNK_SIZE })
      )
    })
    await Promise.all(pipes)
    // 删除分片目录文件
    await fs.rm(chunkDir, { recursive: true })
  } catch (error) {
    console.log(error)
  }
}

function pipeStream(rs: any, ws: any) {
  return new Promise((resolve, reject) => {
    rs.pipe(ws).on('finish', resolve).on('error', reject)
  })
}

app.listen(PORT, () => {
  console.log('server started on port 8080')
})
