import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { PublicLayout } from '@/components/site/PublicLayout';
import { RegistrationHelp } from '@/components/site/RegistrationHelp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function PasswordSetup({recovery=false}:{recovery?:boolean}={}) {
  const [token,setToken]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [password,setPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  useEffect(()=>{
    const read=()=>{
      const value=new URLSearchParams(window.location.hash.slice(1)).get('token')??'';
      window.history.replaceState(null,'',window.location.pathname);
      setToken(/^[A-Za-z0-9_-]{43}$/.test(value)?value:'');setLoaded(true);
      setDone(false);setError('');setPassword('');setConfirmation('');
    };
    read();window.addEventListener('hashchange',read);
    return ()=>window.removeEventListener('hashchange',read);
  },[]);
  return <PublicLayout><div className="mx-auto max-w-xl px-5 py-12 sm:py-20"><section className="space-y-5 rounded-xl border border-primary/25 bg-card p-5 sm:p-8"><h1 className="text-2xl font-semibold">Set your password</h1>{done ? <div role="status"><h2 className="font-semibold text-primary">Password set</h2><p className="mt-3 text-sm">You can now log in. You have not been signed in automatically.</p><Button asChild className="mt-5"><Link to="/login">Log in</Link></Button></div> : !loaded ? <p role="status">Checking setup link...</p> : !token ? <p role="alert" className="text-sm">A valid private invitation link is required. Contact the office for help. No password has been changed.</p> : <form className="space-y-5" onSubmit={async e=>{
    e.preventDefault();setError('');
    if(password!==confirmation){setError('The passwords do not match.');return;}
    if(new TextEncoder().encode(password).length>72){setError('Your password must be at most 72 UTF-8 bytes.');return;}
    setBusy(true);
    try {
      const response=await fetch(recovery?'/api/auth/reset-password':'/api/auth/setup-password',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Isave-Request':'1'},body:JSON.stringify({token,password})});
      if(response.status===204){setDone(true);setToken('');setPassword('');setConfirmation('');return;}
      const data=await response.json();setError(data.error??'Password setup could not be confirmed. Please try again or contact the office.');
    }catch{setError('Password setup could not be confirmed. Retry or contact the office.');}finally{setBusy(false);}
  }}><p className="text-sm text-muted-foreground">Choose a unique password of 12 to 72 characters. This private setup link expires and can be used once.</p><div><label htmlFor="new-password" className="mb-2 block text-sm">New password</label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/></div><div><label htmlFor="confirm-password" className="mb-2 block text-sm">Confirm password</label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy?'Setting password...':'Set password'}</Button></form>}</section><div className="mt-6"><RegistrationHelp/></div></div></PublicLayout>;
}
