import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {loadAnalytics} from './analytics.ts';
import './index.css';

loadAnalytics();
createRoot(document.getElementById('root')!).render(<App />);
