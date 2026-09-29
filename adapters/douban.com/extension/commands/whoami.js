/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){__webcliRegisterCommand('whoami',async()=>{const c=window.__douban;if(location.hostname!=='movie.douban.com')return c.navigate('https://movie.douban.com/mine');c.guard();const uid=await c.getSelfUid();if(!uid)throw new c.AuthRequiredError('douban','No verified account identity');return {logged_in:true,uid};});})();
