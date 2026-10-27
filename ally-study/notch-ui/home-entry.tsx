import { createRoot } from 'react-dom/client';
import NotchHome from './home';
import '@fontsource-variable/geist';
import '@/styles/index.css';
import './notch.css';

const capability = location.hash.slice(1) || sessionStorage.getItem('ally-notch-capability') || '';
if (capability) sessionStorage.setItem('ally-notch-capability', capability);
history.replaceState(null, '', location.pathname);
async function api(route: string) {
  const response = await fetch(`/notch-api/v1/${route}`, {
    headers: { Authorization: `Bearer ${capability}` }, signal: AbortSignal.timeout(6000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Preview unavailable');
  return data;
}
createRoot(document.getElementById('root')!).render(<NotchHome api={api}/>);
