import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import WelcomeSection from '../components/WelcomeSection'
import { useUser } from '../context/UserContext'

export default function Welcome() {
  const navigate = useNavigate()
  const { user } = useUser()

  const handleUpload = () => {
    if (user?.role === 'admin') {
      navigate('/upload')
      return
    }
    navigate('/duplicate')
  }

  return (
    <Layout
      title="Welcome"
      activeNavId="duplicates"
      breadcrumbLabel="Welcome"
      breadcrumbItems={[]}
    >
      <WelcomeSection onUpload={handleUpload} />
    </Layout>
  )
}
