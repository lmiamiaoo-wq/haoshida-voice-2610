/* Fixed demonstration; browser speech output only, no microphone input. */
(() => {
  'use strict';
  const {PLANS,ROUTE,CHOICE_DELAY,parseChoice,matchingStep,Flow}=window.VoiceFlow;
  const $=s=>document.querySelector(s);
  const app=$('#app'), messages=$('#messages'), conversation=$('#conversation'), actionPanel=$('#action-panel');
  const flow=new Flow();
  let sound=true, voice='idle', matchTimer=null, choiceTimer=null, toastTimer=null;
  let speechFinish=null, speechRevision=0, selectedCard=null, focusBeforeSheet=null, speechWarning=false;
  let interrupted=false, storyStep='request', lastReply='', pausedReply='', selectionPending=false;
  const pendingWaits=new Map();
  const retiringCards=new Map();
  const icon=(name,extra='')=>`<img src="icons/${name}.svg" alt="" ${extra}>`;
  const driverPortrait='<img src="assets/driver-avatar.png" alt="陈师傅头像">';
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const same=session=>session===flow.session;

  function wait(ms){return new Promise(resolve=>{const id=setTimeout(()=>{pendingWaits.delete(id);resolve(true);},ms);pendingWaits.set(id,resolve);});}
  function clearWaits(){for(const [id,resolve] of pendingWaits){clearTimeout(id);resolve(false);}pendingWaits.clear();}
  function clearRetiringCards(){for(const [node,id] of retiringCards){clearTimeout(id);node.remove();}retiringCards.clear();}
  function showCard(node){
    clearRetiringCards();
    const animate=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(animate)node.classList.add('is-entering');
    actionPanel.append(node);
    if(animate)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(node.isConnected&&!node.classList.contains('is-leaving'))node.classList.remove('is-entering');}));
  }
  function retireCard(node){
    if(!node)return;
    node.removeAttribute('id');node.inert=true;node.setAttribute('aria-hidden','true');
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){node.remove();return;}
    node.classList.remove('is-entering');node.classList.add('is-leaving');
    const id=setTimeout(()=>{retiringCards.delete(node);node.remove();sync();},282);
    retiringCards.set(node,id);
  }
  function clearChoiceTimer(){clearTimeout(choiceTimer);choiceTimer=null;}
  function scheduleDefaultChoice(){
    clearChoiceTimer();
    if(flow.phase!=='options'||flow.optionsStartedAt===null||interrupted||selectionPending)return;
    const remaining=Math.max(0,CHOICE_DELAY-(Date.now()-flow.optionsStartedAt));
    choiceTimer=setTimeout(()=>{choiceTimer=null;if(flow.phase!=='options'||interrupted||selectionPending)return;if(flow.choiceDue())choose(Object.values(PLANS)[0].id);else scheduleDefaultChoice();},remaining);
  }
  function scrollDown(){requestAnimationFrame(()=>{conversation.scrollTop=conversation.scrollHeight;});}
  function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.toggle('sr-only',flow.phase!=='idle'&&$('#modal-backdrop').hidden);$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3600);}
  function setVoice(next){if(voice===next)return;voice=next;app.dataset.voice=next;sync();}
  function sync(){
    if(app.dataset.phase!==flow.phase)app.dataset.phase=flow.phase;
    if(app.dataset.voice!==voice)app.dataset.voice=voice;
    app.dataset.paused=String(interrupted);
    $('.welcome-copy').setAttribute('aria-hidden',String(flow.phase!=='idle'));
    conversation.hidden=true;
    actionPanel.hidden=!['options','matched'].includes(flow.phase)&&retiringCards.size===0;
    app.dataset.cards=String(!actionPanel.hidden);
    $('#matching-title').setAttribute('aria-hidden',String(flow.phase!=='matching'));
    $('#cancel-match').hidden=flow.phase!=='matching';
    $('#voice-presence').hidden=flow.phase==='idle';
    for(const control of [$('#sound'),$('#hangup')]){const idle=flow.phase==='idle';control.disabled=idle;control.inert=idle;control.setAttribute('aria-hidden',String(idle));}
    const speaking=voice==='speaking';
    $('#voice-status').textContent=voice==='user-speaking'?'您在说话':speaking?'正在回答':'正在听';
    $('#interrupt-hint').hidden=!speaking&&!interrupted;
    $('#interrupt-hint').textContent=interrupted?'再次点击继续对话':'点击语音球打断';
    $('#voice-presence').setAttribute('aria-label',interrupted?'继续对话':'模拟打断对话');
    const options={idle:'开始对话',story:'打断对话',options:'语音选择',matching:'暂停演示',matched:'继续对话'}[flow.phase];
    const primaryLabel=interrupted?'继续对话':speaking?'打断回答':options;
    $('#primary-label').textContent=primaryLabel;
    $('#primary').setAttribute('aria-label',primaryLabel);$('#primary').title=primaryLabel;
    $('.primary-icon').innerHTML=icon(flow.phase==='idle'?'phone-fill':interrupted?'microphone-slash-fill':'microphone-fill');
    $('#primary').disabled=false;
    $('#orb').setAttribute('aria-label',flow.phase==='idle'?'开始语音对话':interrupted?'继续对话':'模拟打断对话');
    $('#orb').disabled=false;
  }
  function messageNode(role,text){
    const node=document.createElement('article');node.className=`message ${role}`;node.dataset.role=role;
    node.setAttribute('aria-label',role==='ai'?'好侍达回复':'你的消息');
    const bubble=document.createElement('p');bubble.className='bubble';bubble.textContent=text;node.append(bubble);return node;
  }
  function appendTranscript(node){
    if(messages.lastElementChild?.dataset.role===node.dataset.role)messages.lastElementChild.remove();
    messages.append(node);
    while(messages.children.length>2)messages.firstElementChild.remove();
    scrollDown();
  }
  function addMessage(role,text){flow.add(role,text);const node=messageNode(role,text);appendTranscript(node);return node;}
  async function transcribe(text,session){
    const node=messageNode('user','');node.querySelector('.bubble').classList.add('interim');appendTranscript(node);
    setVoice('user-speaking');
    for(let i=1;i<=text.length;i++){if(!same(session))return false;node.querySelector('.bubble').textContent=text.slice(0,i);scrollDown();if(!await wait(95))return false;}
    node.querySelector('.bubble').classList.remove('interim');flow.add('user',text);return true;
  }
  function stopSpeech(){speechRevision++;if(speechFinish)speechFinish(false);if('speechSynthesis'in window)window.speechSynthesis.cancel();}
  async function speak(text,session=flow.session){
    stopSpeech();
    if(!same(session))return false;
    const revision=speechRevision;lastReply=text;setVoice('speaking');
    let result;
    if(!sound)result=await wait(Math.min(2200,Math.max(1200,text.length*55)));
    else if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){
      if(!speechWarning){toast('当前浏览器不支持语音播报，演示继续');speechWarning=true;}
      result=await wait(Math.min(3500,Math.max(1500,text.length*80)));
    }else result=await new Promise(resolve=>{
      const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';utterance.rate=1.04;utterance.pitch=1.06;
      const voices=window.speechSynthesis.getVoices();
      const preferred=voices.find(v=>/zh[-_]CN/i.test(v.lang)&&/ting|xiaoxiao|huihui|晓|婷婷/i.test(v.name))||voices.find(v=>/zh[-_]CN/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));
      if(preferred)utterance.voice=preferred;
      let finished=false,started=false;
      const complete=value=>{if(finished)return;finished=true;clearTimeout(startGuard);clearTimeout(endGuard);if(speechFinish===complete)speechFinish=null;resolve(value&&same(session));};
      speechFinish=complete;
      const unavailable=()=>{if(finished)return;if(!speechWarning){toast('语音暂不可用，演示继续');speechWarning=true;}complete(true);window.speechSynthesis.cancel();};
      const startGuard=setTimeout(()=>{if(!started)unavailable();},2400);
      const endGuard=setTimeout(()=>{complete(true);window.speechSynthesis.cancel();},Math.max(10000,text.length*500));
      utterance.onstart=()=>{started=true;clearTimeout(startGuard);};
      utterance.onend=()=>complete(true);
      utterance.onerror=event=>{if(!['canceled','interrupted'].includes(event.error))unavailable();else complete(false);};
      try{window.speechSynthesis.resume();window.speechSynthesis.speak(utterance);}catch{unavailable();}
    });
    if(same(session)&&revision===speechRevision){
      if(voice==='speaking')setVoice('idle');
    }
    return !!result&&same(session);
  }
  async function say(text,session=flow.session){if(!same(session))return false;const last=flow.messages.at(-1);if(last?.role!=='ai'||last.text!==text)addMessage('ai',text);return speak(text,session);}
  function begin(){
    if(!flow.begin())return;
    interrupted=false;storyStep='request';sync();continueStory();
  }
  async function continueStory(){
    if(flow.phase!=='story')return;
    flow.resume();interrupted=false;const session=flow.session;sync();
    if(storyStep==='request'){
      setVoice('listening');if(!await wait(700)||!same(session))return;
      if(!await transcribe('10:30 洗猫',session)||!same(session))return;
      storyStep='question';if(!await wait(550)||!same(session))return;
    }
    if(storyStep==='question'){
      await say('您需要上门，还是送去宠物店？',session);if(!same(session))return;
      storyStep='destination';if(!await wait(1300)||!same(session))return;
    }
    if(storyStep==='destination'){
      if(!await transcribe('送去宠物店',session)||!same(session))return;
      storyStep='plans';if(!await wait(550)||!same(session))return;
    }
    if(storyStep==='plans')presentPlans(session);
  }
  async function presentPlans(session=flow.session){
    if(!same(session)||flow.phase!=='story')return;
    interrupted=false;addMessage('ai','10:30 送去宠物店，您选哪种接送方式？');
    flow.showOptions();sync();renderPlans();
    await speakPlanOptions('好的，十点半送去宠物店。您可以选择单程送猫，预估二十八元；或送猫、等洗、接猫回来，预估两百元。',session);
  }
  async function speakPlanOptions(text,session=flow.session){
    if(!await speak(text,session)||!same(session)||flow.phase!=='options'||interrupted||selectionPending)return;
    flow.startChoiceCountdown();scheduleDefaultChoice();
  }
  function interruptConversation(){
    if(!flow.interrupt())return;
    pausedReply=voice==='speaking'?lastReply:'';interrupted=true;
    clearChoiceTimer();clearWaits();clearInterval(matchTimer);matchTimer=null;stopSpeech();setVoice('listening');sync();
  }
  function resumeConversation(){
    if(!interrupted)return;
    flow.resume();interrupted=false;const reply=pausedReply;pausedReply='';sync();
    if(flow.phase==='story'){continueStory();return;}
    if(flow.phase==='options'&&selectionPending){simulatePlanChoice();return;}
    if(flow.phase==='options'&&reply&&flow.optionsStartedAt===null){speakPlanOptions(reply);return;}
    if(flow.phase==='options')scheduleDefaultChoice();
    if(flow.phase==='matching'){matchTimer=setInterval(tickMatching,200);tickMatching();if(flow.phase!=='matching')return;}
    if(reply)speak(reply);else setVoice('listening');
  }
  function toggleConversation(){
    if(flow.phase==='idle')begin();else if(interrupted)resumeConversation();else interruptConversation();
  }
  async function simulatePlanChoice(){
    if(flow.phase!=='options'||interrupted)return;
    clearChoiceTimer();
    selectionPending=true;const session=flow.session;
    if(!await transcribe(PLANS.full.reply,session)||!same(session)||interrupted)return;
    selectionPending=false;choose('full',PLANS.full.reply,true);
  }
  function renderPlans(){
    if($('#plan-section'))return;
    const section=document.createElement('div');section.className='card-group';section.id='plan-section';
    section.innerHTML=`<div class="plan-list">${Object.values(PLANS).map(plan=>`<button class="plan-card ${plan.id}" data-plan="${plan.id}" aria-label="服务预约，${esc(ROUTE.home)}到${esc(ROUTE.shop)}，${esc(plan.title)}，预估${plan.price}元"><div class="booking-heading"><h3>服务预约</h3>${icon('arrow-up-right')}</div><div class="booking-body"><div class="booking-location">${icon('map-pin')}<span>${esc(ROUTE.home)}<i aria-hidden="true">—</i>${esc(ROUTE.shop)}</span></div><div class="booking-service"><p>${plan.title}</p><span class="plan-price"><small>预估</small><span class="yuan">￥</span><strong>${plan.price}</strong></span></div></div></button>`).join('')}</div>`;
    showCard(section);
    scheduleDefaultChoice();
  }
  function choose(id,sourceText,transcribed=false){
    if(flow.phase!=='options'||!PLANS[id])return false;
    clearChoiceTimer();
    if(selectionPending&&!transcribed){flow.interrupt();clearWaits();}
    flow.resume();
    if(!flow.select(id))return false;interrupted=false;selectionPending=false;pausedReply='';
    closeSheet();stopSpeech();
    selectedCard=$('#plan-section');retireCard(selectedCard);
    if(!transcribed)addMessage('user',sourceText||flow.plan.reply);sync();setVoice('idle');
    const text='好的，我来安排。';
    addMessage('ai',text);
    renderMatching();const session=flow.session;speak(text,session);matchTimer=setInterval(tickMatching,200);tickMatching();return true;
  }
  function renderMatching(){
    $('#matching-title').textContent='正在寻找司机';
  }
  function tickMatching(){
    if(flow.phase!=='matching'||interrupted)return;
    const elapsed=Date.now()-flow.startedAt,step=matchingStep(elapsed);
    if(step==='matched'){finishMatching();return;}
    const title=$('#matching-title');if(!title)return;
    const copy={searching:'正在寻找司机',notifying:'正在通知司机',confirming:'司机正在确认行程'}[step];
    if(title.textContent!==copy)title.textContent=copy;
  }
  function finishMatching(){
    if(!flow.finish())return;clearInterval(matchTimer);matchTimer=null;stopSpeech();
    addMessage('ai','陈师傅接单了，预计 8 分钟到达。');
    const node=document.createElement('div');node.className='card-group';node.id='driver-section';
    node.innerHTML=`<div class="driver-card">
      <header class="driver-card-heading"><div><h3>司机已接单</h3><p>10:30 ${flow.plan.short}</p></div></header>
      <div class="driver-card-body">
        <div class="driver-assignment">
          <div class="vehicle"><div class="vehicle-identity"><b>贵A·D2688</b><span>·白色</span></div><p class="vehicle-model">比亚迪秦 PLUS</p></div>
          <div class="driver-main"><div class="driver-avatar">${driverPortrait}</div><div class="driver-info"><h3>陈师傅</h3><p><span>★ 4.9</span></p></div><button class="driver-contact" data-action="contact" aria-label="联系陈师傅" title="联系司机"><span class="contact-phone-icon" aria-hidden="true"></span></button></div>
        </div>
        <div class="driver-trip"><div class="driver-trip-content"><h4>${flow.plan.title}</h4><p aria-label="接送路线">${ROUTE.home}<i aria-hidden="true">→</i>${ROUTE.shop}</p></div><span class="driver-price"><small>预估</small>￥<strong>${flow.plan.price}</strong></span></div>
      </div>
    </div>`;
    showCard(node);sync();setVoice('speaking');
    const session=flow.session;speak('陈师傅接单了，预计八分钟到达。',session);
  }
  function routeMarkup(){return `<div class="order-route"><div class="route-row" aria-label="出发地址"><i></i><b>${ROUTE.home}</b></div><div class="route-row" aria-label="送达地址"><i></i><b>${ROUTE.shop}</b></div></div>`;}
  function cancelMatching(){
    if(!flow.cancel())return;interrupted=false;pausedReply='';clearInterval(matchTimer);matchTimer=null;stopSpeech();
    $('#more-menu').hidden=true;$('#more').setAttribute('aria-expanded','false');
    addMessage('ai','已取消订单。可以重新选择接送方式。');renderPlans();sync();setVoice('idle');
  }
  function reset(){
    flow.reset();interrupted=false;storyStep='request';lastReply='';pausedReply='';selectionPending=false;clearChoiceTimer();clearWaits();clearRetiringCards();clearInterval(matchTimer);matchTimer=null;stopSpeech();closeSheet();
    messages.replaceChildren();actionPanel.replaceChildren();selectedCard=null;$('#more-menu').hidden=true;$('#more').setAttribute('aria-expanded','false');
    setVoice('idle');sync();
  }
  function openSheet(title,content,kind='generic'){
    focusBeforeSheet=document.activeElement;
    const sheet=$('#sheet');sheet.dataset.kind=kind;
    sheet.innerHTML=`<div class="sheet-header"><h2 id="sheet-title">${title}</h2><button class="sheet-close" aria-label="关闭弹窗" data-close-sheet>${icon('x-warning')}</button></div>${content}`;
    $('#modal-backdrop').hidden=false;sheet.focus();
  }
  function closeSheet(){$('#modal-backdrop').hidden=true;$('#sheet').replaceChildren();if(focusBeforeSheet?.isConnected)focusBeforeSheet.focus({preventScroll:true});focusBeforeSheet=null;}
  function openText(){
    if(voice==='speaking'||selectionPending||(['story','options'].includes(flow.phase)&&!interrupted))interruptConversation();
    const chips=flow.phase==='options'?['单程送猫','全程接送']:flow.phase==='matched'?['查看订单','联系司机']:flow.phase==='matching'?['取消订单']:flow.phase==='story'?['送去宠物店','继续对话']:['10:30 洗猫'];
    openSheet('文字对话',`<form class="text-form" id="text-form"><input name="command" id="command" autocomplete="off" placeholder="输入你想说的话…" aria-label="对话内容" required><button type="submit">发送</button></form><div class="command-chips">${chips.map(x=>`<button data-command="${x}">${x}</button>`).join('')}</div>`,'text');
    setTimeout(()=>$('#command')?.focus(),150);
  }
  function submitCommand(text){
    text=String(text||'').trim();if(!text)return;
    if(/重新|重来|再来|开始新/.test(text)){closeSheet();reset();return;}
    if(flow.phase==='idle'){closeSheet();begin();return;}
    if(/^(停|停止|暂停|别说了|等一下|打断)[吧啊呀。！!]*$/.test(text)){closeSheet();interruptConversation();addMessage('user',text);return;}
    if(/^(继续|继续对话|继续演示)$/.test(text)&&interrupted){closeSheet();resumeConversation();return;}
    if(flow.phase==='story'){
      closeSheet();flow.interrupt();clearWaits();stopSpeech();flow.resume();addMessage('user',text);interrupted=false;
      if(/宠物店|送去|送到/.test(text)){storyStep='plans';presentPlans();}
      else if(/继续|十点|10[:：]30|洗猫/.test(text)){if(storyStep==='request')storyStep='question';continueStory();}
      else{flow.interrupt();interrupted=true;setVoice('listening');toast('可输入“送去宠物店”，或点击继续对话');}
      return;
    }
    if(flow.phase==='options'){
      const id=parseChoice(text);if(id){choose(id,text);return;}
      toast('请选择“单程送猫”或“全程接送”');return;
    }
    if(flow.phase==='matching'){if(/取消|不要|停止/.test(text)){closeSheet();cancelMatching();}else toast('正在等待司机接单，可点击“取消订单”');return;}
    if(flow.phase==='matched'){
      if(/订单|详情/.test(text)){closeSheet();showOrder();return;}
      if(/联系|打电话|通话/.test(text)){closeSheet();showContact();return;}
      toast('可查看订单或联系司机');return;
    }
    toast('正在为你安排，请稍等片刻');
  }
  function showOrder(){
    if(flow.phase!=='matched')return;
    openSheet('接送订单',`<div class="success-caption">${icon('check-circle')}司机已接单</div>${routeMarkup()}<div class="order-detail-row"><span>预约时间</span><b>今天 10:30 到店</b></div><div class="order-detail-row"><span>服务方案</span><b>${flow.plan.title}</b></div><div class="order-detail-row"><span>预估费用</span><b>¥${flow.plan.price}</b></div><div class="order-detail-row"><span>接单司机</span><b>陈师傅 · 贵A·D2688</b></div><div class="order-detail-row"><span>预计到达</span><b>8 分钟</b></div><p class="detail-note">不含洗猫费用 · 演示订单</p><button class="detail-cta" data-action="contact">联系司机</button>`,'order');
  }
  function showContact(){
    if(flow.phase!=='matched')return;stopSpeech();
    openSheet('联系司机',`<div class="call-profile"><div class="driver-avatar">${driverPortrait}</div><h3>陈师傅</h3><p>贵A · D2688　白色比亚迪秦 PLUS</p><p>模拟通话</p></div><button class="call-end" aria-label="结束演示通话" data-close-sheet>${icon('phone')}</button>`,'contact');
  }
  function showHistory(){openSheet('对话记录',flow.messages.length?`<div class="history-content">${flow.messages.map(m=>messageNode(m.role,m.text).outerHTML).join('')}</div>`:'<p class="empty-history">暂无对话</p>','history');}
  function primary(){
    if(flow.phase==='idle'){begin();return;}
    if(interrupted){resumeConversation();return;}
    if(voice==='speaking'||flow.phase==='story'||flow.phase==='matching'||selectionPending){interruptConversation();return;}
    if(flow.phase==='options'){simulatePlanChoice();return;}
    speak(lastReply||'陈师傅接单了，预计八分钟到达。');
  }
  $('#primary').addEventListener('click',primary);$('#orb').addEventListener('click',toggleConversation);$('#voice-presence').addEventListener('click',toggleConversation);
  $('#exit').addEventListener('click',reset);$('#restart').addEventListener('click',reset);
  $('#hangup').addEventListener('click',reset);
  $('#text-input').addEventListener('click',()=>{$('#more-menu').hidden=true;$('#more').setAttribute('aria-expanded','false');openText();});
  $('#sound').addEventListener('click',()=>{
    sound=!sound;$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').setAttribute('aria-label',sound?'关闭语音播报':'开启语音播报');$('#sound').title=sound?'关闭语音播报':'开启语音播报';$('#sound .control-circle').innerHTML=icon(sound?'speaker-high-fill':'speaker-slash-fill');if(!sound){stopSpeech();if(voice==='speaking')setVoice('idle');if(flow.phase==='options'&&!interrupted&&!selectionPending){flow.startChoiceCountdown();scheduleDefaultChoice();}}
  });
  $('#more').addEventListener('click',event=>{event.stopPropagation();const menu=$('#more-menu');menu.hidden=!menu.hidden;$('#more').setAttribute('aria-expanded',String(!menu.hidden));});
  $('#history').addEventListener('click',()=>{showHistory();$('#more-menu').hidden=true;$('#more').setAttribute('aria-expanded','false');});
  document.addEventListener('click',event=>{
    if(!event.target.closest('#more-menu,#more')){$('#more-menu').hidden=true;$('#more').setAttribute('aria-expanded','false');}
    const plan=event.target.closest('[data-plan]');if(plan)choose(plan.dataset.plan);
    if(event.target.closest('#cancel-match'))cancelMatching();
    if(event.target.closest('[data-close-sheet]'))closeSheet();
    if(event.target===$('#modal-backdrop'))closeSheet();
    const command=event.target.closest('[data-command]');if(command)submitCommand(command.dataset.command);
    if(event.target.closest('[data-text-fallback]')){closeSheet();openText();}
    const action=event.target.closest('[data-action]');if(action?.dataset.action==='order')showOrder();if(action?.dataset.action==='contact')showContact();
  });
  document.addEventListener('submit',event=>{if(event.target.id==='text-form'){event.preventDefault();submitCommand(new FormData(event.target).get('command'));}});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeSheet();$('#more-menu').hidden=true;$('#more').setAttribute('aria-expanded','false');}
    if(event.key==='Tab'&&!$('#modal-backdrop').hidden){
      const controls=[...$('#sheet').querySelectorAll('button,input,[tabindex="0"]')].filter(x=>!x.disabled),first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===$('#sheet'))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&flow.phase==='matching'&&!interrupted)tickMatching();});
  window.addEventListener('pagehide',()=>{flow.session++;clearChoiceTimer();clearWaits();clearRetiringCards();clearInterval(matchTimer);stopSpeech();});
  sync();
})();
