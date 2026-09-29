import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Welcome from './pages/Welcome'
import Upload from './pages/Upload'
import IntelligenceClassification from './pages/IntelligenceClassification'
import ListOfDocuments from './pages/ListOfDocuments'
import Metadata from './pages/Metadata'
import Duplicate from './pages/Duplicate'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import DocumentPreview from './pages/DocumentPreview'
import { UserProvider } from './context/UserContext'
import { useUser } from './context/UserContext'
import { JobProvider } from './context/JobContext'
import { AdminProvider } from './admin/context/AdminContext'
import AdminLogin from './admin/pages/AdminLogin'

function UploadRouteGuard() {
  const { user } = useUser()
  if (user?.role !== 'admin') {
    return <Navigate to="/duplicate" replace />
  }
  return <Upload />
}

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <AdminProvider>
          <JobProvider>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Login />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/upload" element={<UploadRouteGuard />} />
              <Route path="/pipeline-status" element={<Navigate to="/upload" replace />} />
              <Route path="/duplicate" element={<Duplicate />} />
              <Route path="/intelligence-classification" element={<IntelligenceClassification />} />
              <Route path="/list-of-documents" element={<ListOfDocuments />} />
              <Route path="/metadata" element={<Metadata />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/document-preview" element={<DocumentPreview />} />

              <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
              <Route path="/admin/login" element={<AdminLogin />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </JobProvider>
        </AdminProvider>
      </UserProvider>
    </BrowserRouter>
  )
}

export default App
