import { expect, test, type Page } from "@playwright/test";
const email=(i:number)=>`auth-context-${i}@mail.aub.edu`;
async function login(page:Page,i:number){
  await page.goto('/login');
  await page.getByLabel('University email',{exact:true}).fill(email(i));
  await page.getByLabel('Password',{exact:true}).fill('test-verified-password');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page).toHaveURL(/\/home$/);
}
async function counts(page:Page){return (await page.request.get('http://127.0.0.1:3101/test/auth-context/counts')).json();}
async function change(page:Page,i:number,patch:Record<string,unknown>){
  expect((await page.request.post('http://127.0.0.1:3101/test/auth-context/state',{data:{email:email(i),patch}})).ok()).toBe(true);
}
test('real signed-token verification uses a single live context per page and no Auth-user call',async({page})=>{
  await login(page,0);
  const before=await counts(page);
  await page.goto('/courses');
  await expect(page.getByRole('heading',{name:'Course catalogue',exact:true})).toBeVisible();
  const after=await counts(page);
  expect(after.user).toBe(before.user);
  expect(after.context-before.context).toBe(1);
  expect(after.header).toBe(before.header);
  expect(after.jwks).toBeGreaterThan(0);
  await change(page,0,{profileName:'Live Changed Name'});
  await page.goto('/home');
  await expect(page.getByRole('heading',{name:'Welcome, Live Changed Name',exact:true})).toBeVisible();
});
test('two browsers never share personal context',async({page,browser})=>{
  await login(page,1);await change(page,1,{profileName:'Student One'});
  const second=await browser.newContext();
  try{
    const other=await second.newPage();await login(other,2);await change(other,2,{profileName:'Student Two'});
    await other.goto('/home');await expect(other.getByRole('heading',{name:'Welcome, Student Two',exact:true})).toBeVisible();
    await page.goto('/home');await expect(page.getByRole('heading',{name:'Welcome, Student One',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Welcome, Student Two',exact:true})).toHaveCount(0);
  }finally{await second.close();}
});
for(const [i,patch,label] of [[3,{revoked:true},'revoked session'],[4,{banned:true},'banned account'],[5,{deleted:true},'deleted account'],[6,{expired:true},'expired session']] as const){
  test(`rejects a ${label} while the signed token is still valid`,async({page})=>{
    await login(page,i);await change(page,i,patch);await page.goto('/courses');await expect(page).toHaveURL(/\/login\?/);
  });
}
test('live unconfirmed state redirects despite a previously confirmed token',async({page})=>{
  await login(page,7);await change(page,7,{confirmed:false});await page.goto('/courses');await expect(page).toHaveURL(/\/verify-email\?/);
});
test('tampered signature cannot read context or enter a protected page',async({page,context})=>{
  await login(page,8);
  const cookies=await context.cookies();
  const cookie=cookies.find(c=>c.name==='sb-127-auth-token');
  expect(cookie).toBeDefined();
  const session=JSON.parse(Buffer.from(cookie!.value.slice('base64-'.length),'base64url').toString());
  const pieces=session.access_token.split('.');
  const payload=JSON.parse(Buffer.from(pieces[1],'base64url').toString());payload.sub='00000000-0000-4000-8000-000000000001';
  pieces[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');session.access_token=pieces.join('.');
  await context.addCookies([{...cookie!,value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url')}]);
  const before=await counts(page);await page.goto('/courses');await expect(page).toHaveURL(/\/login\?/);
  expect((await counts(page)).context).toBe(before.context);
});

test('events reuse the same live session and bundled header without Auth-user calls',async({page})=>{
  await login(page,9);const before=await counts(page);
  await page.goto('/events');await expect(page.getByRole('heading',{name:'Campus Events',exact:true})).toBeVisible();
  await expect(page.getByText('Could not load events.',{exact:true})).toHaveCount(0);
  const after=await counts(page);
  expect(after.context-before.context).toBe(1);expect(after.header).toBe(before.header);expect(after.user).toBe(before.user);expect(after.events-before.events).toBe(2);
});
test('old or malformed bundled counts fall back without rejecting the live session',async({page})=>{
  await login(page,9);
  for(const countsMode of ['missing','invalid']){
    await change(page,9,{countsMode});const before=await counts(page);
    await page.goto('/courses');await expect(page.getByRole('heading',{name:'Course catalogue',exact:true})).toBeVisible();
    const after=await counts(page);expect(after.header-before.header).toBe(1);expect(after.context-before.context).toBe(1);
  }
});

test('course diagnostics replace incoming IDs without changing authenticated content',async({page})=>{
  await login(page,0);
  const response=await page.request.get('/courses',{headers:{'x-cc-request-id':'spoofed'}});
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('Course catalogue');
  expect(response.headers()['x-cc-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(response.headers()['cache-control']).toContain('no-store');
});
