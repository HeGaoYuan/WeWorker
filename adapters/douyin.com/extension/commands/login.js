/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){__webcliRegisterCommand('login',async(args={})=>{if(args.timeout!==undefined)window.__douyin.integer(args.timeout,300,900);return {__webcli_navigation:{version:1,url:'https://creator.douyin.com/',resume:false,result:{status:'login_required',message:'人工扫码或验证码登录，然后调用 whoami。'}}};});})();
