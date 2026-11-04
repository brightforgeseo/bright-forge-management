'use strict';

const ALLOWED_KINDS = new Set(['chat', 'content', 'keywords', 'audit', 'business-inbox', 'local-analysis']);
const MAX_MESSAGE_CHARS = 12_000;
const MAX_HISTORY_ITEMS = 12;
const MAX_HISTORY_ITEM_CHARS = 2_000;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uuid(value) {
  const normalised = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalised)
    ? normalised
    : null;
}

function normaliseEchoJob(input) {
  if (!input || typeof input !== 'object') throw new Error('Echo job payload is required');
  const kind = text(input.kind || 'chat');
  if (!ALLOWED_KINDS.has(kind)) throw new Error('Unsupported Echo job kind');
  const message = text(input.message);
  if (!message) throw new Error('Echo job message is required');
  if (message.length > MAX_MESSAGE_CHARS) throw new Error('Echo job message is too long');
  const history = Array.isArray(input.history) ? input.history.slice(-MAX_HISTORY_ITEMS).map((item) => ({
    role: text(item?.role) === 'assistant' ? 'assistant' : 'user',
    content: text(item?.content).slice(0, MAX_HISTORY_ITEM_CHARS),
  })).filter((item) => item.content) : [];
  return {
    kind,
    message,
    sourceMessageId: uuid(input.sourceMessageId),
    channelId: uuid(input.channelId),
    parentMessageId: uuid(input.parentMessageId),
    history,
    attachments: require('./private-bot-attachments.cjs').validate(input.attachments),
    sessionKey: text(input.sessionKey).slice(0, 200) || null,
    maxAttempts: 3,
  };
}

function retryDelaySeconds(attempt) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  return Math.min(900, 15 * (2 ** (safeAttempt - 1)));
}

module.exports = { ALLOWED_KINDS, normaliseEchoJob, retryDelaySeconds };
