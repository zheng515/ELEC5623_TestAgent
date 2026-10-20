import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

test("local SMTP verification and password reset preserve password policy and revoke sessions", {skip:process.env.REQTEST_MAIL_TEST!=="1",timeout:60000}, async context => {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  process.env.REQTEST_LOCAL_MAIL="true"; process.env.AUTH_REQUIRE_EMAIL_VERIFICATION="false"; process.env.REQTEST_DATA_NAMESPACE="mail-test-"+randomUUID();
  const authModule=await import("../lib/auth"), auth=await authModule.getAuth(), db=authModule.database;
  context.after(async()=>{await db.query('DROP SCHEMA IF EXISTS "'+process.env.REQTEST_DATA_NAMESPACE!.replaceAll("-","_")+'" CASCADE');await db.end();await rm(authModule.dataDir,{recursive:true,force:true});});
  const base="http://127.0.0.1:3001", email=randomUUID()+"@example.test";
  const call=(path:string,body:object,cookie="")=>auth.handler(new Request(base+"/api/auth/"+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:base,Cookie:cookie},body:JSON.stringify(body)}));
  const signup=await call("sign-up/email",{name:"SMTP regression",email,password:"Original123"});assert.equal(signup.status,200);
  const cookie=signup.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  async function messageLink(subject:string) {
    const search=await (await fetch("http://127.0.0.1:8025/api/v1/search?query="+encodeURIComponent("to:"+email))).json();
    const item=search.messages.find((item:{Subject:string})=>item.Subject===subject);assert.ok(item,"Expected synthetic mail was captured locally");
    const message=await (await fetch("http://127.0.0.1:8025/api/v1/message/"+item.ID)).json();
    const match=String(message.Text).match(/https?:\/\/[^\s]+/);assert.ok(match,"Expected a link in the synthetic email");return new URL(match[0]);
  }
  const verification=await messageLink("Verify your ReqTest email");
  const verified=await auth.handler(new Request(verification));assert.ok([200,302].includes(verified.status));
  assert.equal((await authModule.session(new Request(base,{headers:{Cookie:cookie}})))?.user.emailVerified,true);
  assert.equal((await call("request-password-reset",{email,redirectTo:base+"/reset-password"})).status,200);
  const link=await messageLink("Reset your ReqTest password");
  // Better Auth email links first validate the token, then redirect to the reset form.
  const redirect=await auth.handler(new Request(link));
  const destination=new URL(redirect.headers.get("location") || link.toString());
  const token=destination.searchParams.get("token");assert.ok(token);
  assert.equal((await call("reset-password",{token,newPassword:"weakpassword"})).status,400);
  assert.equal((await call("reset-password",{token,newPassword:"Updated123"})).status,200);
  assert.equal(await authModule.session(new Request(base,{headers:{Cookie:cookie}})),null);
  assert.equal((await call("sign-in/email",{email,password:"Original123"})).status,401);
  assert.equal((await call("sign-in/email",{email,password:"Updated123"})).status,200);
  assert.equal((await call("reset-password",{token,newPassword:"Another123"})).status,400);
});
