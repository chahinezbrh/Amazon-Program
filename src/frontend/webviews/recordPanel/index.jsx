import React from 'react';
import { createRoot } from 'react-dom/client';
import RecordPanel from './RecordPanel';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<RecordPanel />);
}