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
export async function chooseInitialSchool(page,id='demo-a'){
 await page.locator('#schoolChoice').selectOption(id);
 await page.locator('#begin').click();
}

export const openView=(scope,id)=>scope.locator(`[data-open-view=${id}]`).click();
export const backView=scope=>scope.locator('.sm-view-bar button').click();
export async function homeView(scope){
 const back=scope.locator('.sm-view-bar button');
 for(let i=0;i<5&&await back.isVisible();i++)await back.click();
}
