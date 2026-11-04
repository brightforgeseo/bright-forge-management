'use strict';
// Trusted service configuration only. Never accept runtime paths from tool arguments.
const path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
let cached;
function googleEnvironment(env=process.env){const home=env.HOME||os.homedir(),profile=env.HERMES_HOME||env.PRIVATE_BOT_GOOGLE_HOME||path.join(home,'.hermes');if(!path.isAbsolute(profile))throw Error('GOOGLE_PROFILE_HOME_INVALID');return {...Object.fromEntries(['HOME','PATH','LANG','LC_ALL','TMPDIR','SYSTEMROOT'].filter(k=>env[k]!==undefined).map(k=>[k,env[k]])),HERMES_HOME:profile};}
function probePython(command){const result=spawnSync(command,['-c','import google.auth.transport.requests; import google.oauth2.credentials'],{env:googleEnvironment(),encoding:'utf8',timeout:5000,stdio:['ignore','ignore','ignore']});return !result.error&&result.status===0;}
function resolvePython(env=process.env,probe=probePython){const key=JSON.stringify([env.PRIVATE_BOT_GOOGLE_PYTHON,env.VIRTUAL_ENV,env.HERMES_HOME,env.PRIVATE_BOT_GOOGLE_HOME,env.PATH]);if(probe===probePython&&cached?.key===key)return cached.command;const candidates=env.PRIVATE_BOT_GOOGLE_PYTHON?[env.PRIVATE_BOT_GOOGLE_PYTHON]:[env.VIRTUAL_ENV&&path.join(env.VIRTUAL_ENV,'bin/python'),env.HERMES_HOME&&path.join(env.HERMES_HOME,'.venv/bin/python'),'/opt/hermes-agent/venv/bin/python','python3'].filter(Boolean);for(const command of candidates){if(probe(command)){if(probe===probePython)cached={key,command};return command;}}throw Error('GOOGLE_PYTHON_UNAVAILABLE');}
module.exports={googleEnvironment,resolvePython};
