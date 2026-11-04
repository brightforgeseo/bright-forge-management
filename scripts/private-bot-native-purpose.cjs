'use strict';
// Host-only capability: JSON/metadata/footprint cannot manufacture a WeakMap key.
// Never returned by tool/Portal routes or serialised into receipts/journals.
const {isDeepStrictEqual:equal}=require('node:util');
const purposes=new WeakMap();
function issue(binding,validate,range){const key=Object.freeze(Object.create(null));purposes.set(key,{binding:structuredClone(binding),validate,range:range&&structuredClone(range)});return key;}
function get(key,binding){const p=key&&purposes.get(key);if(!p||!equal(p.binding,binding))throw Error('GOOGLE_NATIVE_PURPOSE_REQUIRED');return p;}
module.exports={issue,get};
