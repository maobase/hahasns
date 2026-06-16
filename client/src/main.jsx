import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { ComposeProvider } from './context/ComposeContext';

// Tailwind/HeroUI first so our hand-rolled CSS wins any class-name collisions
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* HeroUI v3 needs no Provider — theming is handled by ThemeProvider
          (data-theme/skin) + @heroui/styles imported in tailwind.css. */}
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ComposeProvider>
              <App />
            </ComposeProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
