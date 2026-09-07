// Navigation hints never belong in origin-wide unscoped storage.
let user=null;
const keys=['openTaskModal','openChatNotification','openMyWorkTask'];
const scoped=key=>`bf-link:${user}:${key}`;
export function setNotificationLinkUser(id) {
  try {
    for(const key of keys) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      if(user && user!==id) sessionStorage.removeItem(scoped(key));
    }
  } catch {}
  user=id;
}
export const notificationLinkStorage={
  getItem(key) {try{return user ? sessionStorage.getItem(scoped(key)) : null;}catch{return null;}},
  setItem(key,value) {try{if(user)sessionStorage.setItem(scoped(key),value);}catch{}},
  removeItem(key) {try{if(user)sessionStorage.removeItem(scoped(key));}catch{}}
};
