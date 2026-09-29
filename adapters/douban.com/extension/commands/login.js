/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){__webcliRegisterCommand('login',async(args={})=>{if(args.timeout!==undefined)window.__douban.integer(args.timeout,300,900);return {__webcli_navigation:{version:1,url:'https://accounts.douban.com/passport/login',resume:false,result:{status:'login_required',message:'人工完成登录后调用 whoami'}}};});})();
