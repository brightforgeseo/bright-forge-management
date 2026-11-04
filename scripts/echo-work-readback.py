"""Read only the exact native mission/goal. Never infer success from child stdout."""
import hashlib,json,os,re,sys
from pathlib import Path
home=Path(os.environ.get('HERMES_HOME',Path.home()/'.hermes'))
sys.path.insert(0,str(home/'hermes-agent'))
from hermes_cli.goals import load_goal
from hermes_state import SessionDB

def readback(directory,verifier):
 data=json.loads((Path(directory)/'mission.json').read_text());sid=data['sid']
 if not re.fullmatch(r'\d{8}_\d{6}_[0-9a-f]{6}',sid):raise ValueError('invalid native session identifier, not normalised')
 goal=load_goal(sid)
 if data.get('status')!='done' or not goal or goal.status!='done':raise ValueError('native mission is not done')
 if not goal.gates or any(g.command!=verifier or g.last_exit_code!=0 for g in goal.gates):raise ValueError('native completion gate is not passing')
 db=SessionDB(home/'state.db')
 try:session=db.get_session(sid)
 finally:db.close()
 if not session or session.get('source')!='cli':raise ValueError('native standalone source mismatch')
 response=next((m['content'] for m in reversed(data.get('history',[])) if m.get('role')=='assistant' and isinstance(m.get('content'),str) and m['content'].strip()),'')
 if not response:raise ValueError('missing actual returned response')
 return {'response':response,'native_session':sid,'source':'cli','gate_exit':0,'gate_output_sha256':[hashlib.sha256(g.last_output_tail.encode()).hexdigest() for g in goal.gates],'turns':data['turns']}
if __name__=='__main__':
 try:print(json.dumps(readback(sys.argv[1],sys.argv[2])))
 except Exception as e:print(str(e),file=sys.stderr);raise SystemExit(1)
