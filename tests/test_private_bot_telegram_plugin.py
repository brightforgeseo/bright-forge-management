import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec=importlib.util.spec_from_file_location('private_bot_plugin',Path(__file__).parents[1]/'integrations/hermes-private-bots/__init__.py')
assert spec is not None and spec.loader is not None
plugin=importlib.util.module_from_spec(spec);spec.loader.exec_module(plugin)

class HookSecurity(unittest.IsolatedAsyncioTestCase):
    async def test_private_command_consumed_with_transport_identity(self):
        calls=[];sends=[]
        setattr(plugin,'command_request',lambda uid,text,chat,mid:calls.append((uid,text,chat,mid)) or 'owned reply')
        async def send(chat,text,reply_to=None):
            sends.append((chat,text,reply_to))
            return SimpleNamespace(success=True,message_id='99')
        gateway=SimpleNamespace(_delivery_adapter_for=lambda src:SimpleNamespace(send=send))
        source=SimpleNamespace(platform=SimpleNamespace(value='telegram'),user_id='999990001',chat_id='999990001',chat_type='dm',is_bot=False)
        event=SimpleNamespace(source=source,text='/bots 1 ask fixture',message_id='12')
        result=await plugin.dispatch(event,gateway)
        self.assertEqual(result['action'],'skip');self.assertEqual(calls[0][0],'999990001');self.assertEqual(sends[0][0],'999990001')
        calls.clear();sends.clear();source.chat_type='group'
        self.assertEqual((await plugin.dispatch(event,gateway))['action'],'skip');self.assertEqual(calls,[]);self.assertEqual(sends,[])
        source.chat_type='dm';source.chat_id='999990002'
        self.assertEqual((await plugin.dispatch(event,gateway))['action'],'skip');self.assertEqual(calls,[])
        event.text='/settings';self.assertIsNone(await plugin.dispatch(event,gateway))
    async def test_natural_commands_consumed_before_echo(self):
        calls=[]
        setattr(plugin,'command_request',lambda uid,text,chat,mid:calls.append((uid,text,chat,mid)) or 'owned reply')
        async def send(*args,**kwargs):return SimpleNamespace(success=True,message_id='99')
        gateway=SimpleNamespace(_delivery_adapter_for=lambda src:SimpleNamespace(send=send))
        source=SimpleNamespace(platform=SimpleNamespace(value='telegram'),user_id='7887803972',chat_id='7887803972',chat_type='dm',is_bot=False)
        for text in ['/bots','Bot one check rankings','Bot four check traffic']:
            result=await plugin.dispatch(SimpleNamespace(source=source,text=text,message_id='12'),gateway)
            self.assertEqual(result,{'action':'skip','reason':'private_bot_command_handled'})
            self.assertEqual(calls[-1],('7887803972',text,'7887803972','12'))
    async def test_backend_exception_never_falls_into_echo(self):
        def fail(*args):raise RuntimeError('fixture')
        setattr(plugin,'command_request',fail)
        source=SimpleNamespace(platform=SimpleNamespace(value='telegram'),user_id='999990001',chat_id='999990001',chat_type='dm',is_bot=False)
        result=await plugin.dispatch(SimpleNamespace(source=source,text='/bots',message_id='12'),SimpleNamespace())
        self.assertEqual(result['action'],'skip')

    async def test_missing_identity_and_failed_send_do_not_claim_success(self):
        calls=[]
        setattr(plugin,'command_request',lambda *args:calls.append(args) or 'owned reply')
        source=SimpleNamespace(platform=SimpleNamespace(value='telegram'),user_id='999990001',chat_id='999990001',chat_type='dm',is_bot=False)
        async def send(*args,**kwargs):return SimpleNamespace(success=False,error='fixture')
        gateway=SimpleNamespace(_delivery_adapter_for=lambda src:SimpleNamespace(send=send))
        missing=await plugin.dispatch(SimpleNamespace(source=source,text='/bots',message_id=None),gateway)
        self.assertEqual(missing['reason'],'private_bot_missing_message_identity');self.assertEqual(calls,[])
        failed=await plugin.dispatch(SimpleNamespace(source=source,text='/bots',message_id='42'),gateway)
        self.assertEqual(failed['reason'],'private_bot_reply_unconfirmed')
        self.assertEqual(calls,[('999990001','/bots','999990001','42')])
        calls.clear()
        gateway._delivery_adapter_for=lambda src:None
        self.assertEqual((await plugin.dispatch(SimpleNamespace(source=source,text='/bots',message_id='42'),gateway))['reason'],'private_bot_reply_adapter_unavailable')
        self.assertEqual(calls,[])

if __name__=='__main__':unittest.main()
