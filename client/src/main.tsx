import { createRoot } from 'react-dom/client'
import { ConfigProvider, theme, App, Layout } from 'antd'
import { useAutoTheme } from './hooks/useAutoTheme.ts'
import FileUploader from './FileUploader.tsx'
import './index.css'

const { defaultAlgorithm, darkAlgorithm } = theme
const { Content } = Layout

const Main = () => {
  const { isDarkTheme } = useAutoTheme()

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkTheme ? darkAlgorithm : defaultAlgorithm,
        cssVar: true,
      }}
    >
      <App>
        <Layout style={{ minHeight: '100vh' }}>
          <Content style={{ padding: 24 }}>
            <FileUploader />
          </Content>
        </Layout>
      </App>
    </ConfigProvider>
  )
}
createRoot(document.getElementById('root')!).render(<Main />)
