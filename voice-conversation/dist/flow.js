(function(root){
  'use strict';
  const PLANS=Object.freeze({
    single:Object.freeze({id:'single',title:'把猫送到宠物店',short:'单程送猫',price:28,reply:'选择单程送猫，28元',stops:['家','宠物店'],description:'从家里接猫，送到指定宠物店'}),
    full:Object.freeze({id:'full',title:'送猫、等洗、接猫回来',short:'全程接送',price:200,reply:'选择全程接送，200元',stops:['家','宠物店','等候洗护','家'],description:'送猫到店、等候洗护，再接猫回家'})
  });
  const MATCH_DURATION=10000;
  const CHOICE_DELAY=5000;
  const ROUTE=Object.freeze({home:'凤凰城',shop:'四月宠物医院',time:'10:30'});
  function parseChoice(text){
    const input=String(text||'').trim().replace(/[\s，。,.！!？?]/g,'');
    if(/不选|不要|取消|再看看|不需要/.test(input))return null;
    if(/全程|来回|往返|接回来|接猫回来|接回家|两百|二百|200|第二|方案二|选二|等洗|等候/.test(input))return 'full';
    if(/单程|28|二十八|第一|方案一|选一|只送|送到宠物店|把猫送到/.test(input))return 'single';
    return null;
  }
  function matchingStep(elapsed){return elapsed>=MATCH_DURATION?'matched':elapsed>=6800?'confirming':elapsed>=3400?'notifying':'searching';}
  class Flow{
    constructor(){this.reset();}
    reset(){this.phase='idle';this.plan=null;this.startedAt=null;this.optionsStartedAt=null;this.pausedAt=null;this.messages=[];this.session=(this.session||0)+1;}
    begin(){if(this.phase!=='idle')return false;this.phase='story';return true;}
    interrupt(now=Date.now()){if(this.phase==='idle'||this.pausedAt!==null)return false;this.session++;this.pausedAt=now;return true;}
    resume(now=Date.now()){if(this.pausedAt===null)return false;const duration=Math.max(0,now-this.pausedAt);if(this.phase==='matching')this.startedAt+=duration;if(this.phase==='options'&&this.optionsStartedAt!==null)this.optionsStartedAt+=duration;this.pausedAt=null;return true;}
    showOptions(){if(this.phase!=='story'||this.pausedAt!==null)return false;this.phase='options';this.optionsStartedAt=null;return true;}
    startChoiceCountdown(now=Date.now()){if(this.phase!=='options'||this.pausedAt!==null||this.optionsStartedAt!==null)return false;this.optionsStartedAt=now;return true;}
    choiceDue(now=Date.now()){return this.phase==='options'&&this.pausedAt===null&&this.optionsStartedAt!==null&&now-this.optionsStartedAt>=CHOICE_DELAY;}
    select(id,now=Date.now()){if(this.phase!=='options'||this.pausedAt!==null||!PLANS[id])return false;this.plan=PLANS[id];this.phase='matching';this.startedAt=now;this.optionsStartedAt=null;return true;}
    finish(now=Date.now()){if(this.phase!=='matching'||this.pausedAt!==null||now-this.startedAt<MATCH_DURATION)return false;this.phase='matched';return true;}
    cancel(now=Date.now()){if(this.phase!=='matching')return false;this.phase='options';this.plan=null;this.startedAt=null;this.optionsStartedAt=now;this.pausedAt=null;return true;}
    add(role,text){if(!['ai','user'].includes(role)||!String(text).trim())return null;const message={role,text:String(text)};this.messages.push(message);return message;}
  }
  const api={PLANS,MATCH_DURATION,CHOICE_DELAY,ROUTE,parseChoice,matchingStep,Flow};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.VoiceFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this);
