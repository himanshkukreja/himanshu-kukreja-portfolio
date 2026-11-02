/**
 * One-time localStorage carry-over from himanshukukreja.in to systemdesignmastery.dev.
 *
 * localStorage is per origin, so a signed-out learner's progress (XP, lesson ticks, reviews,
 * notebook drafts, settings) would stay behind on the old domain. Signed-in learners' progress is
 * in the database and follows them anyway; their browser-only state (settings, drafts) rides along too.
 *
 *   old host  CARRY_JS (in the bridge page the middleware serves instead of the 301, and on
 *             portfolio pages for clicks on course links): reads the site's keys, gzips them
 *             (CompressionStream) into base64url, sets the hk_moved cookie (so it happens once),
 *             then location.replace(<new URL>#hk-import=<data>). Nothing to carry → straight on.
 *   new host  IMPORT_JS (first script in <head>): clears the fragment, writes every carried key the
 *             browser didn't already have on the new domain (never overwrites), then reloads the
 *             page once so the app starts from the imported state.
 *
 * The fragment never reaches a server (no proxy / CDN URL limits). It is capped at MAX_FRAGMENT
 * characters: browsers take far more (Chrome 2 MB, Firefox 1 MB, Safari > 80 k), but the URL sits in
 * session history for a moment. Over the cap, the biggest nice-to-have keys (notebook ink, PDF and
 * annotation stores, caches) are dropped first, and the new host says which kinds were left behind.
 *
 * Plain ES2017 strings: they run before (or without) the app bundle.
 */

/** Cookie set on the old host once the carry ran: later visits get the plain 301. */
export const MOVED_COOKIE = "hk_moved";
export const IMPORT_PARAM = "hk-import";
export const MAX_FRAGMENT = 60000;

/**
 * Defines window.__hkCarry(target) on the old host. Keys never carried: Supabase sessions (sign in
 * again on the new domain; tokens don't belong in a URL), PostHog / analytics queues and leases,
 * admin caches, chat locks, the offline library's records (its Cache Storage can't move).
 */
export const CARRY_JS = `(function(){
var MAX=${MAX_FRAGMENT};
var SKIP=/^(?:sb-|ph_|__|_grecaptcha|auth_redirect_path$|analytics_session_|hk\\.an\\.q|hk\\.chat\\.busy:|hk\\.adminMe\\.|hk\\.adminPreview|hk\\.admin\\.|hk\\.offline\\.|hk\\.app\\.depth|hk\\.pwa\\.)/;
var BIG=/^(?:hk\\.ink\\.|hk\\.inknote\\.|hk\\.annot\\.|hk\\.board\\.|hk\\.paper\\.|hk\\.search\\.recent|hk\\.sync\\.|caseplay:)/;
function b64(bytes){var s="",i,c=0x8000;for(i=0;i<bytes.length;i+=c)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+c));return btoa(s).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}
function gz(text){if(typeof CompressionStream!=="function")return Promise.resolve("j."+b64(new TextEncoder().encode(text)));var cs=new CompressionStream("gzip");var w=cs.writable.getWriter();w.write(new TextEncoder().encode(text));w.close();return new Response(cs.readable).arrayBuffer().then(function(b){return "g."+b64(new Uint8Array(b));});}
function setCookie(){try{document.cookie="${MOVED_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");}catch(e){}}
window.__hkCarry=function(target){
  var went=false,go=function(frag){if(went)return;went=true;setCookie();location.replace(target+(frag||""));};
  var hash=(target.indexOf("#")<0&&location.hash&&location.hash.indexOf("${IMPORT_PARAM}=")<0)?location.hash:"";
  try{
    var d={},keys=[],i,k,v;
    for(i=0;i<localStorage.length;i++){k=localStorage.key(i);if(k==null||SKIP.test(k))continue;v=localStorage.getItem(k);if(v==null)continue;d[k]=v;keys.push(k);}
    if(!keys.length)return go(hash);
    var order=keys.slice().sort(function(a,b){var ta=BIG.test(a)?1:0,tb=BIG.test(b)?1:0;return tb-ta||d[b].length-d[a].length;});
    var dropped=[];
    var pack=function(){return gz(JSON.stringify({v:1,at:Date.now(),h:hash,x:dropped,d:d}));};
    var attempt=function(n){return pack().then(function(s){
      if(s.length<=MAX||!order.length||n>60)return s.length<=MAX?s:null;
      var k2=order.shift();dropped.push(k2);delete d[k2];return attempt(n+1);
    });};
    var p=attempt(0).then(function(s){go(s?"#${IMPORT_PARAM}="+s:hash);},function(){go(hash);});
    setTimeout(function(){go(hash);},4000);
    return p;
  }catch(e){go(hash);}
};
})();`;

/**
 * Runs first in <head> on every page; does nothing unless the URL carries #hk-import=. Keys the
 * new domain already has are never overwritten; the rest are written, a note of what moved (and
 * what was too big to carry) goes to sessionStorage for the one-line notice, and the page reloads
 * once at its clean URL (plus the hash the old link had) so every store starts from the imported state.
 */
export const IMPORT_JS = `(function(){try{
var h=location.hash,m=h.match(/[#&]${IMPORT_PARAM}=([gj]\\.[A-Za-z0-9_-]*)/);if(!m)return;
var had={},i;for(i=0;i<localStorage.length;i++)had[localStorage.key(i)]=1;
history.replaceState(history.state,"",location.pathname+location.search);
var raw=m[1],b=atob(raw.slice(2).replace(/-/g,"+").replace(/_/g,"/")),u=new Uint8Array(b.length);for(i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
var text=raw.charAt(0)==="g"?new Response(new Response(u).body.pipeThrough(new DecompressionStream("gzip"))).text():Promise.resolve(new TextDecoder().decode(u));
function mig(v){if(typeof v!=="string")return v;if(v.indexOf("/learn")===0||v.indexOf("/stories")===0)v=JSON.parse(mig(JSON.stringify(v)));
  return v.split('"/learn/system-design-mastery/').join('"/').split('"/learn/system-design-mastery"').join('"/"').split('"/learn/').join('"/').split('"/learn"').join('"/"').split('"/stories/').join('"/case-files/').split('"/stories"').join('"/case-files"');}
text.then(function(t){var p=JSON.parse(t),n=0,s=0,k;
  for(k in p.d){if(!Object.prototype.hasOwnProperty.call(p.d,k))continue;if(had[k]){s++;continue;}try{localStorage.setItem(k,mig(p.d[k]));n++;}catch(e){}}
  try{sessionStorage.setItem("hk.moved",JSON.stringify({n:n,kept:s,dropped:p.x||[]}));}catch(e){}
  if(n>0)location.replace(location.pathname+location.search+(p.h||""));
  else if(p.h)history.replaceState(history.state,"",location.pathname+location.search+p.h);
}).catch(function(){});
}catch(e){}})();`;

/** Friendly names for the kinds of keys a carry can leave behind (shown in the notice). */
export function droppedKinds(keys: string[]): string[] {
  const kinds = new Set<string>();
  for (const k of keys) {
    if (/^hk\.(ink|inknote)\./.test(k)) kinds.add("notebook pages");
    else if (/^hk\.annot\./.test(k)) kinds.add("highlights and margin notes");
    else if (/^hk\.board\./.test(k)) kinds.add("whiteboard drafts");
    else if (/^hk\.paper\./.test(k)) kinds.add("paper grading details");
    else if (/^caseplay:/.test(k)) kinds.add("case-file activity drafts");
    else kinds.add("some cached settings");
  }
  return [...kinds];
}
