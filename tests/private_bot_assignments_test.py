"""Offline Authority.check only: no canonical engine, Google, model or live API."""
import importlib.util, json, pathlib, tempfile, unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
spec=importlib.util.spec_from_file_location('assignment_queue',pathlib.Path(__file__).resolve().parents[1]/'scripts/private-bot-article-queue.py')
q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
OWNER='11111111-1111-4111-8111-111111111111'
SOURCE='12345678901234567890'
class AssignmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.file=pathlib.Path(self.tmp.name)/'approved.json'
        self.grants=[dict(owner=OWNER,boardId='fixture-board',source=SOURCE,client='Fixture')]
        self.file.write_text(json.dumps(dict(grants=self.grants)));self.file.chmod(0o600)
        self.v=dict(owner=OWNER,portalJob='fixture-job',bot='fixture-bot',binding=dict(source=SOURCE,client='Fixture'),grant=dict(boardId='fixture-board',taskId='fixture-task'))
        self.task=dict(id='fixture-task',assignedTo=['foreign',OWNER],clientSheet=f'https://docs.google.com/spreadsheets/d/{SOURCE}/edit')
        self.board=dict(id='fixture-board',board_data=dict(name='Fixture',groups=[dict(tasks=[self.task])]))
        self.eligible=True
        self.job=dict(id='fixture-job',status='running',lease_expires_at=(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat())
        self.authority=object.__new__(q.Authority)
        def api(url):
            if '/rpc/private_bot_access' in url:return self.eligible
            if '/private_bot_jobs?' in url:return [self.job]
            if '/client_boards?' in url:return [self.board]
            self.fail('unexpected API '+url)
        self.authority.api=lambda url,*args:api(url)
        self.patcher=patch.object(q,'GRANTS',self.file);self.patcher.start();self.addCleanup(self.patcher.stop)
    def test_valid_assignment_shapes(self):
        for assigned in [OWNER,[OWNER],['foreign',OWNER]]:
            with self.subTest(assigned=assigned):
                self.task['assignedTo']=assigned
                try:self.authority.check(self.v,enqueue=True)
                except q.Held as exc:self.fail(f'valid assignment denied: {exc}')
    def test_malformed_or_foreign_assignments_rejected(self):
        for assigned in ['foreign',[],None,{},[[OWNER]],[OWNER,{}],[OWNER,None],[OWNER,1],[OWNER,[OWNER]],{'0':OWNER},True,1,' '+OWNER]:
            with self.subTest(assigned=assigned):
                self.task['assignedTo']=assigned
                with self.assertRaises(q.Held):self.authority.check(self.v,enqueue=True)
    def test_independent_gates_still_deny_coassignment(self):
        self.eligible=False
        with self.assertRaisesRegex(q.Held,'SOURCE_GRANT'):self.authority.check(self.v,enqueue=True)
        self.eligible=True;self.job['status']='completed'
        with self.assertRaisesRegex(q.Held,'LEASE'):self.authority.check(self.v,enqueue=True)
        self.job['status']='running';self.job['lease_expires_at']='2000-01-01T00:00:00+00:00'
        with self.assertRaisesRegex(q.Held,'LEASE'):self.authority.check(self.v,enqueue=True)
        self.job['lease_expires_at']=(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat()
        self.file.write_text('{"grants":[]}')
        with self.assertRaisesRegex(q.Held,'SOURCE_GRANT'):self.authority.check(self.v,enqueue=True)
        self.file.write_text(json.dumps(dict(grants=self.grants)))
        self.board['board_data']['name']='Paused Fixture'
        with self.assertRaisesRegex(q.Held,'SOURCE_GRANT'):self.authority.check(self.v,enqueue=True)
if __name__=='__main__':unittest.main(verbosity=2)
