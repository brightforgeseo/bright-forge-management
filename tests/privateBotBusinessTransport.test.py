import importlib.util,pathlib,unittest,tempfile,json
from unittest.mock import patch
p=pathlib.Path(__file__).parents[1]/'scripts/private-bot-business-google.py'
s=importlib.util.spec_from_file_location('business',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Transport(unittest.TestCase):
 def base(self):return {'lane':'personal-google','fileId':'12345678901234567890','method':'GET','url':'https://docs.googleapis.com/v1/documents/12345678901234567890?includeTabsContent=true'}
 def test_valid_exact_file(self):self.assertEqual(m.validate(self.base())[0],'personal-google')
 def test_endpoint_rejections(self):
  for u in ['http://docs.googleapis.com/v1/documents/12345678901234567890','https://evil.test/v1/documents/12345678901234567890','https://docs.googleapis.com/v1/documents/foreign','https://docs.googleapis.com/v1/documents/12345678901234567890/permissions','https://www.googleapis.com/drive/v3/files','https://docs.googleapis.com/v1/documents/12345678901234567890?access_token=bad','https://user@docs.googleapis.com/v1/documents/12345678901234567890','https://docs.googleapis.com/v1/documents/12345678901234567890#bad']:
   with self.subTest(url=u),self.assertRaises(ValueError):m.validate({**self.base(),'url':u})
 def test_method_lane_and_payload_rejections(self):
  for changes in [{'lane':'default'},{'method':'DELETE'},{'headers':{}},{'body':'{}'},{'method':'POST'},{'fileId':'../secrets'}]:
   with self.subTest(changes=changes),self.assertRaises(ValueError):m.validate({**self.base(),**changes})
class Deadline(unittest.TestCase):
 def test_identity_delay_past_deadline_never_dispatches_post(self):
  now=[1000.0];calls=[]
  class Response:
   status_code=200
   def json(self):return {'user':{'emailAddress':'bensocialbeesmedia@gmail.com'}}
  class Session:
   def __init__(self,*args,**kwargs):pass
   def __enter__(self):return self
   def __exit__(self,*args):pass
   def get(self,*args,**kwargs):now[0]+=21;return Response()
   def request(self,*args,**kwargs):calls.append(args);raise AssertionError('Expired POST dispatched')
  with tempfile.TemporaryDirectory(dir='/home/benecho/.hermes/cache/scratch',prefix='business-deadline-') as d:
   f=pathlib.Path(d)/'.hermes/profiles/personal-google/google_token.json';f.parent.mkdir(parents=True);f.write_text('{}');f.chmod(0o600)
   r={'lane':'personal-google','fileId':'12345678901234567890','method':'POST','url':'https://docs.googleapis.com/v1/documents/12345678901234567890:batchUpdate','deadline':1020000,'body':json.dumps({'writeControl':{'requiredRevisionId':'r1'},'requests':[{'replaceAllText':{}}]})}
   with patch.object(m.pathlib.Path,'home',return_value=pathlib.Path(d)),patch.object(m.Credentials,'from_authorized_user_info',return_value=object()),patch.object(m,'AuthorizedSession',Session),patch.object(m.time,'time',side_effect=lambda:now[0]):
    with self.assertRaises(ValueError):m.execute(r)
   self.assertEqual(calls,[])
if __name__=='__main__':unittest.main()
