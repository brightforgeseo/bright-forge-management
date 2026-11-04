"""Read-only canonical engine projection. No credentials, prose, or execution entrypoint.
Only fixed programme databases and package-confined, hash-bound receipt files.
"""
import hashlib,json,pathlib,re,sqlite3,sys
BASE=pathlib.Path('/home/benecho/state/article-production')
ROUTES={'10xr':('content-engine/all-clients.sqlite3','content-engine/production'), 'brightforge-clients':('brightforge-content-engine/brightforge-clients.sqlite3','brightforge-content-engine/production')}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read_job(programme,jid):
    if programme not in ROUTES or not re.fullmatch(r'[1-9][0-9]{0,15}',jid): raise ValueError('INVALID_ARTICLE_BINDING')
    db,root=ROUTES[programme]
    with sqlite3.connect(f'file:{BASE/db}?mode=ro',uri=True) as c:
        c.row_factory=sqlite3.Row
        row=c.execute('select * from jobs where id=? and programme=?',(int(jid),programme)).fetchone()
    if row is None: raise ValueError('ARTICLE_BINDING_NOT_FOUND')
    j=dict(row);p=pathlib.Path(j['package'].replace('/var/home/benpc/','/home/benecho/')).resolve()
    if not p.is_relative_to((BASE/root).resolve()):raise ValueError('ARTICLE_PACKAGE_BOUNDARY')
    out={'jobId':jid,'programme':programme,'client':j['client'],'source':j['spreadsheet_id'],'tab':j['sheet_tab'],'cell':j['target_cell'],'status':j['status'],'candidateSha256':j['candidate_sha256'],'proofVerified':False}
    if j['status']!='handoff_verified': return out
    q=json.loads(j['qa_json'] or '{}'); expected=q.get('native_receipt_sha256')
    if not (p/'article.md').is_file() or sha(p/'article.md')!=j['candidate_sha256']:return out
    if programme=='10xr' and isinstance(q.get('article_generation_simple'),dict):
        return read_tenxr(j,p,out,q['article_generation_simple'])
    if not expected:return out
    # Supported accepted successor receipts only. No latest-file heuristic.
    receipts=[f for f in p.glob('article-generation-simple/attempt-*/personal-native-delivery/receipt.json') if f.resolve().is_relative_to(p) and sha(f)==expected]
    if len(receipts)!=1:return out
    f=receipts[0];r=json.loads(f.read_bytes());a=f.parent.parent
    checks=[r.get('status')=='NATIVE_HANDOFF_VERIFIED',r.get('job_id')==int(jid),r.get('programme')==programme,r.get('source')==j['spreadsheet_id'],r.get('tab')==j['sheet_tab'],r.get('target_cell')==j['target_cell'],r.get('article_sha256')==j['candidate_sha256'],r.get('doc_id')==q.get('native_doc_id'),r.get('ACL_preserved') is True,r.get('whole_workbook_non_target_verified') is True]
    for key,rel in [('review_sha256','single-qa-review.json'),('targeted_sha256','personal-targeted-acceptance/targeted-checks.json')]:
        if key=='targeted_sha256' and r.get(key) is None and q.get(key) is None:continue
        file=a/rel;checks.append(file.resolve().is_relative_to(p) and file.is_file() and sha(file)==r.get(key)==q.get(key))
    if not all(checks):return out
    if not re.fullmatch(r'[A-Za-z0-9_-]{20,200}',r['doc_id']):return out
    out.update(proofVerified=True,receiptSha256=expected,reviewSha256=r['review_sha256'],targetedSha256=r['targeted_sha256'],docUrl='https://docs.google.com/document/d/'+r['doc_id']+'/edit',publicationApproved=False,expertApproved=False,proofKind='immutable accepted engine receipt, not a fresh Google read',packageIdentity=hashlib.sha256(str(p).encode()).hexdigest())
    return out
def read_tenxr(j,p,out,r):
    # Exact canonical receipt record, not a latest-file guess or a supplied PASS.
    route=r.get('route',{});directory=pathlib.Path(route.get('journal_root','/invalid'))
    if not directory.resolve().is_relative_to(p/'article-generation-simple') or directory.resolve()!=directory:return out
    f=directory/'receipt.json';local_path=directory/'local.json'
    if not f.is_file() or json.loads(f.read_bytes())!=r or not local_path.is_file():return out
    local=json.loads(local_path.read_bytes())
    if hashlib.sha256((json.dumps(local,ensure_ascii=False,sort_keys=True,indent=2)+'\n').encode()).hexdigest()!=r.get('candidate_provenance_sha256'):return out
    review_root=pathlib.Path(local.get('out','/invalid'))
    if not review_root.resolve().is_relative_to(p/'article-generation-simple'):return out
    job=local.get('job',{});rb=r.get('readback',{})
    checks=[r.get('status')=='NATIVE_HANDOFF_VERIFIED',r.get('job_id')==j['id'],r.get('article_sha256')==j['candidate_sha256'],route.get('programme')=='10xr',route.get('profile')=='tenxr-google',route.get('account')=='analytics@10xr.com.au',route.get('spreadsheet_id')==j['spreadsheet_id'],route.get('sheet_tab')==j['sheet_tab'],route.get('target_cell')==j['target_cell'],route.get('doc_id')==r.get('doc_id'),rb.get('job_id')==j['id'],rb.get('article_sha256')==j['candidate_sha256'],rb.get('sheet_linked_checked') is True,rb.get('doc_id')==r.get('doc_id'),hashlib.sha256(local.get('article','').encode()).hexdigest()==j['candidate_sha256']]
    checks.extend(job.get(k)==j[k] for k in ('id','programme','client','spreadsheet_id','sheet_tab','target_cell','h1','keywords','package'))
    for file,expected in [(review_root/'single-qa-review.json',local.get('review_sha256')),(directory/'courier-review.json',r.get('visual_review_sha256'))]:
        checks.append(file.resolve().is_relative_to(p) and file.is_file() and bool(expected) and sha(file)==expected)
    if not all(checks) or not re.fullmatch(r'[A-Za-z0-9_-]{20,200}',r.get('doc_id','')):return out
    out.update(proofVerified=True,receiptSha256=sha(f),reviewSha256=local['review_sha256'],targetedSha256=local.get('correction_verification_sha256'),docUrl='https://docs.google.com/document/d/'+r['doc_id']+'/edit',publicationApproved=False,expertApproved=False,proofKind='immutable accepted engine receipt, not a fresh Google read',packageIdentity=hashlib.sha256(str(p).encode()).hexdigest())
    return out

if __name__=='__main__':
    try:
        v=json.load(sys.stdin)
        if set(v)!={'programme','jobId'}:raise ValueError()
        print(json.dumps(read_job(v['programme'],v['jobId'])))
    except Exception:
        print(json.dumps({'error':'ARTICLE_BINDING_OR_PROOF_UNAVAILABLE'}));sys.exit(1)
