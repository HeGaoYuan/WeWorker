/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,AuthRequiredError,EmptyResultError,integer,navigate,same,guard,bool,loadDocument,getSelfUid,normalizeDoubanSubjectId,loadDoubanSubjectDetail,loadDoubanSubjectPhotos,loadDoubanBookHot,loadDoubanMovieHot,searchDouban}=window.__douban;async function fetchMarks(uid, status, limit) {
    const marks = [];
    let offset = 0;
    const pageSize = 15;
    while (true) {if(offset>=1500)throw new CommandExecutionError('Pagination exceeded the 1500-row safety bound; narrow the request');
        const url = `https://movie.douban.com/people/${uid}/${status}?start=${offset}&sort=time&rating=all&filter=all&mode=grid`;
        const document=await loadDocument(url);

        const pageMarks = await ((__portValue0)=>(
      () => {
        const results = [];

        const items = document.querySelectorAll('.item');

        items.forEach(item => {
          const titleLink = item.querySelector('.info a[href*="/subject/"]');
          if (!titleLink) return;

          const titleEl = titleLink.querySelector('em');
          const titleText = titleEl?.textContent?.trim() || titleLink.textContent?.trim() || '';
          const title = titleText.split('/')[0].trim();
          const href = titleLink.href || '';

          const idMatch = href.match(/subject\/(\d+)/);
          const movieId = idMatch ? idMatch[1] : '';

          if (!movieId || !title) return;

          const ratingSpan = item.querySelector('span[class*="rating"]');
          let myRating = null;
          if (ratingSpan) {
            const cls = ratingSpan.className || '';
            const ratingMatch = cls.match(/rating(\d)-t/);
            if (ratingMatch) {
              myRating = parseInt(ratingMatch[1], 10) * 2;
            }
          }

          const dateSpan = item.querySelector('.date');
          const myDate = dateSpan?.textContent?.trim() || '';

          const commentSpan = item.querySelector('.comment');
          const myComment = commentSpan?.textContent?.trim() || '';

          const introSpan = item.querySelector('.intro');
          let year = '';
          if (introSpan) {
            const introText = introSpan.textContent || '';
            const yearMatch = introText.match(/(\d{4})/);
            year = yearMatch ? yearMatch[1] : '';
          }

          results.push({
            movieId,
            title,
            year,
            myRating,
            myStatus: __portValue0,
            myComment,
            myDate,
            url: href || 'https://movie.douban.com/subject/' + movieId
          });
        });

        return results;
      }
    )())(status);
        if (!pageMarks || pageMarks.length === 0)
            break;
        marks.push(...pageMarks);
        if (pageMarks.length < pageSize)
            break;
        if (limit > 0 && marks.length >= limit)
            break;
        offset += pageSize;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return marks;
}
const run=async (kwargs={}) => {
        const { status = 'collect', limit = 50, uid: providedUid } = kwargs;
        const uid = providedUid || await getSelfUid();
        const statuses = status === 'all'
            ? ['collect', 'wish', 'do']
            : [status];
        const allMarks = [];
        for (const s of statuses) {
            const remaining = limit > 0 ? limit - allMarks.length : 0;
            if (limit > 0 && remaining <= 0)
                break;
            const marks = await fetchMarks(uid, s, remaining);
            allMarks.push(...marks);
        }
        return allMarks.slice(0, limit > 0 ? limit : undefined);
    };__webcliRegisterCommand("marks",async(params={})=>{const values={...{"status":"collect","limit":50},...params};if(values.limit==='0'||values.limit===0)values.limit=0;else values.limit=integer(values.limit,50,1500);if(!['collect','wish','do','all'].includes(values.status))throw new ArgumentError('Invalid mark status');if(values.uid!==undefined&&!/^[A-Za-z0-9_-]+$/.test(values.uid))throw new ArgumentError('Invalid uid');if(location.hostname!=='movie.douban.com')return navigate('https://movie.douban.com/');guard();const result=await run(values);if(Array.isArray(result)&&!result.length)throw new CommandExecutionError("No data extracted; empty result versus page failure is unknown");return result;});})();
