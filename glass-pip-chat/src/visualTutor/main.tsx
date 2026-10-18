import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import Overlay from './Overlay';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Overlay /></React.StrictMode>);
