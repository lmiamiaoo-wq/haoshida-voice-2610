const test=require('node:test');
const assert=require('node:assert/strict');
const {Flow,PLANS,MATCH_DURATION,CHOICE_DELAY,parseChoice,matchingStep}=require('../dist/flow.js');

test('语音能区分单程、全程、金额、序号，拒绝取消与含糊指令',()=>{
  for(const text of ['单程送猫','选择28元的','二十八元','选第一个方案','只送到宠物店'])assert.equal(parseChoice(text),'single',text);
  for(const text of ['全程接送','送猫等洗接猫回来','选第二个','两百元','来回接送'])assert.equal(parseChoice(text),'full',text);
  for(const text of ['取消全程','不要28元','再看看','送去宠物店','你好',''])assert.equal(parseChoice(text),null,text);
});
test('单程与全程均需等待完整10秒；重复选择不产生重复订单',()=>{
  for(const id of Object.keys(PLANS)){
    const flow=new Flow();assert.equal(flow.select(id,0),false);assert.equal(flow.begin(),true);assert.equal(flow.begin(),false);
    assert.equal(flow.showOptions(),true);assert.equal(flow.select(id,1000),true);assert.equal(flow.select(id,2000),false);
    assert.equal(flow.plan.price,id==='single'?28:200);assert.equal(flow.finish(1000+MATCH_DURATION-1),false);
    assert.equal(flow.finish(1000+MATCH_DURATION),true);assert.equal(flow.phase,'matched');assert.equal(flow.finish(12000),false);
  }
});
test('匹配提示按顺序推进，后台恢复后也能正确完成',()=>{
  assert.equal(matchingStep(0),'searching');assert.equal(matchingStep(3399),'searching');assert.equal(matchingStep(3400),'notifying');
  assert.equal(matchingStep(6800),'confirming');assert.equal(matchingStep(9999),'confirming');assert.equal(matchingStep(10000),'matched');assert.equal(matchingStep(60000),'matched');
});
test('取消匹配后可重新选择，重置使旧会话失效并清空数据',()=>{
  const flow=new Flow();const first=flow.session;flow.begin();flow.showOptions();flow.select('full',0);flow.add('user','全程接送');
  assert.equal(flow.cancel(),true);assert.equal(flow.phase,'options');assert.equal(flow.plan,null);assert.equal(flow.finish(20000),false);
  assert.equal(flow.select('single',20000),true);assert.equal(flow.finish(30000),true);flow.reset();
  assert.equal(flow.session,first+1);assert.equal(flow.phase,'idle');assert.equal(flow.plan,null);assert.deepEqual(flow.messages,[]);
});

test('模拟打断保留剧情，再次点击恢复，暂停期间不推进',()=>{
  const flow=new Flow();assert.equal(flow.interrupt(),false);assert.equal(flow.resume(),false);flow.begin();flow.add('user','10:30 洗猫');
  const session=flow.session;assert.equal(flow.interrupt(100),true);assert.equal(flow.session,session+1);assert.equal(flow.phase,'story');assert.equal(flow.messages.length,1);
  assert.equal(flow.interrupt(200),false);assert.equal(flow.showOptions(),false);assert.equal(flow.resume(500),true);assert.equal(flow.pausedAt,null);assert.equal(flow.showOptions(),true);
  flow.select('full',1000);const matchingSession=flow.session;
  flow.interrupt(4000);assert.equal(flow.session,matchingSession+1);assert.equal(flow.phase,'matching');assert.equal(flow.plan.id,'full');assert.equal(flow.startedAt,1000);
  assert.equal(flow.finish(20000),false);assert.equal(flow.resume(14000),true);assert.equal(flow.startedAt,11000);
  assert.equal(flow.finish(20999),false);assert.equal(flow.finish(21000),true);
});

test('暂停时可取消匹配，取消和重置均清除暂停状态',()=>{
  const flow=new Flow();flow.begin();flow.showOptions();flow.select('single',0);flow.interrupt(1000);
  assert.equal(flow.cancel(),true);assert.equal(flow.pausedAt,null);assert.equal(flow.select('full',2000),true);
  flow.interrupt(3000);flow.reset();assert.equal(flow.phase,'idle');assert.equal(flow.pausedAt,null);assert.equal(flow.resume(5000),false);
});

test('播报结束后满5秒才允许默认选择，手动选择后默认选择失效',()=>{
  const flow=new Flow();assert.equal(flow.choiceDue(10000),false);flow.begin();flow.showOptions();
  assert.equal(flow.choiceDue(60000),false);assert.equal(flow.optionsStartedAt,null);
  assert.equal(flow.startChoiceCountdown(1000),true);assert.equal(flow.startChoiceCountdown(2000),false);
  assert.equal(CHOICE_DELAY,5000);assert.equal(flow.choiceDue(5999),false);assert.equal(flow.choiceDue(6000),true);
  assert.equal(flow.select(Object.values(PLANS)[0].id,6000),true);assert.equal(flow.plan.id,'single');assert.equal(flow.choiceDue(20000),false);
  flow.reset();flow.begin();flow.showOptions();flow.startChoiceCountdown(1000);flow.select('full',5999);
  assert.equal(flow.choiceDue(6000),false);assert.equal(flow.plan.id,'full');assert.equal(flow.optionsStartedAt,null);
});

test('暂停不消耗默认选择时间，恢复后保留剩余秒数',()=>{
  const flow=new Flow();flow.begin();flow.showOptions();flow.startChoiceCountdown(1000);flow.interrupt(3000);
  assert.equal(flow.choiceDue(20000),false);flow.resume(13000);
  assert.equal(flow.choiceDue(15999),false);assert.equal(flow.choiceDue(16000),true);
});

test('播报中打断和恢复不启动计时，播报结束前仍可手动选择',()=>{
  const flow=new Flow();flow.begin();flow.showOptions();flow.interrupt(1000);
  assert.equal(flow.startChoiceCountdown(5000),false);flow.resume(20000);
  assert.equal(flow.optionsStartedAt,null);assert.equal(flow.choiceDue(40000),false);
  assert.equal(flow.select('full',40000),true);assert.equal(flow.startChoiceCountdown(50000),false);assert.equal(flow.plan.id,'full');
});

test('取消订单重新展示方案后重计5秒，挂断重置清除选择期限',()=>{
  const flow=new Flow();flow.begin();flow.showOptions(0);flow.select('full',1000);flow.cancel(2000);
  assert.equal(flow.choiceDue(6999),false);assert.equal(flow.choiceDue(7000),true);
  flow.reset();assert.equal(flow.optionsStartedAt,null);assert.equal(flow.choiceDue(100000),false);
});
