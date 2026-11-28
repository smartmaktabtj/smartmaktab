export const TEST_SCHOOL_UUID_1 = '11111111-1111-4111-8111-111111111001';
export const TEST_SCHOOL_UUID_4 = '11111111-1111-4111-8111-111111111004';
export const TEST_SCHOOL_UUID_88 = '11111111-1111-4111-8111-111111111088';

export async function pickClass(scope,code,multiple=true){
 const [,grade,letter]=/^(\d+)(.*)$/u.exec(code);
 await scope.locator('[data-class-grade]').selectOption(grade);
 if(letter||await scope.locator('[data-class-letter]').isEnabled())await scope.locator('[data-class-letter]').selectOption(letter);
 if(multiple){if(await scope.locator('[data-teaching-subject]').count())await scope.locator('[data-teaching-subject]').selectOption('informatics');await scope.locator('[data-add-class]').click();}
}
export async function fillRoleFields(scope,{teacherClass='5Б'}={}){
 const profile=scope.locator('[data-role-ready=yes]').first();await profile.waitFor();
 const role=await profile.getAttribute('data-setup-role');
 for(const input of await profile.locator('input[required]:not([type=checkbox])').all()){
  const key=await input.getAttribute('data-setup-field');
  const vals={directorBirth:'1980',directorEduYears:'20',directorLeadYears:'10',directorUniversity:'Демо-вуз',directorSpecialty:'Педагогика'};
  await input.fill(vals[key]??'Демо-данные');
 }
 for(const select of await profile.locator('select[required]').all()){
  const val=await select.locator('option').nth(1).getAttribute('value');await select.selectOption(val);
 }
 for(const cls of await profile.locator('[data-setup-class]').all()){
  const key=await cls.getAttribute('data-setup-class');await pickClass(cls,key==='teacherClasses'?teacherClass:'5А',(await cls.locator('[data-add-class]').count())>0);
 }
 if(role==='school-library-head')await profile.locator('[data-setup-group=libraryFunds]').first().check();
}
export async function fillStartupProfile(scope,{
 first='Демо',
 last='Озмоиш',
 birthYear='15.05.1985',
 gender='male',
 specialty='Педагогика',
 eduYears='10',
 education='higher',
 institutionType='school',
 institutionShifts='one',
 login,
 password='Password123',
 teacherClass='5Б',
}={}){
 await scope.locator('#firstName').fill(first);
 await scope.locator('#lastName').fill(last);
 await scope.locator('#birthYear').fill(birthYear);
 await scope.locator('#genderSelect').selectOption(gender);
 await scope.locator('#specialtyInput').fill(specialty);
 await scope.locator('#eduYearsInput').fill(eduYears);
 await scope.locator('#educationSelect').selectOption(education);
 await scope.locator('#institutionTypeSelect').selectOption(institutionType);
 await scope.locator('#institutionShiftsSelect').selectOption(institutionShifts);
 const loginInp=scope.locator('#regLogin');
 if(await loginInp.isVisible()){
  const effectiveLogin=login!==undefined?login:`test_${Date.now().toString(36)}`;
  if(effectiveLogin){
   await loginInp.fill(effectiveLogin);
   await scope.locator('#regPassword').fill(password||'Password123');
   await scope.locator('#regPassword2').fill(password||'Password123');
  }
 }
 await fillRoleFields(scope.locator('[data-step="3"]'),{teacherClass});
}
export async function chooseInitialSchool(page,id='demo-a'){
 await page.locator('#schoolChoice').selectOption(id);
 await page.locator('#begin').click();
}

export async function installMockSupabase(target,opts={}){
 const maorifId='22222222-2222-4222-8222-222222222001';
 const userId='33333333-3333-4333-8333-333333333001';
 const memId='44444444-4444-4444-8444-444444444001';
 const schools=opts.schools??[
  {id:TEST_SCHOOL_UUID_1,name:'МТМУ № 1',region_name:'Суғд',district_name:'Хуҷанд',school_code:'SM-001',kind:'school'},
  {id:TEST_SCHOOL_UUID_4,name:'МТМУ № 4',region_name:'Суғд',district_name:'Хуҷанд',school_code:'SM-004',kind:'school'},
  {id:TEST_SCHOOL_UUID_88,name:'МТМУ № 88',region_name:'Суғд',district_name:'Хуҷанд',school_code:'SM-088',kind:'school'},
 ];
 const authorities=opts.authorities??[
  {id:maorifId,name:'Маорифи Хуҷанд',authority_tier:'maorif',region_name:'Суғд',district_name:'Хуҷанд'},
 ];
 let lastReg=null;
 let createdSchool=null;
 let cloudStudents=[];
 let cloudWorkloads=[];
 let cloudStudentRequests=[];
 await target.route('https://*.supabase.co/**',async route=>{
  const req=route.request();
  const url=new URL(req.url());
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname.endsWith('/rest/v1/rpc/submit_student_update_request')&&req.method()==='POST'){
   const body=req.postDataJSON()||{};
   const rec={
    id:`req-${cloudStudentRequests.length+1}`,
    organization_id:body.p_org_id,
    class_code:body.p_class_code||'',
    action_type:body.p_action_type||'import',
    replace_class:Boolean(body.p_replace_class),
    rows_payload:body.p_rows_payload||[],
    summary_text:body.p_summary_text||'',
    requested_by_name:body.p_requested_by_name||'Корманд',
    requested_by_position:body.p_requested_by_position||'',
    status:'pending',
    created_at:new Date().toISOString(),
   };
   cloudStudentRequests.unshift(rec);
   return json(rec.id);
  }
  if(url.pathname.endsWith('/rest/v1/student_update_requests')&&req.method()==='GET'){
   return json(cloudStudentRequests);
  }
  if(url.pathname.endsWith('/rest/v1/rpc/upsert_school_students')&&req.method()==='POST'){
   const body=req.postDataJSON()||{};
   const rows=Array.isArray(body.p_rows)?body.p_rows:[];
   if(body.p_replace_class){
    const rc=String(body.p_replace_class).toUpperCase();
    cloudStudents=cloudStudents.filter(r=>String(r.class_code||'').toUpperCase()!==rc);
   }
   for(const r of rows){
    const id=r.id||`stu-${cloudStudents.length+1}`;
    const idx=cloudStudents.findIndex(x=>x.id===id||(x.full_name===r.full_name&&x.class_code===r.class_code));
    const entry={...r,id,organization_id:body.p_org_id};
    if(idx>=0)cloudStudents[idx]=entry;else cloudStudents.push(entry);
   }
   return json(cloudStudents.length);
  }
  if(url.pathname.endsWith('/rest/v1/school_students')&&req.method()==='GET'){
   return json(cloudStudents);
  }
  if(url.pathname.endsWith('/rest/v1/rpc/upsert_teacher_workload')&&req.method()==='POST'){
   const body=req.postDataJSON()||{};
   const id=body.p_workload_id||`wk-${cloudWorkloads.length+1}`;
   const entry={
    id,
    organization_id:body.p_org_id,
    teacher_name:body.p_teacher_name||'',
    category:body.p_category||'none',
    attestation_year:body.p_attestation_year||null,
    weekly_hours:Number(body.p_weekly_hours)||0,
    subject:body.p_subject||'',
    class_codes:body.p_class_codes||[],
    class_leadership:Boolean(body.p_class_leadership),
    notebook_check:Boolean(body.p_notebook_check),
    notes:body.p_notes||'',
   };
   const idx=cloudWorkloads.findIndex(x=>x.id===id||x.teacher_name===entry.teacher_name);
   if(idx>=0)cloudWorkloads[idx]=entry;else cloudWorkloads.push(entry);
   return json(id);
  }
  if(url.pathname.endsWith('/rest/v1/teacher_workloads')&&req.method()==='GET'){
   return json(cloudWorkloads);
  }
  if(url.pathname.endsWith('/rest/v1/rpc/get_registration_bootstrap')||(url.pathname.endsWith('/functions/v1/register-user')&&req.method()==='GET')){
   return json({schools,authorities,locations:[],tariffs:opts.tariffs??[]});
  }
  if(url.pathname.endsWith('/functions/v1/register-user')&&req.method()==='POST'){
   lastReg=req.postDataJSON();
   if(lastReg?.new_school){
    createdSchool={
     id:'99999999-9999-4999-8999-999999999099',
     name:lastReg.new_school.name||'МТМУ № 99',
     region_name:lastReg.new_school.region_name||'Суғд',
     district_name:lastReg.new_school.district_name||'Хуҷанд',
     kind:'school',
     verification_status:'pending',
    };
   }else{
    createdSchool=schools.find(s=>s.id===lastReg?.organization_id)||schools[0]||{id:TEST_SCHOOL_UUID_88,name:'МТМУ № 88',kind:'school'};
   }
   opts.onRegister?.(lastReg);
   return json({
    user_id:userId,
    login:lastReg?.login||'testuser',
    school:createdSchool,
    session:{access_token:'tok-test-1',refresh_token:'ref-test-1',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId}},
   },201);
  }
  if(url.pathname.endsWith('/auth/v1/token')&&req.method()==='POST'){
   return json({access_token:'tok-test-2',refresh_token:'ref-test-2',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId}});
  }
  if(url.pathname.endsWith('/rest/v1/rpc/get_my_workspace_context')){
   const org=createdSchool||schools[0];
   return json({
    user_id:userId,
    is_super_admin:false,
    profile:{
     full_name:lastReg?.full_name||'Озмоиш Тест',
     preferred_lang:lastReg?.preferred_lang||'tg',
     login_name:lastReg?.login||'testuser',
     profile_details:lastReg?.profile_details||{},
    },
    memberships:[{
     membership_id:memId,
     organization_id:org.id,
     organization_name:org.name,
     kind:org.kind||'school',
     region_name:org.region_name||'Суғд',
     district_name:org.district_name||'Хуҷанд',
     role:'staff',
     primary_position:lastReg?.primary_position||'school-teacher',
     extra_positions:lastReg?.extra_positions||[],
     custom_method_name:lastReg?.custom_method_name||'',
     aliya_enabled:Boolean(lastReg?.include_aliya),
     position_profiles:lastReg?.position_profiles||{},
     account_active:true,
     verification_status:opts.verificationStatus??'verified',
     subscription_status:'trial',
     subscription_months:1,
     subscription_days_left:30,
     max_devices:2,
    }],
   });
  }
  if(url.pathname.endsWith('/rest/v1/rpc/get_license_status')){
   const org=createdSchool||schools[0];
   return json({configured:true,organization_id:org.id,status:'trial',effective_status:'trial',plan_code:'trial',expires_at:new Date(Date.now()+30*86400_000).toISOString(),server_now:new Date().toISOString(),grace_days:30,access_allowed:true,days_left:30,grace_days_left:30,verification_status:opts.verificationStatus??'verified'});
  }
  if(url.pathname.endsWith('/rest/v1/rpc/claim_device_session')){
   return json({allowed:true,reason:'registered',verification_status:opts.verificationStatus??'verified',primary_position:lastReg?.primary_position||'school-teacher',extra_positions:lastReg?.extra_positions||[]});
  }
  return json([]);
 });
}

export const openView=(scope,id)=>scope.locator(`[data-open-view=${id}]`).click();
export const backView=scope=>scope.locator('.sm-view-bar button').click();
export async function homeView(scope){
 const back=scope.locator('.sm-view-bar button');
 for(let i=0;i<5&&await back.isVisible();i++)await back.click();
}
