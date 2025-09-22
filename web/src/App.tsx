import { Route, Routes } from 'react-router-dom'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import AuthCallback from './pages/AuthCallback'
import Protected from './components/Protected'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import ProjectDetails from './pages/ProjectDetails'
import ChatView from './pages/ChatView'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Protected />}>
        <Route element={<Layout />}>
          <Route index element={<Welcome />} />
          <Route path="projects/:id" element={<ProjectDetails />} />
          <Route path="projects/:id/chats/:chatId" element={<ChatView />} />
        </Route>
      </Route>
      <Route path="/auth/sign-in" element={<SignIn />} />
      <Route path="/auth/sign-up" element={<SignUp />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
    </Routes>
  )
}
