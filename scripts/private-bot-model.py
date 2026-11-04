#!/usr/bin/env python3
"""Model-only, bounded Responses continuation. No agent/session/history loading."""
import json
import logging
import os
import sys
import time

# A dedicated helper must never emit SDK request bodies or raw provider errors.
logging.disable(logging.CRITICAL)
# Exact private-interface family, independently reviewed before adoption.
# Keep the global durable source-count bound unchanged.
import hashlib
_RUNTIME_ROOT = os.path.expanduser('~/.hermes/hermes-agent')
_RUNTIME_FILES = {'hermes_bootstrap.py': 'f242036b2d35b92283b9a7e97c7059e537607fc4b02026f657a6d00cb4683f69', 'agent/auxiliary_client.py': 'd86ad24c75ec8d9cd153595f58fede8c321774adaf71b650d380cafd257cfae2', 'agent/auxiliary_codex_response.py': 'c3dde8e9cd05d2f9f8d6bc220aee4bb87a95dbe06ebca182f3c3ff527257d06b', 'agent/codex_responses_adapter.py': 'c86e14ebe721e94f86a1a50266272c364ccea9660a6da456eb00fa109e5f054d', 'agent/codex_runtime.py': '88bbcfb34e4a7ab4aadf50ea6409eb35a5a6a615dd821a322768215864756f30', 'agent/sdk_transform_bypass.py': '6887046105bd5e666631aa9a0d0a81488392ba8978ede650ae4e31abc36ccbd6', 'agent/transports/codex.py': '8fa8c7a29cc39d1a70a165ba85a1d902742bb1d595dcfd0b3ef3365181223f2c'}
def _runtime_sources_match(root):
    try:
        for relative, expected in _RUNTIME_FILES.items():
            with open(os.path.join(root, relative), 'rb') as source:
                if hashlib.sha256(source.read()).hexdigest() != expected:
                    return False
        return True
    except OSError:
        return False

def _runtime_drift():
    sys.stderr.write('{"event":"model_state","stage":"client","errorClass":"RuntimeError","code":"MODEL_RUNTIME_SOURCE_DRIFT"}\n')
    sys.exit(1)

if not _runtime_sources_match(_RUNTIME_ROOT):
    _runtime_drift()

sys.path.insert(0, _RUNTIME_ROOT)
import hermes_bootstrap
from importlib.metadata import version as _package_version
try:
    if _package_version('openai') != '2.24.0':
        _runtime_drift()
except Exception:
    _runtime_drift()
from agent.auxiliary_client import _build_codex_client, _CodexStreamGuard
from agent.codex_runtime import _consume_codex_event_stream
from agent.codex_responses_adapter import _normalize_codex_response
from agent.sdk_transform_bypass import bypass_sdk_request_transform

STAGES = {'input', 'client', 'translate', 'provider_request', 'provider_stream',
          'provider_result', 'tool_emit', 'tool_reply_wait', 'tool_reply_received',
          'output', 'closed'}
CODES = {'MODEL_RUNTIME_SOURCE_DRIFT', 'MODEL_UNAVAILABLE', 'MODEL_EMPTY_RESPONSE', 'MODEL_INCOMPLETE_RESPONSE',
         'TOOL_PROTOCOL_MISMATCH', 'TOOL_BUDGET_EXCEEDED', 'TOOL_TURN_LIMIT',
         'TOOLS_UNAVAILABLE', 'MODEL_TIMEOUT', 'INVALID_TOOL_ARGUMENTS'}
ERROR_CLASSES = {'TimeoutError', 'APITimeoutError', 'APIConnectionError',
                 'BadRequestError', 'AuthenticationError', 'PermissionDeniedError',
                 'RateLimitError', 'InternalServerError', 'RuntimeError', 'ValueError',
                 'JSONDecodeError', 'BrokenPipeError', 'EOFError'}
PROVIDER_CODES = {'invalid_encrypted_content', 'rate_limit_exceeded',
                  'insufficient_quota', 'invalid_request_error', 'server_error'}
stage = 'input'

def state(value, error=None):
    global stage
    if value not in STAGES:
        value = 'closed'
    stage = value
    out = {'event': 'model_state', 'stage': value}
    if error is not None:
        kind = type(error).__name__
        out['errorClass'] = kind if kind in ERROR_CLASSES else 'OtherError'
        status = getattr(error, 'status_code', None)
        if type(status) is int and 400 <= status <= 599:
            out['status'] = status
        code = getattr(error, 'code', None)
        if isinstance(code, str) and code in PROVIDER_CODES:
            out['providerCode'] = code
        # Only our own exact fixed messages, never arbitrary exception text.
        if type(error) is RuntimeError and error.args and isinstance(error.args[0], str) and error.args[0] in CODES:
            out['code'] = error.args[0]
    sys.stderr.write(json.dumps(out) + '\n')
    sys.stderr.flush()

def complete_turn(client, options):
    """Reuse installed request translation, streaming guard and full normalizer.

    The auxiliary chat shim discards reasoning/phase sidecars. Do not monkeypatch
    it: retain the canonical full normalization result in this local consumer.
    """
    state('translate')
    wire, model, timeout = client.chat.completions._build_responses_kwargs(options)
    aliases = wire.pop('_wire_aliases', None) or {}
    issuer = wire.pop('_issuer_kind', None)
    # store=False continuation needs the provider's opaque reasoning, not a
    # fabricated summary. No effort, tier, provider or model default is changed.
    wire['include'] = ['reasoning.encrypted_content']
    guard = _CodexStreamGuard(client._real_client, timeout, no_progress_timeout=timeout)
    try:
        guard.start()
        state('provider_request')
        stream = client._real_client.responses.create(**bypass_sdk_request_transform({**wire, 'stream': True}))
        guard.adopt_stream(stream)
        try:
            state('provider_stream')
            final = stream if hasattr(stream, 'output') else _consume_codex_event_stream(stream, model=model, on_event=guard.on_event)
        finally:
            guard.release_stream(stream)
        state('provider_result')
        if final is None or getattr(final, 'status', None) != 'completed':
            raise RuntimeError('MODEL_INCOMPLETE_RESPONSE')
        message, finish = _normalize_codex_response(final, issuer_kind=issuer, issuer_model=model, recover_leaked_tool_call=False)
        if finish not in {'stop', 'tool_calls'}:
            raise RuntimeError('MODEL_INCOMPLETE_RESPONSE')
        for tc in message.tool_calls or []:
            tc.function.name = aliases.get(tc.function.name, tc.function.name)
        return message
    finally:
        guard.finish()

def main():
    state('input')
    payload = json.loads(sys.stdin.readline())
    messages = payload['messages']
    if not isinstance(messages, list) or len(messages) > 32:
        raise ValueError('invalid model input')
    if any(set(m) != {'role', 'content'} or m['role'] not in ('system', 'user', 'assistant') or not isinstance(m['content'], str) for m in messages):
        raise ValueError('invalid model message')
    state('client')
    client, model = _build_codex_client('gpt-6-astra')
    if client is None or model != 'gpt-6-astra':
        raise RuntimeError('MODEL_UNAVAILABLE')
    deadline = time.monotonic() + 200
    try:
        tools = payload.get('tools') or []
        calls = 0
        seen = set()
        for turn in range(6):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError('MODEL_TIMEOUT')
            options = {'model': model, 'messages': messages, 'max_tokens': 6000, 'temperature': 1, 'timeout': min(60.0, remaining)}
            if tools:
                options['tools'] = tools
            message = complete_turn(client, options)
            requested = message.tool_calls or []
            if not requested:
                answer = message.content
                if not isinstance(answer, str) or not answer.strip():
                    raise RuntimeError('MODEL_EMPTY_RESPONSE')
                state('output')
                if payload.get('agentProtocol'):
                    print(json.dumps({'event': 'completed', 'response': answer}), flush=True)
                else:
                    sys.stdout.write(answer)
                return
            if not tools or not payload.get('agentProtocol'):
                raise RuntimeError('TOOLS_UNAVAILABLE')
            serialised = [{'id': item.id, 'call_id': item.call_id, 'type': 'function', 'function': {'name': item.function.name, 'arguments': item.function.arguments}} for item in requested]
            assistant = {'role': 'assistant', 'content': message.content or '', 'tool_calls': serialised}
            for key in ('codex_reasoning_items', 'codex_message_items'):
                if getattr(message, key, None):
                    assistant[key] = getattr(message, key)
            messages.append(assistant)
            # Validate a whole parallel batch before emitting any of its calls.
            ids = [item.id for item in requested]
            if any(not isinstance(x, str) or not x or x in seen for x in ids) or len(set(ids)) != len(ids):
                raise RuntimeError('TOOL_PROTOCOL_MISMATCH')
            if calls + len(requested) > 8:
                raise RuntimeError('TOOL_BUDGET_EXCEEDED')
            for item in requested:
                arguments = json.loads(item.function.arguments)
                if not isinstance(arguments, dict):
                    raise RuntimeError('INVALID_TOOL_ARGUMENTS')
                calls += 1
                seen.add(item.id)
                state('tool_emit')
                print(json.dumps({'event': 'tool_call', 'callId': item.id, 'name': item.function.name, 'arguments': arguments}), flush=True)
                state('tool_reply_wait')
                line = sys.stdin.readline()
                if not line:
                    raise RuntimeError('TOOL_PROTOCOL_MISMATCH')
                reply = json.loads(line)
                if set(reply) != {'callId', 'result'} or reply['callId'] != item.id:
                    raise RuntimeError('TOOL_PROTOCOL_MISMATCH')
                state('tool_reply_received')
                messages.append({'role': 'tool', 'tool_call_id': item.id, 'content': json.dumps(reply['result'])})
        raise RuntimeError('TOOL_TURN_LIMIT')
    finally:
        client.close()

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        state(stage, error)
        sys.exit(1)
