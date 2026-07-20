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

 function buildAvailability(cliReady,adbReady=true,targetCount=1){
  return {run:Boolean(cliReady&&adbReady&&targetCount>0),clean:true,sync:true};
 }

 function canPlayRoute(adbReady,serial){
  return Boolean(adbReady&&String(serial||'').startsWith('emulator-'));
 }

 function matchAvdDevices(devices,avds,startingAvdName){
  const remaining=[...(devices||[])];
  const avdMatches=(avds||[]).map((name)=>{
   let index=remaining.findIndex((device)=>device.avdName===name);
   if(index<0&&name===startingAvdName){
    const candidates=remaining
     .map((device,candidateIndex)=>({device,candidateIndex}))
     .filter(({device})=>!device.avdName&&String(device.serial||'').startsWith('emulator-'));
    if(candidates.length===1)index=candidates[0].candidateIndex;
   }
   const device=index<0?undefined:remaining.splice(index,1)[0];
   return {name,device};
  });
  return {avdMatches,connected:remaining};
 }

 return {parseCoords,restoreOpenSections,buildAvailability,canPlayRoute,matchAvdDevices};
});
