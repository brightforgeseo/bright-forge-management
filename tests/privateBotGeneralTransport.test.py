import importlib.util,pathlib,json,time,unittest
p=pathlib.Path(__file__).parents[1]/'scripts/private-bot-business-google.py'
s=importlib.util.spec_from_file_location('business',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class General(unittest.TestCase):
 def request(self):
  fid='12345678901234567890'
  return {'lane':'tenxr-google','fileId':fid,'method':'POST','deadline':int(time.time()*1000)+20000,'url':'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,mimeType,parents','body':json.dumps({'name':'Private fixture','mimeType':'application/vnd.google-apps.document','parents':[fid],'appProperties':{'privateBotOperation':'a'*64},'content':'Non-client fixture'})}
 def test_create_is_exact_destination_and_native_only(self):
  self.assertEqual(m.validate(self.request())[0],'tenxr-google')
  for change in ({'parents':['foreign']},{'mimeType':'application/vnd.google-apps.folder'},{'permissions':[{'type':'anyone'}]},{'content':'x'*60001}):
   r=self.request();b=json.loads(r['body']);b.update(change);r['body']=json.dumps(b)
   with self.subTest(change=list(change)),self.assertRaises(ValueError):m.validate(r)
 def test_general_batch_cannot_mutate_acl_or_unapproved_operations(self):
  r=self.request();r['url']='https://docs.googleapis.com/v1/documents/'+r['fileId']+':batchUpdate';r['body']=json.dumps({'requests':[{'deleteContentRange':{}},{'insertText':{}}],'writeControl':{'requiredRevisionId':'r1'}});m.validate(r)
  for request in ({'updateDocumentStyle':{}},{'createNamedRange':{}},{'permissions':{}}):
   r['body']=json.dumps({'requests':[request],'writeControl':{'requiredRevisionId':'r1'}})
   with self.subTest(request=request),self.assertRaises(ValueError):m.validate(r)
if __name__=='__main__':unittest.main()
