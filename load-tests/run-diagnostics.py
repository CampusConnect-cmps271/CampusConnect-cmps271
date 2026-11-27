#!/usr/bin/env python3
"""Bounded, read-only, single-stage JMeter comparison; no automatic escalation."""
import argparse,csv,datetime,json,math,os,pathlib,signal,subprocess,time,urllib.request,urllib.error
p=argparse.ArgumentParser();p.add_argument('--users',type=int,choices=[5,25,50,100,200],default=25);p.add_argument('--sessions',type=pathlib.Path,required=True);p.add_argument('--jmeter',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--generator',default='local');p.add_argument('--expected-commit',required=True);a=p.parse_args()
url='https://campus-connect-cmps271.vercel.app';sessions=json.loads(a.sessions.read_text())[:a.users];ramp={5:5,25:30,50:60,100:90,200:120}[a.users];hold=300
if len(sessions)!=a.users or len({s['userId'] for s in sessions})!=min(a.users,50):raise SystemExit('Unexpected confirmed test identity count')
if len({s['cookie'] for s in sessions})!=a.users:raise SystemExit('Need separate session cookies')
if a.users>50 and len({s.get('sessionId') for s in sessions})!=a.users:raise SystemExit('Need unique verified session IDs')
if min(s['expiresAt'] for s in sessions)<time.time()+ramp+hold+120:raise SystemExit('Sessions will expire; refresh setup')
if not a.jmeter.is_file() or len(a.expected_commit)!=40 or any(c not in '0123456789abcdef' for c in a.expected_commit):raise SystemExit('Invalid JMeter path or expected commit')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
regions=[]
for path,expected in [('/home','Campus Feed'),('/search?q=campus','Search campus posts'),('/events','Campus Events'),('/courses?q=CMPS','Course catalogue'),('/api/notifications',None)]:
 try:
  with opener.open(urllib.request.Request(url+path,headers={'Cookie':sessions[0]['cookie']}),timeout=20) as response:
   body=response.read().decode();status=response.status
   region=(response.headers.get('x-vercel-id') or '').split('::')[0]
   if len(region)==4 and region[:3].isalpha() and region[3].isdigit():regions.append(region)
   if status!=200 or (expected and (expected not in body or 'NEXT_REDIRECT' in body or 'role="alert"' in body)) or (not expected and not isinstance(json.loads(body).get('items'),list)):raise ValueError('Invalid response')
 except Exception:raise SystemExit('Authenticated preflight failed; no load started')
a.out.mkdir(parents=True,exist_ok=False);out=a.out.resolve();start=time.time();meta={'started_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'started_at_epoch':start,'users':a.users,'distinct_test_accounts':len({s['userId'] for s in sessions}),'distinct_test_sessions':a.users,'ramp_seconds':ramp,'hold_seconds':hold,'think_time_ms':[3000,7000],'base_url':url,'expected_deployed_commit':a.expected_commit,'generator':a.generator,'edge_regions_in_preflight':sorted(set(regions)),'scope':'Authenticated closed-loop HTTP browsing reads; no writes, AI, assets/browser rendering or realtime. Setup logins excluded.'};(out/'run.json').write_text(json.dumps(meta,indent=2)+'\n')
cmd=[str(a.jmeter.resolve()),'-n','-t',str(pathlib.Path(__file__).with_name('campus-connect.jmx').resolve()),'-l',str(out/'samples.jtl'),'-j',str(out/'jmeter.log'),'-e','-o',str(out/'dashboard'),f'-Jusers={a.users}',f'-Jramp={ramp}',f'-Jduration={ramp+hold}',f'-Jsessions_file={a.sessions.resolve()}','-Jhost=campus-connect-cmps271.vercel.app','-Jport=443','-Jscheme=https','-Jcourse_query=CMPS','-Jaccept_encoding=gzip','-Jthink_min=3000','-Jthink_range=4000','-Jsample_variables=course_request_id','-Jjmeter.save.saveservice.output_format=csv','-Jjmeter.save.saveservice.autoflush=true','-Jjmeter.save.saveservice.thread_counts=true','-Jjmeter.save.saveservice.response_data=false','-Jjmeter.save.saveservice.response_data.on_error=false','-Jjmeter.save.saveservice.samplerData=false','-Jjmeter.save.saveservice.requestHeaders=false','-Jjmeter.save.saveservice.responseHeaders=false','-Jjmeter.save.saveservice.assertion_results_failure_message=true']
env={**os.environ,'HEAP':'-Xms512m -Xmx2g -XX:MaxMetaspaceSize=256m'}
def read_rows():
 try:return [r for r in csv.DictReader((out/'samples.jtl').open()) if r.get('success') in ('true','false') and r.get('Connect') is not None]
 except FileNotFoundError:return []
def pct(v,q):return sorted(v)[max(0,math.ceil(len(v)*q)-1)] if v else None
stopped=False;bad=0
with (out/'console.log').open('w') as console:
 child=subprocess.Popen(cmd,stdout=console,stderr=subprocess.STDOUT,env=env,start_new_session=True)
 try:
  while child.poll() is None:
   now=time.time();rows=read_rows();recent=[r for r in rows if int(r['timeStamp'])/1000>=now-40];errors=sum(r['success']=='false' for r in recent);p95=pct([int(r['elapsed']) for r in recent],.95) or 0
   state={'epoch':now,'completed_samples':len(rows),'recent_completed':len(recent),'recent_errors':errors,'recent_p95_ms':p95,'host_load_1m':os.getloadavg()[0],'host_cpu_count':os.cpu_count()}
   with (out/'runtime.jsonl').open('a') as f:f.write(json.dumps(state)+'\n')
   unhealthy=len(recent)>=50 and (errors/len(recent)>=.05 or p95>=5000);bad=3 if errors>=5 and errors/max(1,len(recent))>=.10 else bad+1 if unhealthy else 0
   if bad>=3:
    stopped=True;(out/'guardrail-stop.json').write_text(json.dumps(state,indent=2));os.killpg(child.pid,signal.SIGTERM);break
   if now-start>ramp+hold+120:
    stopped=True;(out/'guardrail-stop.json').write_text(json.dumps({'reason':'Hard stage time limit'},indent=2));os.killpg(child.pid,signal.SIGTERM);break
   time.sleep(10)
  child.wait(timeout=30)
 finally:
  if child.poll() is None:
   os.killpg(child.pid,signal.SIGTERM);child.wait(timeout=30)
rows=read_rows()
if not rows:raise SystemExit('JMeter produced no valid samples')
first=min(int(r['timeStamp']) for r in rows);cut=first+ramp*1000;end=max(int(r['timeStamp'])+int(r['elapsed']) for r in rows);hh=[r for r in rows if int(r['timeStamp'])>=cut];duration=max(1,(end-cut)/1000)
endpoints=[]
for label in sorted({r['label'] for r in rows}):
 rr=[r for r in hh if r['label']==label];endpoints.append({'endpoint':label,'hold_samples':len(rr),'errors':sum(r['success']=='false' for r in rr),'p95_ms':pct([int(r['elapsed']) for r in rr],.95),'p99_ms':pct([int(r['elapsed']) for r in rr],.99)})
passed=not stopped and child.returncode==0 and max(int(r['allThreads']) for r in rows)>=a.users and len(endpoints)==5 and all(e['hold_samples']>0 and e['errors']/e['hold_samples']<.01 and e['p95_ms']<2000 for e in endpoints) and bool(hh) and pct([int(r['elapsed']) for r in hh],.99)<5000
summary={'passed_all_gates':passed,'stopped_early':stopped,'jmeter_exit_code':child.returncode,'total_requests':len(rows),'total_errors':sum(r['success']=='false' for r in rows),'hold_requests':len(hh),'measured_hold_seconds':duration,'hold_rps':len(hh)/duration,'hold_p50_ms':pct([int(r['elapsed']) for r in hh],.5),'hold_p95_ms':pct([int(r['elapsed']) for r in hh],.95),'hold_p99_ms':pct([int(r['elapsed']) for r in hh],.99),'endpoints':endpoints,'timings':{key:{'p50_ms':pct([int(r[key]) for r in hh],.5),'p95_ms':pct([int(r[key]) for r in hh],.95)} for key in ['Connect','Latency','elapsed']},'note':'Interrupted requests may be absent from the CSV. Different generator/network/region paths are not directly interchangeable capacity estimates.'};(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
# Preserve a valid comparison even when application latency gates fail; report
# that outcome in summary.json rather than treating it as a broken CI script.
if child.returncode and not stopped:raise SystemExit('JMeter execution failed')
