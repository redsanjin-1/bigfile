const express = require('express')
const logger = require('morgan')
const { StatusCodes } = require('http-status-codes')
const cors = require('cors')
const fs = require('fs-extra')
const path = require('path')
const PORT = 8080
const PUBLIC_DIR = path.resolve(__dirname, 'public')
const TEMP_DIR = path.resolve(__dirname, 'temp')

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
  const { chunkFileName } = req.query // 分片名
  const chunkDir = path.resolve(TEMP_DIR, filename) // 分片目录
  const chunkFilePath = path.resolve(chunkDir, chunkFileName) // 分片路径
  // 确定分片目录存在
  await fs.ensureDir(chunkDir)
  // 创建文件的可写流
  const ws = fs.createWriteStream(chunkFilePath, {})
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

app.get('/merge/:filename', async (req: any, res: any) => {
  const { filename } = req.params
  const { chunkFileName } = req.query
  res.json({ success: true })
})

function pipeStream(rs: any, ws: any) {
  return new Promise((resolve, reject) => {
    rs.pipe(ws).on('finish', resolve).on('error', reject)
  })
}

app.listen(PORT, () => {
  console.log('server started on port 8080')
})
