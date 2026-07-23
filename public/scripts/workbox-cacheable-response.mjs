/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/workbox-cacheable-response@7.4.1/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import"/npm/workbox-core@7.4.1/_private/assert.js/+esm";import"/npm/workbox-core@7.4.1/_private/WorkboxError.js/+esm";import"/npm/workbox-core@7.4.1/_private/getFriendlyURL.js/+esm";import"/npm/workbox-core@7.4.1/_private/logger.js/+esm";try{self["workbox:cacheable-response:7.4.0"]&&_()}catch{}class h{constructor(e={}){this._statuses=e.statuses,this._headers=e.headers}isResponseCacheable(e){let s=!0;return this._statuses&&(s=this._statuses.includes(e.status)),this._headers&&s&&(s=Object.keys(this._headers).some(a=>e.headers.get(a)===this._headers[a])),s}}class c{constructor(e){this.cacheWillUpdate=async({response:s})=>this._cacheableResponse.isResponseCacheable(s)?s:null,this._cacheableResponse=new h(e)}}export{h as CacheableResponse,c as CacheableResponsePlugin};
//# sourceMappingURL=/sm/8203d1b0313ae728cae3dd46efa47cde300bba16884aef74b7fc76345a6831e6.map