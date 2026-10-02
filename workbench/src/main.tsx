/* Modified in the personal fork, 02-10-2026: Windows and project-owned video workflow. */
import ReactDOM from 'react-dom/client';
import {loadDisk} from './projectSession';
import './styles.css';
// Load the canonical file before mounting an editable timeline. Corrupt files fail closed.
loadDisk().then(async()=>{
  const {App}=await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(<App/>);
}).catch(error=>{
  const root=document.getElementById('root')!;
  root.textContent=`Cannot open project: ${error}. Fix the file or link a project, then reload.`;
});
