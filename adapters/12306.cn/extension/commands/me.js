/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){const {ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload}=window.__rail12306;const MAX_PAGE_SIZE=50;
__webcliRegisterCommand("me",async (kwargs = {}) => {

        if (!ready()) return navigate('https://kyfw.12306.cn/otn/view/index.html');

        const json = await window.__rail12306.json('/otn/modifyUser/initQueryUserInfoApi');
        if (json?.__http) {
            if ([401, 403].includes(Number(json.__http))) {
                throw new AuthRequiredError('kyfw.12306.cn', '12306 account info requires a valid login session');
            }
            throw new CommandExecutionError(`12306 returned HTTP ${json.__http} for account info`);
        }
        if (json?.__parse) {
            throw new CommandExecutionError(`12306 account info returned non-JSON body: ${json.__parse}`);
        }
        if (isAuthLikePayload(json)) {
            throw new AuthRequiredError('kyfw.12306.cn', '12306 account info requires a valid login session');
        }
        if (json?.status !== true || !json?.data?.userDTO) {
            throw new CommandExecutionError('12306 account info payload missing userDTO');
        }
        const dto = json.data.userDTO;
        const loginDto = dto.loginUserDTO || {};
        const username = loginDto.user_name || loginDto.name || '';
        const realName = loginDto.real_name || loginDto.realname || '';
        const include = boolean(kwargs['include-sensitive']);
        return [{
            username,
            real_name: include ? realName : maskChineseName(realName),
            email: include ? (dto.email || '') : maskEmail(dto.email || ''),
            mobile: include ? (dto.mobile_no || '') : maskMobile(dto.mobile_no || ''),
            birth_date: include ? (dto.born_date || '') : (dto.born_date || '').slice(0, 4),
            sex: dto.sex_code === 'M' ? '男' : (dto.sex_code === 'F' ? '女' : ''),
            country: dto.country_code || '',
            user_type: json.data.userTypeName || '',
            member: dto.flag_member === '1',
            active: dto.is_active === '1',
        }];
    });})();
