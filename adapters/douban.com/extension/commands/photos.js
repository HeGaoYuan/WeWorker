/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112, Apache-2.0.
 * Modified for WeWorker v2 registration, direct page extraction and bounded host navigation. */
(function(){const {CliError,ArgumentError,CommandExecutionError,AuthRequiredError,EmptyResultError,integer,navigate,same,guard,bool,loadDocument,getSelfUid,normalizeDoubanSubjectId,loadDoubanSubjectDetail,loadDoubanSubjectPhotos,loadDoubanBookHot,loadDoubanMovieHot,searchDouban}=window.__douban;
const run=async (kwargs={}) => {
        const subjectId = normalizeDoubanSubjectId(String(kwargs.id || ''));
        const data = await loadDoubanSubjectPhotos(subjectId, {
            type: String(kwargs.type || 'Rb'),
            limit: Number(kwargs.limit) || 120,
        });
        return data.photos.map((photo) => ({
            subject_id: data.subjectId,
            subject_title: data.subjectTitle,
            type: data.type,
            index: photo.index,
            photo_id: photo.photoId,
            title: photo.title,
            image_url: photo.imageUrl,
            thumb_url: photo.thumbUrl,
            detail_url: photo.detailUrl,
            page: photo.page,
        }));
    };__webcliRegisterCommand("photos",async(params={})=>{const values={...{"type":"Rb","limit":120},...params};values.limit=integer(values.limit,120,500);const target='https://movie.douban.com/subject/'+normalizeDoubanSubjectId(values.id)+'/photos?type='+encodeURIComponent(values.type);if(!same(target))return navigate(target);guard();const result=await run(values);if(Array.isArray(result)&&!result.length)throw new CommandExecutionError("No data extracted; empty result versus page failure is unknown");return result;});})();
