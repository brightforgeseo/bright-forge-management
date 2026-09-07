// No trusted identity comes from local storage alone. Revalidate with GoTrue.
export function startNotificationSession({auth,onSession,onInvalidate,bind,cleanup,intervalMs=60000}) {
  let generation=0, identity=null, stopped=false;
  const deadline = promise => new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Session check timed out')),8000);
    Promise.resolve(promise).then(resolve,reject).finally(()=>clearTimeout(timer));
  });
  const invalidate=()=>{
    identity=null;
    // Call synchronously: no more native destinations/profile callbacks survive.
    onInvalidate();
    void bind(null,0).catch(()=>{});
    void cleanup().catch(()=>{});
  };
  const check=async()=>{
    const mine=++generation;
    try {
      const {data}=await deadline(auth.getSession());
      const session=data?.session;
      if (!session?.user || session.expires_at*1000<=Date.now()) throw new Error('No valid session');
      const verified=await deadline(auth.getUser());
      if (verified.error || verified.data?.user?.id!==session.user.id) throw new Error('Revoked session');
      if(stopped || mine!==generation) return;
      if(identity && identity!==session.user.id) invalidate();
      identity=session.user.id;
      await bind(identity,session.expires_at*1000);
      if(stopped || mine!==generation) return;
      onSession(session);
    } catch {
      if(!stopped && mine===generation) invalidate();
    }
  };
  const {data:{subscription}}=auth.onAuthStateChange((event,session)=>{
    generation++;
    if(!session?.user || (identity && identity!==session.user.id)) invalidate();
    // Never await a Supabase call inside its auth-lock callback.
    if(session?.user) setTimeout(()=>{if(!stopped) void check();},0);
  });
  const timer=intervalMs ? setInterval(()=>void check(),intervalMs) : null;
  return {check,stop(){stopped=true;generation++;subscription.unsubscribe();if(timer)clearInterval(timer);}};
}
