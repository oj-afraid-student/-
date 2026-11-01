"""从团队 DOCX 重建契约样例；仅用 Python 标准库，不改写原始文档。"""
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'docs/李梓禾_知识点文档/详细版'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def read_doc(name):
    with ZipFile(SOURCE / name) as z:
        root = ET.fromstring(z.read('word/document.xml'))
        return [''.join(t.text or '' for t in p.findall('.//w:t', NS)) for p in root.findall('.//w:p', NS)]
def save(path, obj):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
def ok(data): return {'data': data, 'error': None}

book = '02_立体几何分层题库与解析.docx'
lines = read_doc(book)
student = read_doc('03_立体几何分层练习_学生作答版.docx')
types = {'单选':'SINGLE_CHOICE', '多选':'MULTIPLE_CHOICE', '填空':'FILL_BLANK', '判断说明':'JUDGMENT_REASON', '证明':'PROOF', '证明计算':'PROOF_CALCULATION', '探究证明':'EXPLORATION_PROOF', '综合解答':'COMPREHENSIVE'}
levels = {'基础':'BASIC','进阶':'INTERMEDIATE','综合':'COMPREHENSIVE'}
# 每个空有一个或多个值；acceptedValues 对每个值给出明确等价写法，不执行表达式。
fill = {
 'Q02': [('平面个数', [['2']], False, '个')],
 'Q06': [('下底面交线', [['AC','CA']], False, None),('上底面交线', [['A₁C₁','C₁A₁','A1C1','C1A1']], False, None),('交线关系', [['平行','∥']], False, None)],
 'Q13': [('sin θ', [['√3/3','sqrt(3)/3','1/√3','1/sqrt(3)']], False, None)],
 'Q14': [('所有可能距离', [['2'],['7']], True, None)],
 'Q18': [('体积', [['9/2','4.5']], False, None)],
 'Q21': [('所成角', [['60']], False, '度')],
}
parts = {
 'Q12':['证明 CC₁⊥平面 ABCD','说明 CC₁ 与 AB 是否垂直，并给出理由'],
 'Q17':['证明 PE⊥底面 ABCD','推出 PE⊥BC'],
 'Q19':['证明 a∥b','说明能否省略两条交线共面的依据'],
 'Q20':['证明平面 G₁G₂G₃∥底面 ABC','求两三角形面积比并写出推导'],
 'Q22':['找出二面角的平面角并证明','求该二面角的正切值并写出计算'],
 'Q23':['确定 F 的位置','证明必要性与充分性'],
 'Q24':['证明 AB⊥平面 PAD','求四棱锥体积并写出计算','求锐二面角的正切值并写出推导'],
}
figure = {'id':'cube-a-v1','src':'/geometry/cube-a-v1.png','alt':'正方体 ABCD—A₁B₁C₁D₁，下底面沿周界为 A、B、C、D，上底面逐点对应，虚线表示遮挡棱。','caption':'图 A；线段名称在位置关系问题中指其所在直线。辅助点按各题定义。'}
with ZipFile(SOURCE / book) as z:
    media = [x for x in z.namelist() if x.startswith('word/media/')]
    assert len(media) == 1 and media[0].endswith('.png')
    p = ROOT / 'public/geometry/cube-a-v1.png'
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(z.read(media[0]))
records = []
student_answers = []
for i, line in enumerate(lines):
    m = re.fullmatch(r'(Q\d{2})  (.+)', line)
    if not m: continue
    qid, title = m.groups()
    level, kind, tags = [x.strip() for x in lines[i+1].split('|')]
    end = next(j for j in range(i+2, len(lines)) if lines[j].startswith('来源：'))
    body = lines[i+2:end+1]
    stem = body[0]
    assert line in student and stem in student, f'学生版与解析版不一致: {qid}'
    knowledge = re.findall(r'G[123]-\d{2}|E[123]', tags)
    units = list(dict.fromkeys('SG-0'+k[1] if k.startswith('G') else k for k in knowledge))
    options = [{'id':s[0],'text':s[3:]} for s in body if re.match(r'^[A-D]\. ',s)]
    for option in options: assert option['id']+'. '+option['text'] in student
    q = {'id':qid,'version':1,'title':title,'stem':stem,'difficulty':levels[level], 'knowledgeIds':knowledge,'unitIds':units,'figures':[figure] if '图 A' in stem else [], 'sourceLabel':'李梓禾分层题库 '+qid,'type':types[kind]}
    ref = {'answerText':next(x[3:] for x in body if x.startswith('答案：')), 'explanation':next(x[3:] for x in body if x.startswith('解析：'))}
    grade = {'mode':'REVIEW_REQUIRED'}
    answer = {'type':q['type']}
    if options:
        q['options'] = options
        ids = list(ref['answerText'])
        grade = {'mode':'CHOICE_SET','correctOptionIds':ids}
        answer.update({'selectedOptionId':ids[0]} if kind == '单选' else {'selectedOptionIds':ids})
    elif kind == '填空':
        q['blanks'] = []
        grade = {'mode':'ALIASES_OR_REVIEW','blanks':[]}
        answer['blanks'] = []
        for n,(label,aliases,unordered,unit) in enumerate(fill[qid],1):
            bid = f'b{n}'
            q['blanks'].append({'id':bid,'label':label,'valueCount':len(aliases),'unordered':unordered,'unit':unit})
            grade['blanks'].append({'blankId':bid,'acceptedValues':aliases})
            answer['blanks'].append({'blankId':bid,'values':[a[0] for a in aliases]})
    elif kind == '判断说明':
        chunks = re.split('[①②]',stem)[1:]
        q['statements'] = [{'id':f's{j}','prompt':s} for j,s in enumerate(chunks,1)]
        answer['judgments'] = [{'statementId':f's{j}','value':j==2,'reason':'开发样例：请结合定理条件与反例复核我的说明。'} for j in (1,2)]
    else:
        q['parts'] = [{'id':f'p{j}','prompt':s} for j,s in enumerate(parts.get(qid,['写出完整证明过程']),1)]
        answer['parts'] = [{'partId':p['id'],'text':'开发样例：已填写推理过程，需人工对照参考解析复核。'} for p in q['parts']]
    records.append({'question':q,'reference':ref,'grading':grade,'source':{'document':book,'questionId':qid,'note':body[-1][3:]},'publicationStatus':'DRAFT'})
    student_answers.append(answer)
assert [r['question']['id'] for r in records] == [f'Q{i:02}' for i in range(1,25)]
save('fixtures/server/question-bank.json', records)
save('fixtures/content/questions.json', [r['question'] for r in records])

# 知识文档包含的例题保留在学习内容中，不重复计作 Q01—Q24 的独立作业题。
klines = read_doc('01_立体几何知识内容详解.docx')
sections = []
for i,line in enumerate(klines):
    m = re.match(r'^(G[123]-\d{2}|E[23]) (.+)$',line)
    if not m and line.startswith('拓展 E1 '): m = re.match(r'^拓展 (E1) (.+)$',line)
    if not m or '；' in line or '：' in line: continue
    kid,title = m.groups()
    if kid.startswith('G'):
        end = next(j for j in range(i+1,len(klines)) if klines[j].startswith('关联：'))+1
    else:
        end = next(j for j in range(i+1,len(klines)) if klines[j] in ['拓展 E2 与 E3 距离体积和向量方法','E3 空间向量作为拓展工具','统一模型与内容复核'])
    sections.append({'id':kid,'title':title,'paragraphs':klines[i+1:end]})
assert len(sections)==15
units = []
for n,(uid,title) in enumerate([('SG-01','空间位置关系'),('SG-02','线面平行'),('SG-03','线面垂直'),('E1','空间角'),('E2','距离与体积'),('E3','空间向量')],1):
    ss = [s for s in sections if (s['id'].startswith('G'+uid[-1]) if uid.startswith('SG') else s['id']==uid)]
    units.append({'id':uid,'title':title,'summary':'源文档学习内容；拓展单元按前置知识选学。' if uid.startswith('E') else '按定义、条件、例题与易错点组织。','order':n,'extension':uid.startswith('E'),'knowledgeIds':[s['id'] for s in ss],'questionIds':[r['question']['id'] for r in records if uid in r['question']['unitIds']],'sections':ss,'figures':[figure]})
save('fixtures/content/knowledge-units.json',units)

items = [{'id':f'fixture-item-{i:02}','position':i,'question':r['question']} for i,r in enumerate(records,1)]
practice = {'id':'fixture-practice-all','status':'OPEN','createdAt':'2026-11-01T03:00:00.000Z','totalCount':24,'selection':{'mode':'ALL'},'items':items,'submissionId':None}
submit = {'answers':[{'practiceItemId':item['id'],'answer':a} for item,a in zip(items,student_answers)]}
result_items = []
for item,a,r in zip(items,student_answers,records):
    auto = r['grading']['mode'] != 'REVIEW_REQUIRED'
    result_items.append({'practiceItemId':item['id'],'question':item['question'],'answer':a,'evaluation':{'status':'CORRECT' if auto else 'PENDING_REVIEW','isCorrect':True if auto else None,'score':1 if auto else None},'reference':r['reference']})
summary = {'id':'fixture-submission-all','practiceId':practice['id'],'submittedAt':'2026-11-01T03:30:00.000Z','totalCount':24,'gradedCount':11,'pendingCount':13,'correctCount':11,'gradingStatus':'PENDING_REVIEW','score':None,'maxScore':24}
result = {**summary,'items':result_items}
for name,data in [('create-request',{'mode':'ALL'}),('create-response',ok(practice)),('get-response',ok(practice)),('submit-request',submit),('submit-response',ok({'submissionId':summary['id'],'practiceId':practice['id'],'gradingStatus':summary['gradingStatus']})),('submitted-response',ok({**practice,'status':'SUBMITTED','submissionId':summary['id']})),('result-response',ok(result)),('history-response',ok({'items':[summary],'total':1,'page':1,'pageSize':20})),('history-empty-response',ok({'items':[],'total':0,'page':1,'pageSize':20}))]:
    save(f'fixtures/api/practice/{name}.json',data)
# 全部11个入口均提供可配对的请求/响应，供统一请求封装使用。
user = {'id':'fixture-user-001','username':'fixture_student'}
scenarios = []
def scenario(method,path,request,response,status=200):
    scenarios.append({'method':method,'path':'/api/v1'+path,'request':request,'status':status,'response':ok(response)})
for name in ['register','login']: scenario('POST','/auth/'+name,{'username':user['username'],'password':'fixture-only-password'},user,201 if name=='register' else 200)
scenario('POST','/auth/logout',None,{'success':True})
scenario('GET','/auth/me',None,user)
scenario('GET','/knowledge-points',None,[{k:v for k,v in u.items() if k not in ('sections','figures')} for u in units])
scenario('GET','/knowledge-points/SG-01',None,units[0])
scenario('POST','/practices',{'mode':'ALL'},practice,201)
scenario('GET','/practices/'+practice['id'],None,practice)
scenario('POST','/practices/'+practice['id']+'/submit',submit,{'submissionId':summary['id'],'practiceId':practice['id'],'gradingStatus':'PENDING_REVIEW'},201)
scenario('GET','/me/submissions?page=1&pageSize=20',None,{'items':[summary],'total':1,'page':1,'pageSize':20})
scenario('GET','/me/submissions/'+summary['id'],None,result)
save('fixtures/api/scenarios.json',scenarios)
save('fixtures/api/errors.json',[{'scenario':s,'status':status,'response':{'data':None,'error':{'code':code,'message':msg}}} for s,status,code,msg in [
 ('未登录',401,'UNAUTHENTICATED','请先登录'),('账号或密码错误',401,'UNAUTHENTICATED','账号或密码错误'),('空选题或漏答',400,'VALIDATION_ERROR','请按练习题项完整提交'),('资源不存在或属于其他人',404,'NOT_FOUND','记录不存在'),('重复提交且修改答案',409,'CONFLICT','该练习已提交，不能更改答案'),('题量不足',409,'CONFLICT','符合条件的题目数量不足'),('提交保存失败',503,'SERVICE_UNAVAILABLE','暂时无法保存，请使用相同答案重试'),('接口未实现',501,'NOT_IMPLEMENTED','业务接口尚未实现'),('未知异常',500,'INTERNAL_ERROR','服务异常，请稍后重试')]])
manifest = {'contractVersion':2,'questionCount':24,'knowledgeCount':15,'sourceFiles':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(SOURCE.glob('*.docx'))], 'questionIds':[r['question']['id'] for r in records], 'notes':['知识文档的例题保留于 sections；独立作业题以 Q01—Q24 为准。','与学生版逐题核对题号、题干与选项。','DRAFT 表示提取完成，未代替李梓禾的发布审核。']}
save('fixtures/server/source-manifest.json',manifest)
rows = ['# 全量题目与接口字段对照','', '以下为源文档全部 24 道独立练习题。知识详解中的例题另保留于知识单元 sections。题号稳定，修改内容须新增 version。', '', '| 题号 | 标题 | 难度 | 题型 | 知识点 | 作答结构 | 判定策略 |','| --- | --- | --- | --- | --- | --- | --- |']
for r in records:
    q=r['question']; structure = 'selectedOptionId' if q['type']=='SINGLE_CHOICE' else 'selectedOptionIds[]' if q['type']=='MULTIPLE_CHOICE' else '；'.join(f"{b['id']}:{b['label']}({b['valueCount']}值)" for b in q['blanks']) if q['type']=='FILL_BLANK' else '；'.join(p['id']+':'+p['prompt'] for p in q.get('parts',q.get('statements',[])))
    rows.append('| '+' | '.join([q['id'],q['title'],q['difficulty'],q['type'],'、'.join(q['knowledgeIds']),structure,r['grading']['mode']])+' |')
(ROOT/'docs/contracts/question-matrix.md').write_text('\n'.join(rows)+'\n')
print('已生成 24 题、15 个知识点、6 个单元、11 个接口场景及异常样例。')
