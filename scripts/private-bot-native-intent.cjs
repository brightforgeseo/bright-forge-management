'use strict';
// This is a negative intent fence, NEVER a source of data/action authority.
// Inspect the complete envelope, including headers and mixed instructions.
// The original request is neither rewritten nor used to mint capabilities.
// Native operation, root, account, purpose and dispatch checks remain separate.
function ordinaryIntent(text){
 if(typeof text!=='string')return false;
 // Only standalone, unconditional no-send policy clauses are inert. Exceptions,
 // mixed instructions and additional control text are still examined in full.
 const inspected=text.replace(/(^|[.!?;\n]\s*)do not (?:publish or send|send or publish|publish|send) anything\s*(?=[.!?;\n]|$)/gi,'$1');
 if(/\b(?:credentials?|passwords?|secrets?)\b/i.test(inspected))return false;
 if(/\b(?:bypass|override|ignore|disable)\b[^.!?\n]*\b(?:canonical|engine|safeguards?|permissions?|authority|guards?|policy)\b/i.test(inspected))return false;
 if(/\b(?:change|edit|configure|modify|install|update|reset)\b[^.!?\n]*\b(?:echo|hermes)\b[^.!?\n]*\b(?:config(?:uration)?|settings?|models?|profiles?|crons?|system|control.plane)\b/i.test(inspected)||/\b(?:restart|stop)\s+(?:the\s+)?(?:echo|hermes|gateway)\b/i.test(inspected)||/\b(?:change|edit|modify|configure|reset)\b[^.!?\n]*\b(?:system settings|system configuration|profiles?|crons?|control.plane)\b/i.test(inspected))return false;
 if(/\b(?:write|draft|generate|rewrite|repair|produce)\b[^.!?\n]*\b(?:articles?|blog posts?|content.?engine)\b/i.test(inspected))return false;
 // Imperative send/publish/destructive verbs, not plural metrics or gerunds.
 // 'email sends' and 'publishing schedules' describe report data, not actions.
 if(/\b(?:correct|edit|update|optimise)\s+(?:(?:the|a|an|selected)\s+){0,2}(?:article|blog post)\b/i.test(inspected)||/\b(?:article production|content.?engine|canonical bypass)\b/i.test(inspected))return false;
 if(/\b(?:send|publish|share|delete|trash|erase)\b(?!\s+(?:button|field|label|column)\b)/i.test(inspected))return false;
 if(/\bemail\s+(?:it|this|that|the|a|an|to|me|them|him|her)\b/i.test(inspected))return false;
 return true;
}
module.exports={ordinaryIntent};
