// Test-only asymmetric issuer. The application uses the real Supabase SDK's
// signature verification; no app auth methods are stubbed by browser tests.
import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
const enabled = process.env.AUTH_TEST_ASYMMETRIC === 'true';
const { privateKey, publicKey } = generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk = {...publicKey.export({format:'jwk'}),kid:'local-auth-context-test',alg:'ES256',use:'sig'};
const users = new Map(), sessions = new Map();
const counts = {user:0,context:0,jwks:0};
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export function signedSession(session) {
  if (!enabled) return session;
  const {id,email,email_confirmed_at} = session.user;
  users.set(id,{id,email,confirmed:!!email_confirmed_at});
  const sid = randomUUID();sessions.set(sid,{id,notAfter:null});
  const claims={sub:id,email,session_id:sid,iss:'http://127.0.0.1:3101/auth/v1',aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)};
  const content=`${encode({alg:'ES256',typ:'JWT',kid:jwk.kid})}.${encode(claims)}`;
  const signature=sign('sha256',Buffer.from(content),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return {...session,access_token:`${content}.${signature}`};
}
function verified(request) {
  try {
    const [header,payload,signature]=request.headers.authorization.slice(7).split('.');
    if (JSON.parse(Buffer.from(header,'base64url')).alg!=='ES256' || !verify('sha256',Buffer.from(`${header}.${payload}`),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'))) return null;
    const claims=JSON.parse(Buffer.from(payload,'base64url'));
    return claims.exp>Date.now()/1000 ? claims : null;
  } catch {return null;}
}
export async function handleLiveContext(request,response,url,profiles) {
  if (!enabled) return false;
  const path=url.pathname;
  if(path==='/auth/v1/.well-known/jwks.json') {counts.jwks++;response.end(JSON.stringify({keys:[jwk]}));return true;}
  if(path==='/test/auth-context/counts') {response.end(JSON.stringify(counts));return true;}
  if(path==='/test/auth-context/state' && request.method==='POST') {
    let raw='';for await(const part of request)raw+=part;
    const {email,patch}=JSON.parse(raw),user=[...users.values()].find(u=>u.email===email);
    if(!user){response.statusCode=404;response.end('{}');return true;}
    for(const k of ['confirmed','banned','deleted'])if(k in patch)user[k]=patch[k];
    if('profileName' in patch)profiles.set(user.id,{id:user.id,full_name:patch.profileName});
    for(const [sid,s] of sessions)if(s.id===user.id){
      if(patch.revoked)sessions.delete(sid);
      if(patch.expired)s.notAfter=Date.now()-1000;
    }
    response.end('{}');return true;
  }
  if(path==='/auth/v1/user' && request.method==='GET'){
    counts.user++;
    if(!verified(request)){response.statusCode=401;response.end(JSON.stringify({code:'bad_jwt',msg:'Invalid test signature'}));return true;}
  }
  if(path==='/rest/v1/rpc/get_my_session_context'){
    counts.context++;
    const claims=verified(request),user=users.get(claims?.sub),session=sessions.get(claims?.session_id);
    if(!claims){response.statusCode=401;response.end('{}');return true;}
    if(!user||!session||session.id!==user.id||user.banned||user.deleted||(session.notAfter&&session.notAfter<=Date.now())){response.end('null');return true;}
    response.end(JSON.stringify({id:user.id,email:user.email,confirmed:user.confirmed,profile_name:user.confirmed?(profiles.get(user.id)?.full_name??user.email.split('@')[0]):null,metadata_full_name:null,metadata_name:null}));
    return true;
  }
  return false;
}
