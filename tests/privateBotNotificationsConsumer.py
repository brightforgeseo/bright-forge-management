"""Offline tests: isolated stub adapters only; never imports/starts a live gateway."""
import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch
import os
ROOT = Path(os.environ.get('TEAM_PLUGIN_PATH', str(Path.home()/'.hermes/plugins/echo-team-work/__init__.py')))
# Stub only framework types; production plugin logic itself is loaded unchanged.
class Receipt:
    def __init__(self, success=True, message_id='22'):
        self.success, self.message_id = success, message_id
class Source:
    def __init__(self, **kwargs): self.__dict__.update(kwargs)
mods = {
    'hermes_constants': types.SimpleNamespace(get_hermes_home=lambda: Path('/home/benecho/.hermes')),
    'gateway.platforms.event': types.SimpleNamespace(MessageType=types.SimpleNamespace(TEXT='text')),
    'gateway.platforms.base': types.SimpleNamespace(SendResult=Receipt),
    'gateway.session': types.SimpleNamespace(SessionSource=Source),
    'gateway.config': types.SimpleNamespace(Platform=types.SimpleNamespace(TELEGRAM='telegram')),
}
with patch.dict(sys.modules, mods):
    spec=importlib.util.spec_from_file_location('staged_team', ROOT)
    plugin=importlib.util.module_from_spec(spec);spec.loader.exec_module(plugin)
ROW=dict(job_id='job',lease='lease',profile='default',chat_id='12345',message_id='10',text='result')
class Tests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls=[];self.sends=[];self.valid=True;self.error=False;self.receipt=Receipt()
        async def send(chat,text,reply_to=None):
            self.sends.append((chat,text,reply_to))
            if self.error: raise TimeoutError('unknown')
            return self.receipt
        self.adapter=types.SimpleNamespace(send=send)
        self.gateway=types.SimpleNamespace(_delivery_adapter_for=lambda source:self.adapter,
                                          _owning_profile=lambda a,p:(True,None))
        def request(action,payload):
            self.calls.append((action,payload));return {'ok':self.valid}
        self.p1=patch.object(plugin,'notification_request',request);self.p1.start()
        self.p2=patch.dict(sys.modules,mods);self.p2.start()
    async def asyncTearDown(self): self.p1.stop();self.p2.stop()
    async def test_success_receipt_and_reply(self):
        await plugin.deliver_completion(self.gateway,ROW)
        self.assertEqual([c[0] for c in self.calls],['validate','ack'])
        self.assertEqual(self.calls[-1][1]['receipt'],'22');self.assertEqual(self.sends[0][2],'10')
    async def test_revoked_no_send(self):
        self.valid=False;await plugin.deliver_completion(self.gateway,ROW);self.assertEqual(self.sends,[])
    async def test_unknown_no_replay(self):
        self.error=True;await plugin.deliver_completion(self.gateway,ROW)
        self.assertEqual(len(self.sends),1);self.assertEqual(self.calls[-1][0],'uncertain')
    async def test_no_receipt_uncertain(self):
        self.receipt=Receipt(message_id=None);await plugin.deliver_completion(self.gateway,ROW)
        self.assertEqual(self.calls[-1][0],'uncertain')
    async def test_profile_isolation(self):
        self.gateway._owning_profile=lambda a,p:(True,'other')
        await plugin.deliver_completion(self.gateway,ROW);self.assertEqual(self.sends,[])
        self.assertIsNone(plugin.completion_adapter(self.gateway,dict(ROW,profile='other')))
    async def test_ack_failure_never_resends(self):
        def request(action,payload):
            if action=='ack': raise OSError('lost ack')
            return {'ok':True}
        with patch.object(plugin,'notification_request',request):
            with self.assertRaises(OSError): await plugin.deliver_completion(self.gateway,ROW)
        self.assertEqual(len(self.sends),1)
    async def test_reload_bootstraps_without_inbound(self):
        tasks=[];callbacks=[];loop=asyncio.get_running_loop()
        self.gateway._gateway_loop=loop
        def spawn(coro,**kw): tasks.append(coro);coro.close()
        ctx=types.SimpleNamespace(register_hook=lambda *x:None,on_unload=callbacks.append,spawn_task=spawn)
        with patch.dict(sys.modules,{'gateway.run':types.SimpleNamespace(_gateway_runner_ref=lambda:self.gateway)}):
            plugin.register(ctx);await asyncio.sleep(0)
        self.assertEqual(len(tasks),1);self.assertEqual(len(callbacks),1)
    async def test_cold_start_bootstraps_after_loop_appears(self):
        tasks=[];callbacks=[];holder=[None]
        def spawn(coro,**kw): tasks.append(coro);coro.close()
        ctx=types.SimpleNamespace(register_hook=lambda *x:None,on_unload=callbacks.append,spawn_task=spawn)
        self.gateway._gateway_loop=asyncio.get_running_loop()
        with patch.dict(sys.modules,{'gateway.run':types.SimpleNamespace(_gateway_runner_ref=lambda:holder[0])}):
            plugin.register(ctx);holder[0]=self.gateway;await asyncio.sleep(0.3)
        self.assertEqual(len(tasks),1)
    async def test_unload_prevents_delayed_bootstrap(self):
        tasks=[];callbacks=[];holder=[None]
        def spawn(coro,**kw): tasks.append(coro);coro.close()
        ctx=types.SimpleNamespace(register_hook=lambda *x:None,on_unload=callbacks.append,spawn_task=spawn)
        self.gateway._gateway_loop=asyncio.get_running_loop()
        with patch.dict(sys.modules,{'gateway.run':types.SimpleNamespace(_gateway_runner_ref=lambda:holder[0])}):
            plugin.register(ctx);callbacks[0]();holder[0]=self.gateway;await asyncio.sleep(0.3)
        self.assertEqual(tasks,[])
if __name__=='__main__': unittest.main()
