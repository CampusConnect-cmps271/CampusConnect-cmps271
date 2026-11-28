import { expect, test } from "@playwright/test";

test("expand an elective, create a matching plan and see its imported class times on the calendar",async({page})=>{
 test.setTimeout(90000);
 await page.goto("/login");
 await page.getByLabel("University email",{exact:true}).fill("electives-schedule@mail.aub.edu");
 await page.getByLabel("Password",{exact:true}).fill("test-verified-password");
 await page.getByRole("button",{name:"Log in",exact:true}).click();await expect(page).toHaveURL(/\/home$/);
 await page.goto("/electives/preferences");
 await page.getByLabel("Browse semester",{exact:true}).selectOption("202720");
 await page.getByRole("checkbox",{name:"Writing in the Discipline",exact:true}).check();
 await page.getByRole("button",{name:"Show courses",exact:true}).click();
 await expect(page.getByRole("status")).toHaveText("1 matching course found.",{timeout:20000});
 const results=page.getByRole("region",{name:"Matching elective courses"});
 await expect(results.locator("article")).toHaveCount(0);
 await results.locator("summary").filter({hasText:"CMPS 240"}).click();
 await results.getByRole("link",{name:"Add to schedule",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Add elective to your schedule"})).toBeVisible();
 await expect(page.getByText("You don’t have a plan linked to this semester yet.")).toBeVisible();
 await page.getByRole("button",{name:"Create plan",exact:true}).click();
 await expect(page.getByLabel("Add to this plan",{exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByLabel("Add to this plan")).toContainText("Spring 2027");
 await page.getByRole("button",{name:"Add elective to my schedule",exact:true}).click();
 await expect(page).toHaveURL(/\/planner\/[a-f0-9-]+\?done=/,{timeout:20000});
 await expect(page.locator("#calendar")).toBeVisible();
 await expect(page.locator("#calendar")).toContainText("CMPS 240");
 await expect(page.getByText("Tue 14:00–15:15",{exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:"No conflicts",exact:true})).toBeVisible();
 await page.setViewportSize({width:375,height:812});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("add Social Sciences electives to the same calendar and show overlaps without duplicates",async({page})=>{
 test.setTimeout(90000);
 await page.goto("/login");
 await page.getByLabel("University email",{exact:true}).fill("recommendations-attributes@mail.aub.edu");
 await page.getByLabel("Password",{exact:true}).fill("test-verified-password");
 await page.getByRole("button",{name:"Log in",exact:true}).click();await expect(page).toHaveURL(/\/home$/);
 async function choose(code:string,attribute:string){
  await page.goto("/electives/preferences");
  await page.getByLabel("Browse semester",{exact:true}).selectOption("202720");
  await page.getByRole("checkbox",{name:attribute,exact:true}).check();
  await page.getByRole("button",{name:"Show courses",exact:true}).click();
  const results=page.getByRole("region",{name:"Matching elective courses"});
  await results.locator("summary").filter({hasText:code}).click();
  await results.getByRole("link",{name:"Add to schedule",exact:true}).click();
 }
 await choose("SOCI 200","Social Sciences I");
 await page.getByRole("button",{name:"Create plan",exact:true}).click();
 await expect(page.getByLabel("Add to this plan",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Add elective to my schedule",exact:true}).click();
 await page.getByRole("link",{name:"View SOCI 200 on calendar",exact:true}).click();
 await expect(page).toHaveURL(/#calendar$/);
 await expect(page.locator("#calendar")).toContainText("SOCI 200");
 await choose("SOCI 201","Social Sciences II");
 await expect(page.getByLabel("Add to this plan",{exact:true})).toBeVisible();
 const scheduleUrl=page.url();
 await page.getByRole("button",{name:"Add elective to my schedule",exact:true}).click();
 await expect(page.getByRole("heading",{name:/conflicts found/})).toBeVisible();
 await page.getByRole("link",{name:"View SOCI 201 on calendar",exact:true}).click();
 await expect(page.locator("#calendar")).toContainText("SOCI 201");
 await page.screenshot({path:"/tmp/campusconnect-elective-calendar-conflicts.png",fullPage:true});
 await page.goto(scheduleUrl);
 await page.getByRole("button",{name:"Add elective to my schedule",exact:true}).click();
 await expect(page).toHaveURL(/#calendar$/);
 await expect(page.getByRole("list",{name:"Courses in this plan"}).locator(":scope > li")).toHaveCount(2);
});
