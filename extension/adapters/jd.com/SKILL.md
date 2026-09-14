# 京东

京东：导航主页、查看购物车、查看订单、购买商品、支付

Matches: jd.com, pc-settlement-lite-pro.pf.jd.com

> Requires authentication. User must be logged in to the website.

## Tools (8)

### jd.com.check_login_status

检测京东是否已登录。打开京东后应首先调用此工具确认登录状态，未登录时需提醒用户先登录。

### jd.com.search_products

Search for products on JD.com homepage by keyword. Fills the search box and submits the search. If currently on the homepage, it navigates to the search results page — call this tool again after 3-5 seconds to get the product list. If already on the search results page, it returns the parsed product list.

Parameters:

- `keyword`: string **(required)** — Search keyword (e.g.,

### jd.com.navigate_to_homepage

Navigate to the JD.com homepage. Use this before multi-step operations to ensure a clean starting state.

### jd.com.view_cart

View shopping cart. Navigates to the cart page from the homepage navigation bar. Returns cart URL and page status. Cart items parsing will be implemented after HTML structure is provided.

### jd.com.view_orders

View my orders. Navigates to the orders page and returns parsed order list including order ID, products, status, amount, and consignee. Supports both split orders (parent/child) and independent orders.

### jd.com.open_product

Open a product page by URL. Use this before buying a product.

Parameters:

- `url`: string **(required)** — Product page URL (e.g., https://item.jd.com/100054010576.html)

### jd.com.buy_now

Click the "立即购买" (Buy Now) button on the current product page. Must be on a product page (item.jd.com). Must wait at least 7 seconds after Open Product. Use jd.com.open_product first to navigate to a product page. After clicking, a checkout iframe will appear.

### jd.com.pay_now

Select payment method and click "立即支付" (Pay Now) button on the JD.com checkout confirmation page. Must be called after buy_now when the settlement page is open.

Parameters:

- `paymentMethod`: string **(required)** — Payment method to use. Options:
