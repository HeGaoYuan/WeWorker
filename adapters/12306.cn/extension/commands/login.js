/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){__webcliRegisterCommand('login',async(args={})=>{if(args.timeout!==undefined)window.__rail12306.normalizeLimit(args.timeout,300,900);return window.__rail12306.navigate('https://kyfw.12306.cn/otn/resources/login.html',false);});})();
