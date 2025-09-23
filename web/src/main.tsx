import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from './components/ToastProvider'
import { TooltipProvider } from '@radix-ui/react-tooltip'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TooltipProvider delayDuration={150} skipDelayDuration={300} disableHoverableContent>
        <ToastProvider>
          <App />
        </ToastProvider>
      </TooltipProvider>
    </BrowserRouter>
  </StrictMode>,
)
