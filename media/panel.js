const vscode=acquireVsCodeApi();
const app=document.getElementById('app');
const {
 buildAvailability,
 canCreateEmulator,
 canPlayRoute,
 canUseDeviceControls,
 matchAvdDevices,
 parseCoords,
 restoreOpenSections,
 FONT_SCALE_PRESETS,
 ROTATION_PRESETS,
 BATTERY_LEVEL_PRESETS,
 COMMON_PERMISSIONS,
}=globalThis.AndroidCliPanelLogic;
const chevron='<svg class="chevron" viewBox="0 0 12 12" fill="none"><path d="m2.5 4.5 3.5 3 3.5-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const iconShapes={
 build:'<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5l-7.6 7.6a2.1 2.1 0 0 0 3 3z"/>',
 devices:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
 deeplinks:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
 inspector:'<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
 appdata:'<path d="m12 2 8 4-8 4-8-4zM4 10l8 4 8-4M4 14l8 4 8-4"/>',
 location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
 stream:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
 performance:'<path d="M4 19V5M4 19h16M8 15v4M12 11v8M16 7v12"/>',
 toolchain:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
 play:'<path d="m8 5 11 7-11 7z"/>',
 pause:'<path d="M9 5v14M15 5v14"/>',
 trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
 terminal:'<path d="m4 7 5 5-5 5M11 17h9"/>',
 crosshair:'<circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
 eraser:'<path d="m7 21-4-4 11-11 4 4zM14 6l4-4 4 4-4 4M7 21h14"/>',
 upload:'<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
 refresh:'<path d="M20 7h-5V2M4 17h5v5M18.5 9a7 7 0 0 0-11.8-3L4 9M5.5 15a7 7 0 0 0 11.8 3L20 15"/>',
 external:'<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
 camera:'<path d="M14.5 4 16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1.5-3z"/><circle cx="12" cy="13" r="4"/>',
 record:'<circle cx="12" cy="12" r="6"/>',
 sparkles:'<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7zM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7z"/>',
 save:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
 braces:'<path d="M8 3H6a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M20.5 15.5A9 9 0 0 1 8.5 3.5a9 9 0 1 0 12 12z"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>'
};
const icon=(name,className='')=>iconShapes[name]?'<svg class="ui-icon'+(className?' '+className:'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+iconShapes[name]+'</svg>':'';
const sectionIcons={build:'build',device:'devices',deeplinks:'deeplinks',inspector:'inspector',performance:'performance',database:'database',appdata:'appdata',location:'location',stream:'stream'};
const actionIcons={'build-run':'play','gradle-sync':'refresh',clean:'trash',logcat:'terminal',location:'crosshair','screenshot-save':'save','emulator-create':'plus','performance-start':'play','performance-stop':'stop','performance-reset':'refresh','performance-dump':'braces','db-refresh':'refresh','db-query':'play','db-push':'upload','app-packages':'refresh','app-force-stop':'stop','app-clear-cache':'eraser','app-clear-data':'trash'};
let state={devices:[],emulators:[],emulatorProfiles:[],variants:[],appPackages:[],database:{processes:[],databases:[],tables:[],query:'',dirty:false},cliAvailable:false,cliStatus:'checking',adbStatus:'checking',sqliteStatus:'checking',initializing:true};
let controlsSerial='';
let openDeviceMenu='';
const savedUi=vscode.getState?.()||{};
const uiVersion=2;
let openSections=new Set(restoreOpenSections(savedUi,uiVersion));
let testOpenSectionsApplied=false;
let deepLinkDraft=savedUi.deepLinkDraft||'';
let sqlDraft=savedUi.sqlDraft||'';
let runTargetMenuOpen=Boolean(savedUi.runTargetMenuOpen);
let streamSerial = savedUi.streamSerial || '';
let locationState={view:savedUi.locationView==='route'?'route':'point',trail:0,mode:'walk',multiplier:1,status:'idle',arc:0,elapsed:0,angle:0,last:0,lastPush:0,serial:'',error:'',coords:'',selection:null,map:{zoom:1,lat:0,lng:0}};
const trails=[
 {name:'Apple Park Loop',description:'A gentle loop around Apple Park',mode:'walk',loop:true,waypoints:[[37.33272,-122.00833,49],[37.33373,-122.00663,49],[37.33540,-122.00633,49],[37.33675,-122.00759,45],[37.33698,-122.00969,48],[37.33598,-122.01138,49],[37.33431,-122.01169,50],[37.33296,-122.01042,51]]},
 {name:'Golden Gate',description:'Bridge deck round trip with elevation',mode:'run',loop:true,waypoints:[[37.83212,-122.48065,30],[37.82649,-122.47940,30],[37.82074,-122.47873,59],[37.81498,-122.47806,66],[37.80923,-122.47734,44],[37.81498,-122.47795,66],[37.82074,-122.47865,59],[37.82649,-122.47935,30]]},
 {name:'Downtown Drive',description:'An urban loop for navigation testing',mode:'drive',loop:true,waypoints:[[37.78968,-122.40113,18],[37.78922,-122.39648,16],[37.78574,-122.39695,14],[37.78539,-122.40216,16],[37.78760,-122.40434,19]]}
];
let prepared=prepare(trails[0]);
const worldPolygons=decodeWorld(globalThis.WORLD_LAND);
let mapPointer=null;
let mapDirty=true;
const send=(type,extra={})=>vscode.postMessage({type,...extra});
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const saveUi=()=>vscode.setState?.({uiVersion,deepLinkDraft,sqlDraft,locationView:locationState.view,runTargetMenuOpen,streamSerial,openSections:[...openSections]});
const captureScrollState=()=>({page:{left:document.scrollingElement?.scrollLeft||0,top:document.scrollingElement?.scrollTop||0},regions:new Map([...app.querySelectorAll('[data-preserve-scroll]')].map((el)=>[el.dataset.preserveScroll,{left:el.scrollLeft,top:el.scrollTop}]))});
const restoreScrollState=(snapshot)=>{for(const el of app.querySelectorAll('[data-preserve-scroll]')){const position=snapshot.regions.get(el.dataset.preserveScroll);if(position){el.scrollLeft=position.left;el.scrollTop=position.top}}if(document.scrollingElement){document.scrollingElement.scrollLeft=snapshot.page.left;document.scrollingElement.scrollTop=snapshot.page.top}};
const section=(id,title,status,body)=>'<details class="tool-section" data-section="'+id+'"'+(openSections.has(id)?' open':'')+'><summary><span class="section-title">'+icon(sectionIcons[id])+'<span>'+esc(title)+'</span></span><span class="section-status">'+status+'</span>'+chevron+'</summary><div class="section-body">'+body+'</div></details>';
const group=(rows)=>'<div class="settings-group">'+rows+'</div>';
const row=(label,controls,labelClass='',sublabel='')=>'<div class="row"><span class="row-copy"><span class="row-label'+(labelClass?' '+labelClass:'')+'">'+esc(label)+'</span>'+(sublabel?'<span class="row-sublabel">'+esc(sublabel)+'</span>':'')+'</span><span class="row-controls">'+controls+'</span></div>';
const selectWrap=(id,options,{disabled=false,label='',title=''}={})=>'<span class="select-wrap"><select id="'+id+'"'+(disabled?' disabled':'')+(label?' aria-label="'+esc(label)+'"':'')+(title?' title="'+esc(title)+'"':'')+'>'+options+'</select></span>';
const operationVisual=(op,fallback)=>{const status=op?.status||'idle';const transient=status==='running'?'<span class="spinner"></span>':status==='success'?'<span class="spinner completing"></span><span class="action-result success">✓</span>':status==='success-exit'?'<span class="action-result success exiting">✓</span>':status==='error'?'<span class="action-result error">!</span>':status==='error-exit'?'<span class="action-result error exiting">!</span>':'';return '<span class="action-icon-slot '+status+'" aria-hidden="true">'+fallback+transient+'</span>'};
const actionButton=(id,label,kind='pill',disabled=false,busy=false)=>{const op=state.operation?.id===id?state.operation:(busy?{status:'running'}:null);const running=op?.status==='running';return '<button class="'+kind+' action-button" data-action="'+id+'"'+(running||disabled?' disabled':'')+(running?' aria-busy="true"':'')+'>'+operationVisual(op,icon(actionIcons[id]))+'<span>'+esc(label)+'</span></button>'};
const sectionFooter=(message,id,disabled=false,busy=false)=>{const op=state.operation?.id===id?state.operation:(busy?{status:'running'}:null),running=op?.status==='running';return '<div class="section-footer"><span class="section-footer-message">'+esc(message||'')+'</span><button class="section-refresh action-button" data-action="'+id+'" type="button" title="'+esc(op?.message||'Refresh')+'"'+(running||disabled?' disabled':'')+(running?' aria-busy="true"':'')+'>'+operationVisual(op,icon(actionIcons[id]))+'<span>Refresh</span></button></div>'};
const ALL_SECTIONS=['build','device','deeplinks','inspector','performance','database','appdata','location','stream','toolchain'];
window.addEventListener('message',({data})=>{
 if(data.type==='state'){
  state=data.state;
  if(!testOpenSectionsApplied&&Array.isArray(state.testOpenSections)){openSections=new Set(state.testOpenSections);testOpenSectionsApplied=true}
  if(!deepLinkDraft&&state.deepLinkPrefixes?.length)deepLinkDraft=state.deepLinkPrefixes[0];
  if(state.database?.query!=null&&document.activeElement?.id!=='db-sql')sqlDraft=state.database.query;
  render();
 }
 if(data.type==='expand-all'){openSections=new Set(ALL_SECTIONS);saveUi();render()}
 if(data.type==='collapse-all'){openSections=new Set();saveUi();render()}
 if(data.type==='location-result'){locationState.error=data.ok?'':data.error;updateLocationText()}
});
render();
send('ready');
document.addEventListener('pointerdown',(event)=>{if(runTargetMenuOpen&&event.target instanceof Element&&!event.target.closest('.run-target-picker'))setRunTargetMenuOpen(false)});
document.addEventListener('keydown',(event)=>{if(event.key==='Escape'&&runTargetMenuOpen){setRunTargetMenuOpen(false);document.getElementById('run-target-trigger')?.focus()}});

function render(){
 const scrollState=captureScrollState();
 const devices=state.devices||[],online=devices.filter((d)=>d.state==='device'),locationDevices=online.filter((d)=>d.serial.startsWith('emulator-')),avds=state.emulators||[];
 if(online.length&&!online.some((d)=>d.serial===streamSerial))streamSerial=online[0].serial;
 if(!locationDevices.some((d)=>d.serial===locationState.serial))locationState.serial=locationDevices[0]?.serial||'';
 if(locationState.status==='playing'&&state.adbStatus!=='checking'&&!canPlayRoute(state.adbStatus==='ready',locationState.serial)){locationState.status='paused';locationState.error='Start and select an emulator to continue the route.'}
 const optionsFor=(serial)=>online.length?online.map((d)=>'<option value="'+esc(d.serial)+'"'+(d.serial===(serial||online[0]?.serial)?' selected':'')+'>'+esc(d.description)+'</option>').join(''):'<option value="">No device online</option>';
 const deviceOptions=online.length?online.map((d)=>'<option value="'+esc(d.serial)+'"'+(d.serial===locationState.serial?' selected':'')+'>'+esc(d.description)+'</option>').join(''):'<option value="">No device online</option>';
 const locationOptions=locationDevices.length?locationDevices.map((d)=>'<option value="'+esc(d.serial)+'"'+(d.serial===locationState.serial?' selected':'')+'>'+esc(d.description)+'</option>').join(''):'<option value="">Start an emulator first</option>';
 const variants=state.variants||[],selected=state.selectedVariant||variants[0]?.id||'';
 const cliReady=state.cliStatus==='ready',adbReady=state.adbStatus==='ready',sqliteReady=state.sqliteStatus==='ready';
 if(!online.some((d)=>d.serial===controlsSerial))controlsSerial=state.controlsSerial||online[0]?.serial||'';
 if(openDeviceMenu&&!online.some((d)=>d.serial===openDeviceMenu))openDeviceMenu='';
 const build=buildSection(variants,selected,cliReady,adbReady);
 const deviceStatus='<span class="location-live"><span class="status-dot '+(online.length?'on':'')+'"></span>'+online.length+' online</span>';
 const device=section('device','Devices',deviceStatus,deviceSection(devices,avds,cliReady,adbReady));
 const inspector=inspectorSection(cliReady,adbReady,online);
 const performance=performanceSection(optionsFor(state.performance?.serial||state.appPackagesSerial),adbReady);
 const database=databaseSection(optionsFor(state.database?.serial),adbReady,sqliteReady);
 const appData=appDataSection(optionsFor(state.appPackagesSerial),adbReady);
 const stream=section('stream','Stream','Logcat',group(row('Device',selectWrap('stream-device',optionsFor(streamSerial),{disabled:!online.length,label:'Logcat device'}),'','Log source')+row('Device logs',actionButton('logcat','Start','secondary compact',!adbReady||!online.length),'','Live Logcat output')));
 const loadingToast=state.initializing?'<div class="loading-toast" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>Loading tools, devices, and app data…</span></div>':'';
 const errorToast=state.error?'<div class="error-toast'+(state.errorExiting?' exiting':'')+'" role="alert" aria-live="assertive"><span class="error-toast-icon" aria-hidden="true">!</span><span class="error-toast-message">'+esc(state.error)+'</span><button class="error-toast-close" id="dismiss-error" type="button" aria-label="Dismiss error">×</button></div>':'';
 app.innerHTML=(state.busy?'<div class="busybar"><span>'+esc(state.busy)+'</span></div>':'')+loadingToast+errorToast+build+device+deepLinkSection(deviceOptions,adbReady)+inspector+performance+database+appData+locationSection(locationOptions,adbReady)+stream+toolchainSection();
 bind();
 restoreScrollState(scrollState);
}

function toolchainSection(){
 const cliReady=state.cliStatus==='ready',adbReady=state.adbStatus==='ready',sqliteReady=state.sqliteStatus==='ready';
 const allReady=cliReady&&adbReady&&sqliteReady;
 const checking=state.cliStatus==='checking'||state.adbStatus==='checking'||state.sqliteStatus==='checking';
 const open=openSections.has('toolchain');
 const dot=allReady?' on':checking?' checking':' err';
 const label=allReady?'Toolchain ready':checking?'Checking toolchain…':'Finish setup';
 const environment=state.environment||'extension host';
 const rows='<div class="dependency-list">'+dependencyRow('Android CLI',state.cliStatus,state.cliVersion,state.cliMessage)+dependencyRow('Platform tools',state.adbStatus,state.adbVersion,state.adbMessage)+dependencyRow('SQLite',state.sqliteStatus,state.sqliteVersion,state.sqliteMessage)+'</div>';
 const cliAction=state.cliStatus==='missing'
  ?'<button class="primary" data-setup="dependency-install-cli">Prepare install</button><button class="secondary" data-setup="dependency-choose-cli">Choose file…</button>'
  :state.cliStatus==='error'?'<button class="primary" data-setup="dependency-choose-cli">Choose file…</button>':'';
 const adbAction=cliReady&&state.adbStatus==='missing'
  ?'<button class="primary" data-setup="dependency-install-adb">Prepare platform tools</button><button class="secondary" data-setup="dependency-choose-adb">Choose adb…</button>'
  :state.adbStatus==='error'?'<button class="secondary" data-setup="dependency-choose-adb">Choose adb…</button>':'';
 const sqliteAction=!sqliteReady&&state.sqliteStatus!=='checking'
  ?'<button class="secondary" data-setup="dependency-choose-sqlite">Choose sqlite3…</button>':'';
 const actions=cliAction+adbAction+sqliteAction;
 const textActions='<div class="toolchain-actions"><button class="text-button" data-setup="dependency-settings">'+icon('settings')+'Settings</button><button class="text-button" data-setup="dependency-retry"'+(checking?' disabled':'')+'>'+icon('refresh')+'Check again</button></div>';
 return '<details class="toolchain" data-section="toolchain"'+(open?' open':'')+' aria-label="Android toolchain"><summary>'+icon('toolchain','toolchain-icon')+'<span class="status-dot'+dot+'" aria-hidden="true"></span><span class="toolchain-label">'+label+'</span><span class="toolchain-env" title="'+esc(environment)+'">'+esc(environment)+'</span>'+chevron+'</summary><div class="section-body" data-preserve-scroll="toolchain">'+rows+(actions?'<div class="setup-actions">'+actions+'</div>':'')+textActions+'</div></details>';
}

function dependencyRow(name,status,version,message){
 const label={checking:'Checking…',ready:'Ready',missing:'Not found',error:'Needs attention'}[status]||'Unknown';
 const detail=status==='ready'?(version||'Available'):status==='checking'?'Looking in PATH and settings':message||'Choose an executable or install it';
 const dot=status==='ready'?' on':status==='checking'?' checking':' err';
 return '<div class="dependency-row '+esc(status)+'"><span class="status-dot'+dot+'" aria-hidden="true"></span><span class="dependency-copy"><strong>'+esc(name)+'</strong><span title="'+esc(detail)+'">'+esc(detail)+'</span></span><span class="dependency-state">'+esc(label)+'</span></div>';
}

function buildSection(variants,selected,cliReady,adbReady){
 const active=variants.find((variant)=>variant.id===selected),label=active?.label||'Default target';
 const selectedIds=new Set(state.selectedRunTargets||[]),selectedTargets=(state.runTargets||[]).filter((target)=>target.status==='online'&&selectedIds.has(target.id));
 const availability=buildAvailability(cliReady,adbReady,selectedTargets.length);
 const options=variants.map((variant)=>'<option value="'+esc(variant.id)+'"'+(variant.id===selected?' selected':'')+'>'+esc(variant.label)+'</option>').join('');
 const running=state.operation?.id==='build-run'&&state.operation.status==='running';
 const body=group(
  row('Variant',selectWrap('build-variant',options,{label:'Build variant',title:label}),'','Gradle target')
  +row('Run on',runTargetPicker(state.runTargets||[],selectedIds,running),'','Deployment targets')
  +row('Run app',actionButton('build-run','Run','primary compact',!availability.run),'','Build + launch')
  +row('Clean',actionButton('clean','Clean','secondary compact',!availability.clean),'','Remove outputs')
  +row('Gradle Sync',actionButton('gradle-sync','Sync','secondary compact',!availability.sync),'','Refresh dependencies')
 );
 return section('build','Build',esc(label),body);
}

function runTargetPicker(targets,selectedIds,busy){
 const active=targets.filter((target)=>target.status==='online'),selected=active.filter((target)=>selectedIds.has(target.id));
 const summary=selected.length?selected.length+' '+(selected.length===1?'target':'targets'):'No active targets';
 const names=selected.map((target)=>target.label).join(', ')||'Choose deployment targets';
 const options=active.length?runTargetGroup('Active',active,selectedIds,busy):'<div class="run-target-empty">No active devices</div>';
 const note='<div class="run-target-note"><span>Only active devices can be selected.</span><button id="open-devices-from-targets" class="run-target-devices-link" type="button">Devices</button></div>';
 const pickerChevron='<svg class="picker-chevron" viewBox="0 0 12 12" fill="none"><path d="m2.5 4.5 3.5 3 3.5-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 return '<div class="run-target-picker"><button id="run-target-trigger" class="run-target-trigger" type="button" aria-expanded="'+runTargetMenuOpen+'" aria-controls="run-target-menu" aria-haspopup="true" title="'+esc(names)+'">'+icon('phone')+'<span>'+esc(summary)+'</span>'+pickerChevron+'</button><div id="run-target-menu" class="run-target-menu" role="group" aria-label="Deployment targets" data-preserve-scroll="run-target-menu"'+(runTargetMenuOpen?'':' hidden')+'>'+options+note+'</div></div>';
}

function runTargetGroup(title,targets,selectedIds,busy){
 return '<div class="run-target-group" role="group" aria-label="'+esc(title)+'"><div class="run-target-group-title">'+esc(title)+'</div>'+targets.map((target)=>{const checked=selectedIds.has(target.id),disabled=busy||!target.selectable,status=target.serial||'Online';return '<label class="run-target-option'+(disabled?' disabled':'')+'"><input class="run-target-checkbox" type="checkbox" data-target-id="'+esc(target.id)+'"'+(checked?' checked':'')+(disabled?' disabled':'')+'><span class="status-dot on" aria-hidden="true"></span><span class="run-target-copy"><strong>'+esc(target.label)+'</strong><span>'+esc(status)+'</span></span></label>'}).join('')+'</div>';
}

function deviceSection(devices,avds,cliReady,adbReady){
 return '<div class="device-section">'+deviceGrid(devices,avds,adbReady)+emulatorCreateRow(cliReady)+'</div>';
}

function deviceGrid(devices,avds,adbReady){
 const operation=state.operation,startingAvdName=operation?.status==='running'&&operation.id?.startsWith('device:')?operation.id.slice(7):'';
 const {avdMatches,connected}=matchAvdDevices(devices,avds,startingAvdName);
 const avdCards=avdMatches.map(({name,device})=>deviceCard({name,device,virtual:true,adbReady}));
 const connectedCards=connected.map((device)=>deviceCard({name:device.description,device,virtual:device.serial.startsWith('emulator-'),adbReady}));
 const cards=[...avdCards,...connectedCards];
 return '<div class="device-grid">'+(cards.length?cards.join(''):'<div class="empty-card dotted"><strong>No devices yet</strong><span>Create an emulator profile to get started.</span></div>')+'</div>';
}

function emulatorCreateRow(cliReady){
 const supported=state.emulatorCreateSupported!==false;
 const ready=canCreateEmulator(cliReady,supported);
 const profiles=state.emulatorProfiles?.length?state.emulatorProfiles:['medium_phone'];
 const selected=profiles.includes(state.selectedEmulatorProfile)?state.selectedEmulatorProfile:profiles[0];
 const options=profiles.map((profile)=>'<option value="'+esc(profile)+'"'+(profile===selected?' selected':'')+'>'+esc(profile.replaceAll('_',' '))+'</option>').join('');
 const hint=!supported?'Unavailable on Windows':!cliReady?'Needs Android CLI':'Choose a device profile';
 const createOp=state.operation?.id==='emulator-create'?state.operation:null;
 return group(
  row('Create AVD',selectWrap('emulator-profile',options,{disabled:!ready,label:'Emulator profile',title:selected})+actionButton('emulator-create','Create','secondary compact',!ready,createOp?.status==='running'),'',hint)
 );
}

function overlayToggle(id,label,active,enabled){
 return '<button class="segment'+(active?' active':'')+'" data-overlay="'+id+'" data-enabled="'+(active?0:1)+'"'+(enabled?'':' disabled')+'>'+esc(label)+'</button>';
}

function deviceCard({name,device,virtual,adbReady}){
 const online=device?.state==='device';
 const serial=device?.serial||'';
 const id=serial||name;
 const op=state.operation?.id===`device:${id}`?state.operation:null;
 const running=op?.status==='running';
 const cliReady=state.cliStatus==='ready';
 const actionIcon=operationVisual(op,icon(online?'stop':'play'));
 const action=online&&virtual
  ?'<button class="pill danger-button device-action-button" data-stop="'+esc(serial)+'"'+(running||!adbReady?' disabled':'')+(running?' aria-busy="true"':'')+'>'+actionIcon+'<span>Stop</span></button>'
  :!online&&virtual
   ?'<button class="pill device-action-button" data-start="'+esc(name)+'"'+(running||!cliReady?' disabled':'')+(running?' aria-busy="true"':'')+'>'+actionIcon+'<span>Start</span></button>'
   :'';
 const menuOpen=online&&openDeviceMenu===serial;
 const gear=online
  ?'<button class="device-gear'+(menuOpen?' active':'')+'" data-device-menu="'+esc(serial)+'" title="Device settings" aria-label="Device settings" aria-expanded="'+(menuOpen?'true':'false')+'"'+(adbReady?'':' disabled')+'>'+icon('settings')+'</button>'
  :'';
 const menu=menuOpen?deviceSettingsMenu(device,adbReady):'';
 return '<article class="device-card '+(online?'online':'')+(menuOpen?' menu-open':'')+'">'
  +'<div class="device-card-head"><div class="device-icon">'+icon('phone')+'</div><div class="device-card-tools"><span class="status-dot '+(online?'on':'')+'"></span>'+gear+'</div></div>'
  +'<strong title="'+esc(name)+'">'+esc(name.replaceAll('_',' '))+'</strong>'
  +'<span class="device-meta">'+esc(serial||(virtual?'Available emulator':'Connected device'))+'</span>'
  +'<div class="device-actions">'+action+'</div>'
  +menu
  +'</article>';
}

function deviceSettingsMenu(device,adbReady){
 const serial=device.serial;
 const controls=state.deviceControls?.serial===serial?state.deviceControls:undefined;
 const enabled=canUseDeviceControls(adbReady,serial);
 const rotation=controls?.rotation??0;
 const fontScale=controls?.fontScale??1;
 const theme=device.theme||'auto';
 const themeControls='<div class="theme-toggle" aria-label="Device appearance"><button data-theme="light" data-serial="'+esc(serial)+'" class="'+(theme==='light'?'active':'')+'" title="Use light mode"'+(enabled?'':' disabled')+'>'+icon('sun')+'</button><button data-theme="dark" data-serial="'+esc(serial)+'" class="'+(theme==='dark'?'active':'')+'" title="Use dark mode"'+(enabled?'':' disabled')+'>'+icon('moon')+'</button></div>';
 const rotationControls='<div class="segmented control-segmented" role="group" aria-label="Rotation">'+ROTATION_PRESETS.map((item)=>'<button class="segment'+(item.value===rotation?' active':'')+'" data-rotate="'+item.value+'" data-serial="'+esc(serial)+'"'+(enabled?'':' disabled')+'>'+esc(item.label)+'</button>').join('')+'</div>';
 const fontControls='<div class="segmented control-segmented" role="group" aria-label="Font scale">'+FONT_SCALE_PRESETS.map((item)=>'<button class="segment'+(item.value===fontScale?' active':'')+'" data-font="'+item.value+'" data-serial="'+esc(serial)+'"'+(enabled?'':' disabled')+'>'+esc(item.label)+'</button>').join('')+'</div>';
 const overlays='<div class="segmented control-segmented" role="group" aria-label="Developer overlays">'
  +overlayToggle('bounds','Bounds',controls?.layoutBounds,enabled)
  +overlayToggle('touches','Taps',controls?.showTouches,enabled)
  +overlayToggle('pointer','Pointer',controls?.pointerLocation,enabled)
  +'</div>';
 const isEmulator=serial.startsWith('emulator-');
 const batteryLevel=controls?.batteryLevel;
 const batteryOptions=BATTERY_LEVEL_PRESETS.map((level)=>'<option value="'+level+'"'+(batteryLevel===level?' selected':'')+'>'+level+'%</option>').join('');
 const batteryBlock=isEmulator
  ?'<div class="device-menu-group"><div class="device-menu-heading">Emulator</div>'
    +'<div class="device-menu-row"><span>Battery</span>'+selectWrap('battery-level',batteryOptions,{disabled:!enabled,label:'Battery level'})+'</div>'
    +'<div class="device-menu-row"><span>Power</span><button class="secondary compact" data-battery-charging="'+(controls?.batteryCharging?0:1)+'" data-serial="'+esc(serial)+'"'+(enabled?'':' disabled')+'>'+(controls?.batteryCharging?'Unplug':'Plug in')+'</button></div>'
    +'</div>'
  :'';
 return '<div class="device-menu" role="dialog" aria-label="Device settings">'
  +'<div class="device-menu-head"><strong>Settings</strong><button class="device-menu-close" data-device-menu-close="'+esc(serial)+'" aria-label="Close settings">×</button></div>'
  +'<div class="device-menu-body" data-preserve-scroll="device-menu">'
  +'<div class="device-menu-group"><div class="device-menu-heading">Appearance</div>'
  +'<div class="device-menu-row"><span>Theme</span>'+themeControls+'</div>'
  +'<div class="device-menu-row"><span>Rotate</span>'+rotationControls+'</div>'
  +'<div class="device-menu-row"><span>Font</span>'+fontControls+'</div>'
  +'</div>'
  +batteryBlock
  +'<div class="device-menu-group"><div class="device-menu-heading">Overlays</div>'
  +'<div class="device-menu-row overlays">'+overlays+'</div>'
  +'</div>'
  +'</div></div>';
}

function inspectorAction(id,iconName,title,description,disabled=false){const op=state.operation?.id===id?state.operation:null,running=op?.status==='running';return '<button class="inspector-tile" data-action="'+id+'" title="'+esc(description)+'"'+(running||disabled?' disabled':'')+(running?' aria-busy="true"':'')+'>'+operationVisual(op,icon(iconName))+'<span>'+esc(title)+'</span></button>'}

function performanceSection(deviceOptions,adbReady){
 const perf=state.performance||{monitoring:false,frameTimesMs:[],issues:[]};
 const packages=state.appPackages?.length?state.appPackages:(state.selectedAppPackage||state.applicationId||perf.packageName?[state.selectedAppPackage||state.applicationId||perf.packageName]:[]);
 const selectedPackage=packages.includes(perf.packageName)?perf.packageName:(packages.includes(state.selectedAppPackage)?state.selectedAppPackage:(packages[0]||''));
 const packageOptions=packages.length
  ?packages.map((name)=>'<option value="'+esc(name)+'"'+(name===selectedPackage?' selected':'')+'>'+esc(name)+'</option>').join('')
  :'<option value="">Scan apps in App data</option>';
 const ready=adbReady&&Boolean(selectedPackage)&&(state.devices||[]).some((device)=>device.state==='device');
 const status=perf.monitoring
  ?'<span class="location-live"><span class="status-dot on"></span>Live</span>'
  :ready?'Ready':!adbReady?'Needs ADB':'Pick a package';
 const fps=perf.fps!=null?String(perf.fps):'—';
 const jank=perf.jankPercent!=null?Math.round(perf.jankPercent)+'%':'—';
 const memory=perf.memoryMb!=null?Math.round(perf.memoryMb):'—';
 const slow=perf.slowFrames!=null?String(perf.slowFrames):'—';
 const jankTone=perf.jankPercent!=null&&perf.jankPercent>=5?' warn':'';
 const slowTone=perf.slowFrames!=null&&perf.slowFrames>0?' warn':'';
 const vitals='<div class="perf-vitals">'
  +'<div class="perf-vital"><strong>'+esc(fps)+'</strong><span>FPS</span></div>'
  +'<div class="perf-vital'+jankTone+'"><strong>'+esc(jank)+'</strong><span>jank</span></div>'
  +'<div class="perf-vital"><strong>'+esc(memory)+'</strong><span>MB</span></div>'
  +'<div class="perf-vital'+slowTone+'"><strong>'+esc(slow)+'</strong><span>slow</span></div>'
  +'</div>';
 const spark=performanceSparkline(perf.frameTimesMs||[]);
 const actions=perf.monitoring
  ?actionButton('performance-stop','Stop','secondary compact')+actionButton('performance-reset','Reset','secondary compact')+actionButton('performance-dump','Dump','secondary compact')
  :actionButton('performance-start','Monitor','primary compact',!ready)+actionButton('performance-reset','Reset','secondary compact',!ready)+actionButton('performance-dump','Dump','secondary compact',!ready);
 const issues=(perf.issues||[]).length
  ?'<div class="perf-issues"><div class="micro-heading"><span>Issues</span><span>'+perf.issues.length+'</span></div>'+perf.issues.map((item)=>'<div class="perf-issue">'+esc(item)+'</div>').join('')+'</div>'
  :perf.monitoring?'<p class="muted">Sampling FPS, jank, and memory…</p>':'<p class="muted">Start monitoring to sample FPS, jank, and memory.</p>';
 const body=group(
  row('Device',selectWrap('perf-device',deviceOptions,{disabled:!adbReady||perf.monitoring,label:'Performance device'}),'','Sample target')
  +row('Package',selectWrap('perf-package',packageOptions,{disabled:!packages.length||perf.monitoring,label:'Performance package'}),'','App process')
  +row('Controls','<div class="action-strip perf-actions">'+actions+'</div>','',perf.monitoring?'Live sample':'gfxinfo + meminfo')
 )+vitals+spark+issues+(perf.error?'<div class="location-error">'+esc(perf.error)+'</div>':'');
 return section('performance','Performance',status,body);
}

function performanceSparkline(values){
 if(!values.length){
  return '<div class="perf-spark empty dotted" aria-hidden="true"><span>frame time</span></div>';
 }
 const width=240,height=42,pad=3;
 const max=Math.max(20,...values);
 const step=values.length>1?(width-pad*2)/(values.length-1):0;
 const points=values.map((value,index)=>{
  const x=pad+index*step;
  const y=height-pad-((Math.min(max,value)/max)*(height-pad*2));
  return x.toFixed(1)+','+y.toFixed(1);
 }).join(' ');
 const threshold=height-pad-((16.67/max)*(height-pad*2));
 return '<div class="perf-spark" role="img" aria-label="Frame time sparkline">'
  +'<svg viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none">'
  +'<line class="perf-threshold" x1="0" y1="'+threshold.toFixed(1)+'" x2="'+width+'" y2="'+threshold.toFixed(1)+'"/>'
  +'<polyline class="perf-line" points="'+points+'"/>'
  +'</svg><span>frame time</span></div>';
}

function inspectorSection(cliReady,adbReady,online){
 const recording=Boolean(state.recording?.active);
 const status=recording?'Recording…':state.screenshot?(state.screenshotSaved?'Saved':'Unsaved preview'):cliReady||adbReady?'Ready':!cliReady?'Needs CLI':'Needs ADB';
 const preview=state.screenshot
  ?'<div class="inspector-preview"><img class="preview" src="'+esc(state.screenshot)+'" alt="Latest device screenshot"><div class="inspector-preview-footer"><span>'+esc(state.screenshotSaved?'Saved copy':'Not saved')+'</span>'+actionButton('screenshot-save','Save as…','secondary compact')+'</div></div>'
  :'<div class="inspector-empty dotted"><span class="inspector-reticle" aria-hidden="true">'+icon('inspector')+'</span><strong>Device viewfinder</strong><span>Capture a screen or start a recording.</span></div>';
 const recordAction=recording
  ?inspectorAction('screen-record-stop','stop','Stop','Stop recording and save the video',!adbReady)
  :inspectorAction('screen-record-start','record','Record','Capture up to 3 minutes of device video',!adbReady||!online.length||recording);
 return section('inspector','Inspector',status,'<div class="inspector-shell">'+preview+'<div class="inspector-actions">'+inspectorAction('screenshot','camera','Capture','Take a clean device snapshot',!cliReady)+inspectorAction('screenshot-annotated','sparkles','Annotate','Capture with detected UI elements highlighted',!cliReady)+inspectorAction('layout','braces','Layout','Inspect the accessibility tree as JSON',!cliReady)+recordAction+'</div>'+(recording?'<div class="recording-banner"><span class="status-dot on"></span>Recording on '+esc(state.recording.serial)+'</div>':'')+'</div>');
}

function databaseSection(deviceOptions,adbReady,sqliteReady){
 const db=state.database||{processes:[],databases:[],tables:[],query:'',dirty:false};
 if(db.query&&!sqlDraft)sqlDraft=db.query;
 const processes=db.processes||[];
 const status=state.databaseScanning?'Scanning…':!sqliteReady?'Needs SQLite':db.dirty?'Unsaved push':db.selectedDatabase?db.selectedDatabase:processes.length?processes.length+' apps':'Debuggable';
 const processOptions=processes.length
  ?processes.map((item)=>'<option value="'+esc(item.packageName)+'"'+(item.packageName===db.packageName?' selected':'')+'>'+esc(item.label||item.packageName)+'</option>').join('')
  :'<option value="">Scan debuggable apps</option>';
 const dbOptions=(db.databases||[]).map((name)=>'<option value="'+esc(name)+'"'+(name===db.selectedDatabase?' selected':'')+'>'+esc(name)+'</option>').join('')||'<option value="">No databases</option>';
 const tableOptions=(db.tables||[]).map((name)=>'<option value="'+esc(name)+'"'+(name===db.selectedTable?' selected':'')+'>'+esc(name)+'</option>').join('')||'<option value="">No user tables</option>';
 const footerMessage=db.result?(db.message||db.result.message||(db.result.rows?.length+' row(s)')):(db.message||'');
 const result=db.result
  ?databaseResult(db.result,db.selectedTable)
  :'<p class="muted">Select an app to inspect its SQLite databases. Requires a debuggable build.</p>';
 const controls=group(
   row('Device',selectWrap('db-device',deviceOptions,{disabled:state.databaseScanning,label:'Database device'}),'','Query target')
   +row('App',selectWrap('db-package',processOptions,{disabled:!processes.length,label:'Debuggable app'}),'','Debuggable process')
   +row('Database',selectWrap('db-database',dbOptions,{disabled:!(db.databases?.length),label:'Database'}),'','On-device SQLite')
   +row('Table',selectWrap('db-table',tableOptions,{disabled:!(db.tables?.length),label:'Database table'}),'','Table to inspect')
  )
  +'<textarea id="db-sql" rows="4" spellcheck="false" aria-label="SQL query" placeholder="SELECT * FROM table LIMIT 50;">'+esc(sqlDraft||db.query||'')+'</textarea>'
  +'<div class="action-strip">'+actionButton('db-query','Run query','primary',!db.selectedDatabase)+actionButton('db-push','Push','secondary',!db.dirty)+'</div>'
  +(db.error?'<div class="location-error">'+esc(db.error)+'</div>':'')+result
  +sectionFooter(footerMessage,'db-refresh',!adbReady||!sqliteReady,state.databaseScanning);
 return section('database','Database',esc(status),controls);
}

function databaseResult(result,table){
 const columns=result.columns||[],rows=result.rows||[];
 if(!columns.length&&!rows.length)return '';
 const head='<tr>'+columns.map((column)=>'<th>'+esc(column==='__rowid__'?'rowid':column)+'</th>').join('')+'</tr>';
 const body=rows.map((row)=>{
  const rowid=columns.includes('__rowid__')?row[columns.indexOf('__rowid__')]:'';
  return '<tr>'+row.map((cell,index)=>{
   const column=columns[index];
   const editable=table&&rowid!==''&&rowid!=null&&column&&column!=='__rowid__';
   const display=cell===null?'NULL':cell;
   return '<td class="'+(cell===null?'db-null':'')+(editable?' db-editable':'')+'"'+(editable?' data-db-cell data-rowid="'+esc(rowid)+'" data-column="'+esc(column)+'" data-table="'+esc(table)+'" title="Click to edit"':'')+'>'+esc(display)+'</td>';
  }).join('')+'</tr>';
 }).join('');
 return '<div class="db-result"><div class="db-table-wrap" data-preserve-scroll="database-result"><table class="db-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
}

function appDataSection(deviceOptions,adbReady){
 const packages=state.appPackages||[];
 const selected=state.selectedAppPackage||state.applicationId||'';
 const status=state.appPackagesScanning?'Scanning…':selected?selected.split('.').slice(-1)[0]:'Pick an app';
 const packageOptions=packages.length
  ?packages.map((name)=>'<option value="'+esc(name)+'"'+(name===selected?' selected':'')+'>'+esc(name)+'</option>').join('')
  :(selected?'<option value="'+esc(selected)+'" selected>'+esc(selected)+'</option>':'<option value="">Scan installed apps</option>');
 const disabled=!adbReady||!selected;
 const permissionControls='<div class="permission-actions">'+COMMON_PERMISSIONS.map((item)=>'<button class="chip" data-permission="'+esc(item.permission)+'" data-grant="1"'+(disabled?' disabled':'')+' title="Grant '+esc(item.label)+'">'+esc(item.label)+'</button>').join('')+'</div>';
 const body=group(
  row('Device',selectWrap('app-device',deviceOptions,{disabled:state.appPackagesScanning,label:'App data device'}),'','Data target')
  +row('Package',selectWrap('app-package',packageOptions,{disabled:!packages.length&&!selected,label:'Installed package'}),'','Installed app ID')
  +row('Allow',permissionControls,'','Grant common runtime permissions')
  +row('Force stop',actionButton('app-force-stop','Stop','secondary compact',disabled),'','End app process')
  +row('Clear cache',actionButton('app-clear-cache','Clear','secondary compact',disabled),'','Keep user data')
  +row('Clear storage',actionButton('app-clear-data','Clear','danger compact',disabled),'','Reset app data')
 )+sectionFooter(state.appDataMessage,'app-packages',!adbReady,state.appPackagesScanning);
 return section('appdata','App data',status,body);
}

function deepLinkSection(deviceOptions,adbReady){
 const prefixes=state.deepLinkPrefixes||[],favorites=state.favoriteDeepLinks||[],recent=state.recentDeepLinks||[];
 const suggestions=[...new Set([...prefixes,...favorites,...recent])];
 const prefixChips=prefixes.length?'<div class="chip-row" data-preserve-scroll="deeplink-prefixes">'+prefixes.map((uri)=>'<button class="chip" data-link="'+esc(uri)+'">'+esc(uri)+'</button>').join('')+'</div>':'<p class="muted">Build once to discover schemes from the selected variant.</p>';
 const favoriteRows=linkRows(favorites,true),draftFavorite=favorites.includes(deepLinkDraft);
 const recentRows=linkRows(recent.filter((uri)=>!favorites.includes(uri)),false);
 const deepLinkOp=state.operation?.id==='deeplink'?state.operation:null,launching=deepLinkOp?.status==='running';
 const command='<div class="command-line"><span class="command-prompt" aria-hidden="true">❯</span><input id="deeplink-uri" list="deeplink-suggestions" value="'+esc(deepLinkDraft)+'" placeholder="myapp://path" spellcheck="false" aria-label="Deeplink URI"><datalist id="deeplink-suggestions">'+suggestions.map((uri)=>'<option value="'+esc(uri)+'"></option>').join('')+'</datalist><button class="star-button" id="favorite-deeplink" title="Toggle favorite" aria-label="Toggle favorite">'+(draftFavorite?'★':'☆')+'</button><button class="command-launch" id="open-deeplink" title="Launch deeplink" aria-label="Launch deeplink"'+(deepLinkDraft.trim()&&adbReady&&!launching?'':' disabled')+(launching?' aria-busy="true"':'')+'>'+operationVisual(deepLinkOp,icon('external'))+'</button></div>';
 const target=group(row('Device',selectWrap('deeplink-device',deviceOptions,{label:'Target device'}),'','Launch target'));
 const result=state.linkResult?'<div class="link-result '+(state.linkResult.ok?'ok':'error')+'">'+esc(state.linkResult.message)+'</div>':'';
 const routes='<div class="micro-heading"><span>Discovered routes</span><span>'+prefixes.length+'</span></div>'+prefixChips;
 const favoritesBlock=favoriteRows?'<div class="link-group"><div class="micro-heading"><span>Favorites</span><span>'+favorites.length+'</span></div>'+favoriteRows+'</div>':'';
 const recentBlock=recentRows?'<div class="link-group"><div class="micro-heading"><span>Recent</span><button class="text-button" id="clear-deeplinks">Clear</button></div>'+recentRows+'</div>':'';
 return section('deeplinks','Deeplinks',prefixes.length+' discovered',command+target+result+routes+favoritesBlock+recentBlock);
}

function linkRows(items,favorite){return items.map((uri)=>'<div class="link-row"><button class="link-value" data-link="'+esc(uri)+'">'+esc(uri)+'</button><button class="link-star '+(favorite?'active':'')+'" data-favorite="'+esc(uri)+'" title="'+(favorite?'Remove favorite':'Add favorite')+'">'+(favorite?'★':'☆')+'</button></div>').join('')}

function locationSection(deviceOptions,adbReady){
 const trail=trails[locationState.trail];
 const routeReady=canPlayRoute(adbReady,locationState.serial);
 const status='<span class="location-live"><span class="status-dot '+(locationState.status==='playing'?'on':'')+'"></span><span id="location-summary">'+locationSummary()+'</span></span>';
 const target=group(row('Emulator',selectWrap('location-device',deviceOptions,{label:'Target emulator'}),'','Location target'));
 const switcher='<div class="location-view-switch segmented" role="tablist" aria-label="Location mode"><button class="segment '+(locationState.view==='point'?'active':'')+'" data-location-view="point" role="tab" aria-selected="'+(locationState.view==='point')+'">Point</button><button class="segment '+(locationState.view==='route'?'active':'')+'" data-location-view="route" role="tab" aria-selected="'+(locationState.view==='route')+'">Route</button></div>';
 const selected=parseCoords(locationState.coords);
 if(selected)locationState.selection=selected;
 const pointControls=group(row('Coordinates','<input id="location-coords" class="row-input" inputmode="decimal" spellcheck="false" value="'+esc(locationState.coords)+'" placeholder="37.7749, -122.4194" aria-label="Latitude, longitude">'+actionButton('location','Set','secondary compact',!selected||!routeReady),'','Latitude, longitude'));
 const mapLabel=selected?formatCoords(selected):'No point selected';
 const mapScene='<div class="route-scene map-scene"><canvas id="world-map" tabindex="0" aria-label="World map. Click to select coordinates, drag to pan, and scroll to zoom."></canvas><span class="scene-chip map-instruction">Select a point</span><span class="scene-chip map-coordinates" id="map-coordinates">'+esc(mapLabel)+'</span><span class="scene-chip map-zoom" id="map-zoom">1.0×</span><div class="map-controls"><button id="map-zoom-out" type="button" title="Zoom out" aria-label="Zoom out">−</button><button id="map-reset" type="button" title="Reset world view" aria-label="Reset world view">◎</button><button id="map-zoom-in" type="button" title="Zoom in" aria-label="Zoom in">+</button></div></div>';
 const pointPanel='<div class="location-panel point-panel" role="tabpanel">'+pointControls+mapScene+'</div>';
 const routeControls=group(row('Route',selectWrap('trail-select',trails.map((t,i)=>'<option value="'+i+'"'+(i===locationState.trail?' selected':'')+' title="'+esc(t.description)+'">'+esc(t.name)+'</option>').join(''),{label:'Simulated route',title:trail.description}),'','Simulated path'));
 const routeScene='<div class="route-scene"><canvas id="route-canvas"></canvas><span class="scene-chip elevation low">'+Math.round(prepared.minAlt)+' m</span><span class="scene-chip elevation high">'+Math.round(prepared.maxAlt)+' m</span></div>';
 const readout='<div class="route-readout"><div class="stat"><div class="stat-label">Distance</div><div class="stat-value" id="distance-stat">'+formatDistance(locationState.arc)+'</div></div><div class="stat"><div class="stat-label">Pace</div><div class="stat-value" id="pace-stat">'+formatPace(speed())+'</div></div><div class="stat"><div class="stat-label">Elapsed</div><div class="stat-value" id="elapsed-stat">'+formatDuration(locationState.elapsed)+'</div></div></div>';
 const playback='<div class="action-strip"><button class="primary" id="play-location"'+(routeReady?'':' disabled')+'>'+icon(locationState.status==='playing'?'pause':'play')+'<span>'+(locationState.status==='playing'?'Pause':'Play')+'</span></button><button class="secondary" id="stop-location"'+(locationState.status==='idle'?' disabled':'')+'>'+icon('stop')+'<span>Stop</span></button></div>';
 const modes='<div class="mode-row"><div class="segmented" role="group" aria-label="Movement mode">'+['walk','run','cycle','drive'].map((m)=>'<button class="segment '+(m===locationState.mode?'active':'')+'" data-mode="'+m+'" title="'+m+'">'+({walk:'●',run:'↗',cycle:'∞',drive:'◆'}[m])+'</button>').join('')+'</div><button class="secondary speed" id="speed-location">'+locationState.multiplier+'×</button></div>';
 const routePanel='<div class="location-panel route-panel" role="tabpanel">'+routeControls+routeScene+readout+playback+modes+'</div>';
 const panel=locationState.view==='point'?pointPanel:routePanel;
 return section('location','Location',status,target+switcher+panel+'<div class="location-error" id="location-error">'+esc(locationState.error)+'</div>');
}

function setRunTargetMenuOpen(open){runTargetMenuOpen=Boolean(open);const trigger=document.getElementById('run-target-trigger'),menu=document.getElementById('run-target-menu');if(trigger)trigger.setAttribute('aria-expanded',String(runTargetMenuOpen));if(menu)menu.hidden=!runTargetMenuOpen;saveUi()}

function bind(){
 document.getElementById('dismiss-error')?.addEventListener('click',()=>send('error-dismiss'));
 app.querySelectorAll('[data-setup]').forEach((el)=>el.addEventListener('click',()=>send(el.dataset.setup)));
 app.querySelectorAll('details[data-section]').forEach((el)=>el.addEventListener('toggle',()=>{el.open?openSections.add(el.dataset.section):openSections.delete(el.dataset.section);if(el.open&&el.dataset.section==='database'&&state.database?.selectedDatabase&&!state.database?.localPath&&!state.databaseScanning)send('db-open');saveUi()}));
 app.querySelectorAll('[data-action]').forEach((el)=>el.addEventListener('click',()=>{const action=el.dataset.action;if(action==='screenshot'||action==='screenshot-annotated')send('screenshot',{annotate:action==='screenshot-annotated'});else if(action==='screenshot-save')send('screenshot-save');else if(action === 'logcat') send('logcat', { serial: document.getElementById('stream-device')?.value || '', });else if(action==='screen-record-start')send('screen-record-start',{serial:controlsSerial||openDeviceMenu||''});else if(action==='screen-record-stop')send('screen-record-stop');else if(action==='emulator-create')send('emulator-create',{profile:document.getElementById('emulator-profile')?.value||state.selectedEmulatorProfile||''});else if(action==='performance-start')send('performance-start',{serial:document.getElementById('perf-device')?.value||'',packageName:document.getElementById('perf-package')?.value||state.performance?.packageName||state.selectedAppPackage||''});else if(action==='performance-stop')send('performance-stop');else if(action==='performance-reset')send('performance-reset');else if(action==='performance-dump')send('performance-dump');else if(action==='location'){const parsed=parseCoords(document.getElementById('location-coords')?.value||'');if(!parsed)return;locationState.coords=document.getElementById('location-coords').value;send('location',{serial:locationState.serial,latitude:parsed.lat,longitude:parsed.lng})}else if(action==='db-refresh')send('db-refresh',{serial:document.getElementById('db-device')?.value||''});else if(action==='db-query'){sqlDraft=document.getElementById('db-sql')?.value||'';saveUi();send('db-query',{sql:sqlDraft})}else if(action==='db-push')send('db-push');else if(action==='app-packages'||action==='app-clear-cache'||action==='app-clear-data'||action==='app-force-stop')send(action,{serial:document.getElementById('app-device')?.value||'',packageName:document.getElementById('app-package')?.value||state.selectedAppPackage||state.applicationId||''});else send(action,{serial:locationState.serial})}));
 document.getElementById('build-variant')?.addEventListener('change',(e)=>send('variant',{id:e.target.value}));
 document.getElementById('stream-device')?.addEventListener('change',(e)=>{streamSerial = e.target.value; saveUi()});
 document.getElementById('run-target-trigger')?.addEventListener('click',()=>setRunTargetMenuOpen(!runTargetMenuOpen));
 document.getElementById('open-devices-from-targets')?.addEventListener('click',()=>{runTargetMenuOpen=false;openSections.add('device');saveUi();render();requestAnimationFrame(()=>document.querySelector('details[data-section="device"]')?.scrollIntoView({behavior:'smooth',block:'start'}))});
 app.querySelectorAll('.run-target-checkbox').forEach((el)=>el.addEventListener('change',()=>{state.selectedRunTargets=[...app.querySelectorAll('.run-target-checkbox:checked')].map((input)=>input.dataset.targetId);send('run-targets',{ids:state.selectedRunTargets});render()}));
 document.getElementById('emulator-profile')?.addEventListener('change',(e)=>send('emulator-profile',{profile:e.target.value}));
 document.getElementById('perf-device')?.addEventListener('change',(e)=>send('performance-serial',{serial:e.target.value}));
 document.getElementById('perf-package')?.addEventListener('change',(e)=>send('performance-package',{packageName:e.target.value}));
 app.querySelectorAll('[data-device-menu]').forEach((el)=>el.addEventListener('click',(event)=>{event.stopPropagation();const serial=el.dataset.deviceMenu;if(openDeviceMenu===serial){openDeviceMenu='';render();return}openDeviceMenu=serial;controlsSerial=serial;send('controls-serial',{serial});render()}));
 app.querySelectorAll('[data-device-menu-close]').forEach((el)=>el.addEventListener('click',(event)=>{event.stopPropagation();openDeviceMenu='';render()}));
 document.getElementById('battery-level')?.addEventListener('change',(e)=>send('controls-battery-level',{serial:openDeviceMenu||controlsSerial,level:Number(e.target.value)}));
 app.querySelectorAll('[data-rotate]').forEach((el)=>el.addEventListener('click',()=>send('controls-rotate',{serial:el.dataset.serial||openDeviceMenu||controlsSerial,rotation:Number(el.dataset.rotate)})));
 app.querySelectorAll('[data-font]').forEach((el)=>el.addEventListener('click',()=>send('controls-font',{serial:el.dataset.serial||openDeviceMenu||controlsSerial,scale:Number(el.dataset.font)})));
 app.querySelectorAll('[data-overlay]').forEach((el)=>el.addEventListener('click',()=>send('controls-overlay',{serial:openDeviceMenu||controlsSerial,overlay:el.dataset.overlay,enabled:el.dataset.enabled==='1'})));
 app.querySelectorAll('[data-battery-charging]').forEach((el)=>el.addEventListener('click',()=>send('controls-battery-charging',{serial:el.dataset.serial||openDeviceMenu||controlsSerial,charging:el.dataset.batteryCharging==='1'})));
 app.querySelectorAll('[data-permission]').forEach((el)=>el.addEventListener('click',()=>send('controls-permission',{serial:document.getElementById('app-device')?.value||controlsSerial,packageName:document.getElementById('app-package')?.value||state.selectedAppPackage||state.applicationId||'',permission:el.dataset.permission,grant:el.dataset.grant==='1'})));
 document.getElementById('app-package')?.addEventListener('change',(e)=>send('app-package',{packageName:e.target.value}));
 document.getElementById('app-device')?.addEventListener('change',(e)=>send('app-packages',{serial:e.target.value}));
 document.getElementById('deeplink-uri')?.addEventListener('input',(e)=>{deepLinkDraft=e.target.value;updateDeepLinkButton();saveUi()});
 document.getElementById('deeplink-uri')?.addEventListener('keydown',(e)=>{if(e.key!=='Enter')return;const button=document.getElementById('open-deeplink');if(button&&!button.disabled)button.click()});
 document.getElementById('open-deeplink')?.addEventListener('click',()=>{const input=document.getElementById('deeplink-uri');deepLinkDraft=input.value;send('deeplink-open',{uri:deepLinkDraft,serial:document.getElementById('deeplink-device')?.value||''})});
 document.getElementById('favorite-deeplink')?.addEventListener('click',()=>send('deeplink-favorite',{uri:document.getElementById('deeplink-uri')?.value||''}));
 document.getElementById('clear-deeplinks')?.addEventListener('click',()=>send('deeplink-clear'));
 app.querySelectorAll('[data-link]').forEach((el)=>el.addEventListener('click',()=>{deepLinkDraft=el.dataset.link;saveUi();const input=document.getElementById('deeplink-uri');if(input){input.value=deepLinkDraft;input.focus()}updateDeepLinkButton()}));
 app.querySelectorAll('[data-favorite]').forEach((el)=>el.addEventListener('click',()=>send('deeplink-favorite',{uri:el.dataset.favorite})));
 app.querySelectorAll('[data-stop]').forEach((el)=>el.addEventListener('click',()=>send('stop',{serial:el.dataset.stop})));
 app.querySelectorAll('[data-start]').forEach((el)=>el.addEventListener('click',()=>send('start',{name:el.dataset.start})));
 app.querySelectorAll('[data-theme]').forEach((el)=>el.addEventListener('click',()=>send('theme',{serial:el.dataset.serial,theme:el.dataset.theme})));
 document.getElementById('db-package')?.addEventListener('change',(e)=>send('db-package',{packageName:e.target.value}));
 document.getElementById('db-device')?.addEventListener('change',(e)=>send('db-refresh',{serial:e.target.value}));
 document.getElementById('db-database')?.addEventListener('change',(e)=>send('db-database',{database:e.target.value}));
 document.getElementById('db-table')?.addEventListener('change',(e)=>send('db-table',{table:e.target.value}));
 document.getElementById('db-sql')?.addEventListener('input',(e)=>{sqlDraft=e.target.value;saveUi()});
 app.querySelectorAll('[data-db-cell]').forEach((el)=>el.addEventListener('click',()=>editDbCell(el)));
 document.getElementById('location-device')?.addEventListener('change',(e)=>{locationState.serial=e.target.value;if(!canPlayRoute(state.adbStatus==='ready',locationState.serial)&&locationState.status==='playing'){locationState.status='paused';locationState.error='Start and select an emulator to continue the route.'}render()});
 app.querySelectorAll('[data-location-view]').forEach((el)=>el.addEventListener('click',()=>{const view=el.dataset.locationView;if(view===locationState.view)return;if(view==='point'&&locationState.status==='playing')locationState.status='paused';locationState.view=view;saveUi();render()}));
 document.getElementById('location-coords')?.addEventListener('input',(e)=>{locationState.coords=e.target.value;const parsed=parseCoords(locationState.coords);if(parsed)syncMapSelection(parsed,true);updateLocationButton();updateLocationText()});
 document.getElementById('location-coords')?.addEventListener('keydown',(e)=>{if(e.key!=='Enter')return;const button=document.querySelector('[data-action="location"]');if(button&&!button.disabled)button.click()});
 document.getElementById('trail-select')?.addEventListener('change',(e)=>{locationState.trail=Number(e.target.value);locationState.mode=trails[locationState.trail].mode;resetLocation();prepared=prepare(trails[locationState.trail]);render()});
 document.getElementById('play-location')?.addEventListener('click',()=>{locationState.status=locationState.status==='playing'?'paused':'playing';locationState.last=performance.now();updateLocationText()});
 document.getElementById('stop-location')?.addEventListener('click',()=>{resetLocation();updateLocationText()});
 document.getElementById('speed-location')?.addEventListener('click',()=>{const speeds=[1,2,5,20],i=speeds.indexOf(locationState.multiplier);locationState.multiplier=speeds[(i+1)%speeds.length];render()});
 app.querySelectorAll('[data-mode]').forEach((el)=>el.addEventListener('click',()=>{locationState.mode=el.dataset.mode;render()}));
 const map=document.getElementById('world-map');if(map)bindWorldMap(map);
 document.getElementById('map-zoom-in')?.addEventListener('click',()=>zoomMap(1.6));
 document.getElementById('map-zoom-out')?.addEventListener('click',()=>zoomMap(1/1.6));
 document.getElementById('map-reset')?.addEventListener('click',()=>{locationState.map={zoom:1,lat:0,lng:0};mapDirty=true;drawWorldMap(performance.now())});
}

function resetLocation(){locationState.status='idle';locationState.arc=0;locationState.elapsed=0;locationState.lastPush=0}
function editDbCell(el){
 const current=el.textContent==='NULL'?'':el.textContent;
 const next=window.prompt('Edit '+el.dataset.column+' (use NULL for null)',current);
 if(next===null)return;
 const value=next.trim().toUpperCase()==='NULL'?null:next;
 send('db-cell',{table:el.dataset.table,rowid:el.dataset.rowid,column:el.dataset.column,value});
}

function decodeWorld(topology){
 if(!topology?.objects?.land||!Array.isArray(topology.arcs))return[];
 const transform=topology.transform||{scale:[1,1],translate:[0,0]},cache=new Map();
 const decodeArc=(index)=>{const reversed=index<0,key=reversed?~index:index;if(!cache.has(key)){let x=0,y=0;cache.set(key,(topology.arcs[key]||[]).map(([dx,dy])=>{x+=dx;y+=dy;return[x*transform.scale[0]+transform.translate[0],y*transform.scale[1]+transform.translate[1]]}))}const points=cache.get(key);return reversed?[...points].reverse():points};
 const decodeRing=(ring)=>{const points=ring.flatMap((index,i)=>{const arc=decodeArc(index);return i?arc.slice(1):arc}),unwrapped=[];let offset=0,previous=points[0]?.[0]||0;for(const [rawLng,lat] of points){let lng=rawLng+offset;if(lng-previous>180){offset-=360;lng-=360}else if(lng-previous<-180){offset+=360;lng+=360}unwrapped.push([lng,lat]);previous=lng}return unwrapped};
 const object=topology.objects.land,geometries=object.type==='GeometryCollection'?object.geometries:[object];
 return geometries.flatMap((geometry)=>{const polygons=geometry.type==='Polygon'?[geometry.arcs]:geometry.type==='MultiPolygon'?geometry.arcs:[];return polygons.map((polygon)=>polygon.map(decodeRing))});
}

function bindWorldMap(canvas){
 mapDirty=true;
 canvas.addEventListener('pointerdown',(event)=>{const rect=canvas.getBoundingClientRect();mapPointer={id:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,rect};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging')});
 canvas.addEventListener('pointermove',(event)=>{if(!mapPointer||mapPointer.id!==event.pointerId)return;const dx=event.clientX-mapPointer.lastX,dy=event.clientY-mapPointer.lastY;if(Math.hypot(event.clientX-mapPointer.startX,event.clientY-mapPointer.startY)>4)mapPointer.moved=true;if(mapPointer.moved){const metrics=mapMetrics(canvas);locationState.map.lng-=dx/metrics.scale;locationState.map.lat+=dy/metrics.scale;clampMap(canvas);mapDirty=true;drawWorldMap(performance.now())}mapPointer.lastX=event.clientX;mapPointer.lastY=event.clientY});
 const finish=(event)=>{if(!mapPointer||mapPointer.id!==event.pointerId)return;const pointer=mapPointer;mapPointer=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(!pointer.moved){const rect=canvas.getBoundingClientRect(),point=mapToGeo(canvas,event.clientX-rect.left,event.clientY-rect.top);syncMapSelection(point,false);canvas.focus()}};
 canvas.addEventListener('pointerup',finish);
 canvas.addEventListener('pointercancel',(event)=>{if(mapPointer?.id===event.pointerId){mapPointer=null;canvas.classList.remove('dragging')}});
 canvas.addEventListener('wheel',(event)=>{event.preventDefault();const rect=canvas.getBoundingClientRect();zoomMap(event.deltaY<0?1.35:1/1.35,{x:event.clientX-rect.left,y:event.clientY-rect.top})},{passive:false});
 canvas.addEventListener('keydown',(event)=>{const step=24/locationState.map.zoom;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','Enter',' '].includes(event.key))event.preventDefault();if(event.key==='ArrowLeft')locationState.map.lng-=step;else if(event.key==='ArrowRight')locationState.map.lng+=step;else if(event.key==='ArrowUp')locationState.map.lat+=step;else if(event.key==='ArrowDown')locationState.map.lat-=step;else if(event.key==='+'||event.key==='=')return zoomMap(1.5);else if(event.key==='-'||event.key==='_')return zoomMap(1/1.5);else if(event.key==='Enter'||event.key===' ')return syncMapSelection({lat:locationState.map.lat,lng:locationState.map.lng},false);else return;clampMap(canvas);mapDirty=true;drawWorldMap(performance.now())});
 drawWorldMap(performance.now());
}

function mapMetrics(canvas){const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height,base=Math.max(.1,Math.min((w-28)/360,(h-42)/180)),scale=base*locationState.map.zoom;return{w,h,cx:w/2,cy:h*.47,base,scale}}
function mapToGeo(canvas,x,y){const metrics=mapMetrics(canvas);return{lat:Math.max(-90,Math.min(90,locationState.map.lat-(y-metrics.cy)/metrics.scale)),lng:Math.max(-180,Math.min(180,locationState.map.lng+(x-metrics.cx)/metrics.scale))}}
function clampMap(canvas){const metrics=mapMetrics(canvas),lngLimit=Math.max(0,180-metrics.w/(2*metrics.scale)),latSpan=Math.min(metrics.cy-12,metrics.h-metrics.cy-18)/metrics.scale,latLimit=Math.max(0,90-latSpan);locationState.map.lng=Math.max(-lngLimit,Math.min(lngLimit,locationState.map.lng));locationState.map.lat=Math.max(-latLimit,Math.min(latLimit,locationState.map.lat))}
function zoomMap(factor,anchor){const canvas=document.getElementById('world-map');if(!canvas)return;const point=anchor?mapToGeo(canvas,anchor.x,anchor.y):null;locationState.map.zoom=Math.max(1,Math.min(8,locationState.map.zoom*factor));clampMap(canvas);if(point&&anchor){const after=mapToGeo(canvas,anchor.x,anchor.y);locationState.map.lng+=point.lng-after.lng;locationState.map.lat+=point.lat-after.lat;clampMap(canvas)}mapDirty=true;drawWorldMap(performance.now())}
function syncMapSelection(point,center){locationState.selection={lat:Math.max(-90,Math.min(90,point.lat)),lng:Math.max(-180,Math.min(180,point.lng))};locationState.coords=formatCoords(locationState.selection);locationState.error='';if(center&&locationState.map.zoom>1){locationState.map.lat=locationState.selection.lat;locationState.map.lng=locationState.selection.lng;const canvas=document.getElementById('world-map');if(canvas)clampMap(canvas)}const input=document.getElementById('location-coords');if(input)input.value=locationState.coords;mapDirty=true;updateLocationButton();updateLocationText();drawWorldMap(performance.now())}
function formatCoords(point){const clean=(value)=>Math.abs(value)<.000005?0:value;return clean(point.lat).toFixed(5)+', '+clean(point.lng).toFixed(5)}
function drawWorldMap(){
 const canvas=document.getElementById('world-map');if(!canvas)return;
 const rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const dpr=devicePixelRatio||1,w=rect.width,h=rect.height,resized=canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr);if(!mapDirty&&!resized)return;mapDirty=false;
 if(resized){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const c=canvas.getContext('2d'),surface=themeValue('--panel','#1a1a1d'),deep=themeValue('--deep','#0a0a0c'),line=themeValue('--text','#fff'),grid=themeValue('--line','#333'),metrics=mapMetrics(canvas);
 c.setTransform(dpr,0,0,dpr,0,0);
 const bg=c.createRadialGradient(w*.5,h*.45,8,w*.5,h*.45,Math.max(w,h)*.72);bg.addColorStop(0,surface);bg.addColorStop(1,deep);c.fillStyle=bg;c.fillRect(0,0,w,h);
 c.fillStyle=grid;for(let y=7;y<h;y+=14)for(let x=7;x<w;x+=14){c.beginPath();c.arc(x,y,.7,0,Math.PI*2);c.fill()}
 const project=([lng,lat])=>({x:metrics.cx+(lng-locationState.map.lng)*metrics.scale,y:metrics.cy+(locationState.map.lat-lat)*metrics.scale});
 c.save();c.strokeStyle=grid;c.globalAlpha=.32;c.lineWidth=.7;for(let lng=-150;lng<=150;lng+=30){const a=project([lng,-90]),b=project([lng,90]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}for(let lat=-60;lat<=60;lat+=30){const a=project([-180,lat]),b=project([180,lat]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}c.restore();
 c.lineJoin='round';c.lineCap='round';
 for(const polygon of worldPolygons)for(const shift of [-360,0,360]){const shifted=polygon.map((ring)=>ring.map(([lng,lat])=>[lng+shift,lat])),rings=shifted.map((ring)=>ring.map(project)),outer=rings[0]||[],xs=outer.map((point)=>point.x);if(!outer.length||Math.max(...xs)<-2||Math.min(...xs)>w+2)continue;c.beginPath();rings.forEach((ring,index)=>{ring.forEach((point,pointIndex)=>pointIndex?c.lineTo(point.x,point.y):c.moveTo(point.x,point.y));const source=shifted[index];if(source.length&&Math.abs(source.at(-1)[0]-source[0][0])<180)c.closePath()});c.save();c.globalAlpha=.76;c.strokeStyle=line;c.lineWidth=Math.max(.72,.84/Math.sqrt(locationState.map.zoom));c.stroke();c.restore()}
 const selected=locationState.selection||parseCoords(locationState.coords);if(selected){const marker=project([selected.lng,selected.lat]);if(marker.x>-24&&marker.x<w+24&&marker.y>-24&&marker.y<h+24){c.save();c.strokeStyle=line;c.fillStyle=line;c.lineWidth=1.2;c.globalAlpha=.32;c.beginPath();c.arc(marker.x,marker.y,12,0,Math.PI*2);c.stroke();c.globalAlpha=.75;c.beginPath();c.moveTo(marker.x-18,marker.y);c.lineTo(marker.x-6,marker.y);c.moveTo(marker.x+6,marker.y);c.lineTo(marker.x+18,marker.y);c.moveTo(marker.x,marker.y-18);c.lineTo(marker.x,marker.y-6);c.moveTo(marker.x,marker.y+6);c.lineTo(marker.x,marker.y+18);c.stroke();c.globalAlpha=1;c.beginPath();c.arc(marker.x,marker.y,3.8,0,Math.PI*2);c.fill();c.restore()}}
 const zoom=document.getElementById('map-zoom');if(zoom)zoom.textContent=locationState.map.zoom.toFixed(1)+'×';
}

function speed(){return ({walk:1.4,run:3,cycle:5.5,drive:13.4}[locationState.mode]||1.4)*locationState.multiplier}
function prepare(trail){const origin=trail.waypoints[0],latScale=111320,lngScale=111320*Math.cos(origin[0]*Math.PI/180);let arc=0;const points=trail.waypoints.concat(trail.loop?[trail.waypoints[0]]:[]).map((w,i,all)=>{const p={x:(w[1]-origin[1])*lngScale,z:-(w[0]-origin[0])*latScale,y:w[2]||0,lat:w[0],lng:w[1],arc};if(i){const q=all[i-1];arc+=Math.hypot((w[1]-q[1])*lngScale,(w[0]-q[0])*latScale,(w[2]||0)-(q[2]||0));p.arc=arc}return p});return{points,total:arc,minAlt:Math.min(...points.map(p=>p.y)),maxAlt:Math.max(...points.map(p=>p.y))}}
function pointAt(arc){let d=prepared.total?arc%prepared.total:0;for(let i=1;i<prepared.points.length;i++){const a=prepared.points[i-1],b=prepared.points[i];if(b.arc>=d){const t=(d-a.arc)/(b.arc-a.arc||1);return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t,lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t}}}return prepared.points[0]}
function tick(now){const dt=Math.min(64,now-(locationState.last||now));locationState.last=now;locationState.angle=(locationState.angle+dt*.00012)%(Math.PI*2);if(locationState.status==='playing'){locationState.arc=(locationState.arc+speed()*dt/1000)%prepared.total;locationState.elapsed+=dt;if(now-locationState.lastPush>1000){locationState.lastPush=now;const p=pointAt(locationState.arc);send('location-path',{serial:locationState.serial,latitude:p.lat,longitude:p.lng})}updateLocationText()}drawRoute(now);drawWorldMap(now);requestAnimationFrame(tick)}
function themeValue(name,fallback){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback}
function drawRoute(now){
 const canvas=document.getElementById('route-canvas');if(!canvas)return;
 const rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const dpr=devicePixelRatio||1,w=rect.width,h=rect.height;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 const c=canvas.getContext('2d'),surface=themeValue('--panel','#1a1a1d'),deep=themeValue('--deep','#0a0a0c'),line=themeValue('--text','#fff'),muted=themeValue('--muted','#888'),grid=themeValue('--line','#333');
 c.setTransform(dpr,0,0,dpr,0,0);
 const bg=c.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,Math.max(w,h)*.7);bg.addColorStop(0,surface);bg.addColorStop(1,deep);c.fillStyle=bg;c.fillRect(0,0,w,h);
 c.fillStyle=grid;for(let y=7;y<h;y+=14)for(let x=7;x<w;x+=14){c.beginPath();c.arc(x,y,.7,0,Math.PI*2);c.fill()}
 const pts=prepared.points,minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,extent=Math.max(maxX-minX,maxZ-minZ,1),scale=Math.min(w,h)*.62/extent,sa=Math.sin(locationState.angle),ca=Math.cos(locationState.angle);
 const project=(p)=>{const x=p.x-cx,z=p.z-cz,rx=x*ca+z*sa,rz=-x*sa+z*ca,e=(p.y-prepared.minAlt)*1.4;return{x:w/2+rx*scale,y:h*.53+(rz*.45-e)*scale,ground:h*.53+rz*.45*scale+34}};
 const pp=pts.map(p=>({p,...project(p)}));
 for(let i=1;i<pp.length;i++){const a=pp[i-1],b=pp[i],g=c.createLinearGradient(0,(a.y+b.y)/2,0,(a.ground+b.ground)/2);g.addColorStop(0,line);g.addColorStop(.55,muted);g.addColorStop(1,deep);c.save();c.globalAlpha=.32;c.fillStyle=g;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(b.x,b.ground);c.lineTo(a.x,a.ground);c.fill();c.restore()}
 c.strokeStyle=line;c.lineWidth=1.6;c.lineJoin='round';c.beginPath();pp.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
 const marker=project(pointAt(locationState.arc));
 if(locationState.status==='playing'){const phase=(now%2600)/2600;c.save();c.globalAlpha=.25*(1-phase);c.strokeStyle=line;c.lineWidth=1;c.beginPath();c.arc(marker.x,marker.y,4+22*phase,0,Math.PI*2);c.stroke();c.restore()}
 c.fillStyle=line;c.beginPath();c.arc(marker.x,marker.y,4,0,Math.PI*2);c.fill();
}
function locationSummary(){if(locationState.view==='point')return parseCoords(locationState.coords)?'Point selected':'Choose a point';return locationState.status==='playing'?'Simulating · '+formatDuration(locationState.elapsed):locationState.status==='paused'?'Paused · '+formatDuration(locationState.elapsed):'Route ready'}
function updateDeepLinkButton(){const button=document.getElementById('open-deeplink');if(button)button.disabled=!deepLinkDraft.trim()||state.adbStatus!=='ready'}
function updateLocationButton(){const button=document.querySelector('[data-action="location"]');if(button)button.disabled=!parseCoords(locationState.coords)||!canPlayRoute(state.adbStatus==='ready',locationState.serial)}
function updateLocationText(){const distance=document.getElementById('distance-stat'),pace=document.getElementById('pace-stat'),elapsed=document.getElementById('elapsed-stat'),play=document.getElementById('play-location'),summary=document.getElementById('location-summary'),error=document.getElementById('location-error'),mapCoordinates=document.getElementById('map-coordinates');if(distance)distance.textContent=formatDistance(locationState.arc);if(pace)pace.textContent=formatPace(speed());if(elapsed)elapsed.textContent=formatDuration(locationState.elapsed);if(play)play.innerHTML=icon(locationState.status==='playing'?'pause':'play')+'<span>'+(locationState.status==='playing'?'Pause':'Play')+'</span>';if(summary)summary.textContent=locationSummary();if(error)error.textContent=locationState.error;if(mapCoordinates)mapCoordinates.textContent=locationState.selection?formatCoords(locationState.selection):'No point selected'}
function formatDistance(m){return m<1000?m.toFixed(0)+' m':(m/1000).toFixed(2)+' km'}function formatDuration(ms){const s=Math.floor(ms/1000),m=Math.floor(s/60);return m+':'+String(s%60).padStart(2,'0')}function formatPace(v){if(v>7)return(v*3.6).toFixed(0)+' km/h';const s=1000/v,m=Math.floor(s/60);return m+':'+String(Math.round(s%60)).padStart(2,'0')+'/km'}
requestAnimationFrame(tick);
