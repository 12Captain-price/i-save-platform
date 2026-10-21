import { useEffect, useState } from 'react';

type Contacts = {office:string;email:string;office_phone:string;director_phone:string;additional_phone:string};
export function usePublicContacts() {
  const [data,setData] = useState<Contacts|null>(null);
  const [error,setError] = useState(false);
  const [revision,setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/public/contacts',{cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error();
        const next = await response.json() as Contacts;
        if (!['office','email','office_phone','director_phone','additional_phone'].every(k=>typeof next[k as keyof Contacts]==='string' && next[k as keyof Contacts])) throw new Error();
        if (!controller.signal.aborted) {setData(next);setError(false);}
      } catch { if (!controller.signal.aborted) {setData(null);setError(true);} }
    };
    void load(); const timer = window.setInterval(() => void load(),60_000);
    const focus = () => void load(); window.addEventListener('focus',focus);
    return () => {controller.abort();clearInterval(timer);window.removeEventListener('focus',focus);};
  },[revision]);
  const contact = data ? {office:data.office,email:data.email,phones:[
    ['Office landline',data.office_phone],['Director',data.director_phone],['Additional contact',data.additional_phone],
  ].map(([label,value])=>({label:label!,value:value!,href:'tel:+'+value!.replace(/\D/g,'')}))} : null;
  const entries = contact ? [
    {id:'email',label:'Email',value:contact.email,type:'email',href:'mailto:'+contact.email},
    ...contact.phones.map((p,i)=>({...p,id:'phone-'+i,type:'phone'})),
    {id:'office',label:'Office',value:contact.office,type:'address',href:undefined},
  ] : [];
  return {contact,entries,error,retry:()=>setRevision(v=>v+1)};
}
