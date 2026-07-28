import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { Toaster } from './shared/toast/Toaster';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import { installDialogGuards } from './shared/toast/dialogGuards';

// Neutralize renderer-freezing native dialogs (window.alert/prompt) before any
// app code runs. See dialogGuards.ts / docs/UI-UX-SPEC.md §21.
installDialogGuards();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in the document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <Toaster />
  </StrictMode>,
);
