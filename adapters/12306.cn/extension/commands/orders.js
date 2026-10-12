/* Adapted from jackwener/OpenCLI 24136945847afbfad266c6c46a8cd335377f9112 (Apache-2.0).
 * Modified for WeWorker v2: page-local APIs, strict arguments and host navigation continuation. */
(function(){const {ArgumentError,CommandExecutionError,EmptyResultError,AuthRequiredError,normalizeLimit,boolean,navigate,ready,request,fetchStationBundle,resolveStation,validateDate,parseTrainRecord,maskEmail,maskMobile,maskChineseName,isAuthLikePayload}=window.__rail12306;const MAX_PAGE_SIZE=50;
__webcliRegisterCommand("orders",async (kwargs = {}) => {

        const include = boolean(kwargs['include-sensitive']);
        const orderPage = 'https://kyfw.12306.cn/otn/view/train_order.html';
        if (location.origin !== 'https://kyfw.12306.cn') return navigate(orderPage);
        // A stale login tab can share a valid session established in another tab.
        // Verify the server, not the old tab's pathname or local cookie presence.
        const session = await window.__rail12306.json('/otn/index/initMy12306Api', {method:'POST'});
        if (session?.status !== true || !(session.data?.user_name || session.data?.userName || session.user_name)) {
            throw new CommandExecutionError('12306 server did not verify the account session; order state unknown.');
        }
        if (location.pathname !== '/otn/view/train_order.html') return navigate(orderPage);

        const json = await window.__rail12306.json('/otn/queryOrder/queryMyOrderNoComplete',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:"_json_att="});
        if (json?.__http) {
            if ([401, 403].includes(Number(json.__http))) {
                throw new AuthRequiredError('kyfw.12306.cn', '12306 orders requires a valid login session');
            }
            throw new CommandExecutionError(`12306 returned HTTP ${json.__http} for queryMyOrderNoComplete`);
        }
        if (json?.__parse) {
            throw new CommandExecutionError(`12306 orders returned non-JSON body: ${json.__parse}`);
        }
        if (isAuthLikePayload(json)) {
            throw new AuthRequiredError('kyfw.12306.cn', '12306 orders requires a valid login session');
        }
        if (json?.status !== true) {
            throw new CommandExecutionError('12306 queryMyOrderNoComplete returned a failure status');
        }
        let orders;
        if (Array.isArray(json?.data?.orderDBList)) {
            orders = json.data.orderDBList;
        } else if (Array.isArray(json?.data?.orderDTODataList)) {
            orders = json.data.orderDTODataList;
        } else if (Array.isArray(json?.data?.orders)) {
            orders = json.data.orders;
        } else if (Array.isArray(json?.data)) {
            orders = json.data;
        } else {
            const messages = [...(Array.isArray(json.messages) ? json.messages : []), json.message, json.msg];
            if (messages.some(message => /^(?:您|你)?(?:当前|暂时)?没有未完成(?:的)?订单[!！。.]?$/.test(String(message || '').trim()))) {
                throw new EmptyResultError('No in-progress 12306 orders on this account (explicit server message)');
            }
            // The official train_order page treats a successful no-data envelope as empty.
            // Its network-error handler renders the same text, so the DOM alone is insufficient.
            const successfulNoData = (json.data === undefined || json.data === null)
                && json.httpstatus === 200 && Array.isArray(json.messages) && json.messages.length === 0
                && json.validateMessages && typeof json.validateMessages === 'object'
                && !Array.isArray(json.validateMessages) && Object.keys(json.validateMessages).length === 0;
            if (successfulNoData) {
                for (let attempt = 0; attempt < 10; attempt++) {
                    const panel = document.querySelector('#not_complete');
                    if (panel && panel.getClientRects().length > 0
                        && String(panel.innerText || '').includes('您没有未完成的订单哦')
                        && !panel.querySelector('.order-item-table')) {
                        throw new EmptyResultError('12306 当前没有未完成订单（会话、成功响应及官方页面已核对）；不代表未出行或历史订单为空。');
                    }
                    if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            throw new CommandExecutionError('12306 queryMyOrderNoComplete payload missing order list array; data keys: '+Object.keys(json.data||{}).join(',')+'; flag: '+String(typeof json.data?.flag==='boolean'?json.data.flag:'unknown'));
        }
        if (orders.length === 0) {
            throw new EmptyResultError('No in-progress 12306 orders on this account');
        }
        return orders.map((o) => {
            const tickets = Array.isArray(o.tickets) ? o.tickets : [];
            const passengerNames = tickets
                .map((t) => t.passenger_name || '')
                .filter(Boolean)
                .map((name) => include ? name : maskChineseName(name))
                .join(', ');
            return {
                order_id: o.sequence_no || o.order_id || o.sequenceNo || '',
                order_date: o.order_date || '',
                train_code: o.train_code_page || o.station_train_code || o.train_code || '',
                from_station: o.from_station_name_page || o.from_station_name || '',
                to_station: o.to_station_name_page || o.to_station_name || '',
                departure: o.start_train_date_page || o.start_train_date || '',
                passengers: passengerNames,
                status: o.ticket_status_name || o.order_status_name || o.statusName || '',
                amount: o.ticket_total_price_page || o.ticket_total_price || '',
            };
        });
    });})();
