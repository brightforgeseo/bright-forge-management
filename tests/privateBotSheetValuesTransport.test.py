import importlib.util,pathlib,json,time,unittest
p=pathlib.Path(__file__).parents[1]/'scripts/private-bot-business-google.py'
s=importlib.util.spec_from_file_location('business',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Values(unittest.TestCase):
 def request(self):
  fid='12345678901234567890'
  return {'lane':'tenxr-google','fileId':fid,'method':'POST','deadline':int(time.time()*1000)+20000,'url':'https://sheets.googleapis.com/v4/spreadsheets/'+fid+':batchUpdate','body':json.dumps({'requests':[{'updateCells':{'range':{'sheetId':7,'startRowIndex':0,'endRowIndex':1,'startColumnIndex':0,'endColumnIndex':4},'rows':[{'values':[{}, {'userEnteredValue':{'numberValue':3}}, {'userEnteredValue':{'formulaValue':'=SUM(A1:B1)'}}, {'userEnteredValue':{'stringValue':'=literal'}}]}],'fields':'userEnteredValue'}}]})}
 def test_typed_values_only_transport(self):self.assertEqual(m.validate(self.request())[0],'tenxr-google')
 def test_reject_format_scope_shape_and_invalid_values(self):
  for kind in ('fields','row','column','format','nan','type','multi','range'):
   r=self.request();b=json.loads(r['body']);u=b['requests'][0]['updateCells']
   if kind=='fields':u['fields']='*'
   if kind=='row':u['rows']=[]
   if kind=='column':u['rows'][0]['values']=[]
   if kind=='format':u['rows'][0]['values'][0]={'userEnteredFormat':{'bold':True}}
   if kind=='nan':u['rows'][0]['values'][1]['userEnteredValue']['numberValue']=float('nan')
   if kind=='type':u['rows'][0]['values'][1]['userEnteredValue']['numberValue']=True
   if kind=='multi':u['rows'][0]['values'][1]['userEnteredValue']['boolValue']=True
   if kind=='range':u['range']['endRowIndex']=500
   r['body']=json.dumps(b)
   with self.subTest(kind=kind),self.assertRaises(ValueError):m.validate(r)
if __name__=='__main__':unittest.main()
