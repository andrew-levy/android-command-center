(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.AndroidCliPanelLogic=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function parseCoords(value){
  const parts=String(value??'').trim().split(/[,\s]+/).filter(Boolean);
  if(parts.length!==2)return null;
  const lat=Number(parts[0]),lng=Number(parts[1]);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
 }

 function restoreOpenSections(savedUi,currentVersion){
  const migrated=savedUi?.openSections?.map((id)=>id==='project'?'build':id);
  return savedUi?.uiVersion===currentVersion?migrated:(migrated?.filter((id)=>id!=='device'&&id!=='toolchain')||['build']);
 }

 function buildAvailability(cliReady,projectReady=true){
  return {run:Boolean(cliReady&&projectReady),clean:Boolean(projectReady),sync:Boolean(projectReady)};
 }

 function canPlayRoute(adbReady,serial){
  return Boolean(adbReady&&String(serial||'').startsWith('emulator-'));
 }

 return {parseCoords,restoreOpenSections,buildAvailability,canPlayRoute};
});
