"""Consume only /bots private Telegram commands before general Echo authorisation.

No Telegram credential, Supabase credential, agent, tool dispatch or shared memory.
The local 0600 Unix socket is the trusted transport into the same Portal store.
"""
import asyncio
import http.client
import json
import os
import re
import socket
import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
BUILD_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


class LocalConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(25)
        self.sock.connect(os.path.expanduser('~/.cache/bright-forge-private-bots/telegram.sock'))


def command_request(user_id, text, chat_id, message_id):
    connection = LocalConnection('localhost', timeout=25)
    try:
        connection.request('POST', '/command', json.dumps({'telegramUserId': user_id, 'command': text, 'chatId': chat_id, 'messageId': message_id}), {'Content-Type': 'application/json'})
        response = connection.getresponse()
        data = json.loads(response.read(50000))
        return str(data.get('text') or 'Private bot command unavailable.')
    finally:
        connection.close()


async def dispatch(event, gateway, **kwargs):
    source = getattr(event, 'source', None)
    if getattr(getattr(source, 'platform', None), 'value', None) != 'telegram':
        return None
    text = getattr(event, 'text', '') or ''
    if not re.match(r'^(?:/bots(?:@[A-Za-z0-9_]+)?(?:\s|$)|bot\s*(?:10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)\b)', text, re.I):
        return None
    # Every matched command is consumed, including exceptions. It never enters Echo.
    try:
        user_id = str(getattr(source, 'user_id', '') or '')
        chat_id = str(getattr(source, 'chat_id', '') or '')
        if getattr(source, 'chat_type', None) != 'dm' or user_id != chat_id or getattr(source, 'is_bot', False) or not re.fullmatch(r'[1-9][0-9]{4,19}', user_id):
            return {'action': 'skip', 'reason': 'private_bot_non_dm_denied'}
        message_id = str(getattr(event, 'message_id', '') or '')
        if not re.fullmatch(r'[1-9][0-9]{0,19}', message_id):
            return {'action': 'skip', 'reason': 'private_bot_missing_message_identity'}
        adapter = gateway._delivery_adapter_for(source)
        if adapter is None:
            return {'action': 'skip', 'reason': 'private_bot_reply_adapter_unavailable'}
        logger.info('private_bot_ingress build=%s chat=%s message=%s', BUILD_SHA256, chat_id, message_id)
        result = await asyncio.to_thread(command_request, user_id, text, chat_id, message_id)
        # Direct reply only; same incoming DM, no MEDIA parser or unsolicited send.
        receipt = await adapter.send(chat_id, result, reply_to=message_id)
        if not getattr(receipt, 'success', False):
            return {'action': 'skip', 'reason': 'private_bot_reply_unconfirmed'}
        logger.info('private_bot_reply build=%s chat=%s incoming=%s reply=%s',
                    BUILD_SHA256, chat_id, message_id, getattr(receipt, 'message_id', None))
    except Exception:
        # No command/code/user content in logs and no fall-through to privileged Echo.
        return {'action': 'skip', 'reason': 'private_bot_command_failed'}
    return {'action': 'skip', 'reason': 'private_bot_command_handled'}


def register(ctx):
    ctx.register_hook('pre_gateway_dispatch', dispatch)
    logger.info('private_bot_hook_registered build=%s', BUILD_SHA256)
