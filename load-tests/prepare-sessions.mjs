// Dedicated synthetic accounts only. Do not print credentials, tokens or cookies.
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync,chmodSync} from 'node:fs';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {createServerClient}=require('@supabase/ssr');
const cfg=JSON.parse(process.env.SCRUM309_DIAGNOSTIC_ACCESS||'{}');
const count=Number(process.env.DIAGNOSTIC_USERS||25);
if(![5,25,50].includes(count)||cfg.url!=='https://udtdlctvckaaboycahuk.supabase.co'||typeof cfg.publishableKey!=='string'||!Array.isArray(cfg.accounts)||cfg.accounts.length<count)throw Error('Invalid diagnostic setup');
const selected=cfg.accounts.slice(0,count);
if(new Set(selected.map(a=>a.email)).size!==count)throw Error('Expected distinct test accounts');
const sessions=[];
for(const account of selected){
 const jar=new Map();const client=createServerClient(cfg.url,cfg.publishableKey,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:xs=>xs.forEach(x=>jar.set(x.name,x.value))}});
 let result;const deadline=Date.now()+240000;
 do{result=await client.auth.signInWithPassword({email:account.email,password:account.password});if(result.error?.status!==429)break;if(Date.now()>deadline)throw Error('Auth rate limit persists');console.log('Waiting for normal Auth rate limit');await new Promise(r=>setTimeout(r,10000));}while(true);
 if(result.error||!result.data.user?.email_confirmed_at)throw Error('Diagnostic test login failed');
 sessions.push({userId:result.data.user.id,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),expiresAt:result.data.session.expires_at});
}
if(new Set(sessions.map(s=>s.userId)).size!==count)throw Error('Expected distinct test identities');
const dir=process.env.DIAGNOSTIC_PRIVATE_DIR;if(!dir)throw Error('Private output directory required');
mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);writeFileSync(dir+'/sessions.json',JSON.stringify(sessions),{mode:0o600});
console.log(`Prepared ${sessions.length} confirmed synthetic student sessions privately`);
