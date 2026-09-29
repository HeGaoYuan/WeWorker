/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {integer,navigate,same,guard,CliError,CommandExecutionError}=window.__douban;__webcliRegisterCommand('top250',async(args={})=>{const limit=integer(args.limit,250,250),url='https://movie.douban.com/top250';if(!same(url))return navigate(url);guard();const rows=await (async () => {
  const results = [];
  const limit = args.limit === undefined ? 250 : Number(args.limit);

  const parsePage = (doc) => {
    const items = doc.querySelectorAll('.item');
    for (const item of items) {
      if (results.length >= limit) break;

      const rankEl = item.querySelector('.pic em');
      const linkEl = item.querySelector('a');
      const titleEl = item.querySelector('.title');
      const ratingEl = item.querySelector('.rating_num');

      const href = linkEl?.href || '';
      const matchResult = href.match(/subject\/(\d+)/);
      const id = matchResult ? matchResult[1] : '';

      const title = titleEl?.textContent?.trim() || '';
      const rank = parseInt(rankEl?.textContent || '0', 10);
      const rating = ratingEl?.textContent?.trim() || '';

      if (id && title) {
        results.push({
          rank: rank || results.length + 1,
          id,
          title,
          rating: rating ? parseFloat(rating) : null,
          url: href
        });
      }
    }
  };

  parsePage(document);

  for (let start = 25; start < 250 && results.length < limit; start += 25) {
    const resp = await fetch(`https://movie.douban.com/top250?start=${start}`);
    if(!resp.ok)throw new CliError('HTTP_ERROR','Douban pagination HTTP '+resp.status);
    const html = await resp.text();
    if (!html) break;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    parsePage(doc);
    await new Promise(r => setTimeout(r, 150));
  }

  return results;
}
)();if(!rows.length)throw new CommandExecutionError('No Top250 entries extracted; inspect page');return rows;});})();
