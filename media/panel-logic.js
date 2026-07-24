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

 function buildAvailability(cliReady,adbReady=true,targetCount=1,projectReady=true){
  return {
   run:Boolean(cliReady&&adbReady&&targetCount>0&&projectReady),
   clean:Boolean(projectReady),
   sync:Boolean(projectReady),
  };
 }

 function canPlayRoute(adbReady,serial){
  return Boolean(adbReady&&String(serial||'').startsWith('emulator-'));
 }

 const FONT_SCALE_PRESETS=[
  {id:'small',label:'S',value:0.85},
  {id:'default',label:'M',value:1},
  {id:'large',label:'L',value:1.15},
  {id:'largest',label:'XL',value:1.3},
 ];
 const ROTATION_PRESETS=[
  {id:'0',label:'0°',value:0},
  {id:'90',label:'90°',value:1},
  {id:'180',label:'180°',value:2},
  {id:'270',label:'270°',value:3},
 ];
 const BATTERY_LEVEL_PRESETS=[5,15,50,85,100];
 const COMMON_PERMISSIONS=[
  {id:'location',label:'Location',permission:'android.permission.ACCESS_FINE_LOCATION'},
  {id:'camera',label:'Camera',permission:'android.permission.CAMERA'},
  {id:'mic',label:'Mic',permission:'android.permission.RECORD_AUDIO'},
  {id:'notifications',label:'Alerts',permission:'android.permission.POST_NOTIFICATIONS'},
  {id:'contacts',label:'Contacts',permission:'android.permission.READ_CONTACTS'},
  {id:'calendar',label:'Calendar',permission:'android.permission.READ_CALENDAR'},
  {id:'phone',label:'Phone',permission:'android.permission.READ_PHONE_STATE'},
  {id:'nearby',label:'Nearby',permission:'android.permission.BLUETOOTH_CONNECT'},
  {id:'activity',label:'Activity',permission:'android.permission.ACTIVITY_RECOGNITION'},
 ];

 function parseEmulatorProfiles(output){
  return [...new Set(String(output||'')
   .split(/\r?\n/)
   .map((line)=>line.trim())
   .filter((line)=>line&&!/^(profile|name|available|device profiles|--)/i.test(line))
   .map((line)=>line.split(/\s+/)[0]||'')
   .filter((name)=>/^[A-Za-z0-9._-]+$/.test(name)))];
 }

 function canCreateEmulator(cliReady,emulatorCreateSupported){
  return Boolean(cliReady&&emulatorCreateSupported);
 }

 function canUseDeviceControls(adbReady,serial){
  return Boolean(adbReady&&serial);
 }

 function preferenceValueAfterTypeChange(previousType,nextType,value){
  const current=String(value??'');
  if(previousType==='boolean'&&nextType!=='boolean')return '';
  if(nextType==='boolean'&&!['true','false'].includes(current))return 'false';
  return current;
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

 return {
  parseCoords,
  restoreOpenSections,
  buildAvailability,
  canPlayRoute,
  parseEmulatorProfiles,
  canCreateEmulator,
  canUseDeviceControls,
  preferenceValueAfterTypeChange,
  matchAvdDevices,
  FONT_SCALE_PRESETS,
  ROTATION_PRESETS,
  BATTERY_LEVEL_PRESETS,
  COMMON_PERMISSIONS,
 };
});
