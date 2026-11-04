// No trusted identity comes from local storage alone. Revalidate with GoTrue.
// Optional notification transport must never decide whether authentication passed.
export function startNotificationSession({auth,onSession,onInvalidate,bind,cleanup,onNotificationError=()=>{},intervalMs=60000}) {
  let generation=0, identity=null, stopped=false, paused=false;
  const deadline = promise => new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Session check timed out')),8000);
    Promise.resolve(promise).then(resolve,reject).finally(()=>clearTimeout(timer));
  });
  const call = fn => { try { return Promise.resolve(fn()); } catch (error) { return Promise.reject(error); } };
  const clearNotifications=()=>{
    // Start BOTH immediately. A lost worker acknowledgement must not hold up
    // subscription cancellation (or ordinary login/logout).
    const cleared=call(()=>bind(null,0));
    const cleaned=call(cleanup);
    void Promise.allSettled([cleared,cleaned]).then(results=>{
      if(!stopped && results.some(r=>r.status==='rejected' || r.value?.ok===false)) onNotificationError();
    });
  };
  const invalidate=()=>{
    identity=null;
    // No more native destinations/profile callbacks survive this synchronous turn.
    onInvalidate();
    clearNotifications();
  };
  const check=async()=>{
    if(paused || stopped) return;
    const mine=++generation;
    let session;
    try {
      const {data,error}=await deadline(auth.getSession());
      session=data?.session;
      if (error || !session?.user?.id || !Number.isFinite(session.expires_at) || session.expires_at*1000<=Date.now()) throw new Error('No valid session');
      const verified=await deadline(auth.getUser());
      if (verified.error || verified.data?.user?.id!==session.user.id) throw new Error('Revoked session');
    } catch {
      if(!stopped && mine===generation) invalidate();
      return;
    }
    if(stopped || paused || mine!==generation) return;
    if(identity && identity!==session.user.id) invalidate();
    identity=session.user.id;
    // Start the fail-closed notification binding, but do not await optional I/O.
    const binding=call(()=>bind(identity,session.expires_at*1000));
    onSession(session);
    void binding.catch(()=>{
      if(stopped || paused || mine!==generation) return;
      onNotificationError();
      clearNotifications();
    });
  };
  const {data:{subscription}}=auth.onAuthStateChange((event,session)=>{
    generation++;
    if(paused || stopped) return;
    if(event==='SIGNED_OUT' || !session?.user || (identity && identity!==session.user.id)) invalidate();
    // Never await a Supabase call inside its auth-lock callback.
    if(event!=='SIGNED_OUT' && session?.user) setTimeout(()=>{if(!stopped) void check();},0);
  });
  const timer=intervalMs ? setInterval(()=>void check(),intervalMs) : null;
  return {check, pause(){paused=true;generation++;invalidate();}, resume(){paused=false;void check();}, stop(){stopped=true;generation++;subscription.unsubscribe();if(timer)clearInterval(timer);}};
}
