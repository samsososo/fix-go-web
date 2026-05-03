# Deep UI QA Report

- Run ID: `94754685`
- Base URL: `http://localhost:3002`
- Locale tested: `zh-HK`
- Request title: `Deep QA 冷氣測試 94754685`
- Request ID: `req_qa3yf0hq`
- Booking ID: `booking_46vym9sg`
- Passed steps: `31`
- Failed steps: `0`

## Step Results

| Area     | Step                                      | Status | Detail                                                                              |
| -------- | ----------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| guest    | Public home                               | passed | Opened the public homepage without routing errors                                   |
| guest    | Header navigation                         | passed | Clicked through all primary desktop public navigation links                         |
| guest    | Locale switch                             | passed | Switched to English and back without generating duplicated locale segments          |
| guest    | Auth entry points                         | passed | Opened auth hub, login, and signup pages from desktop navigation                    |
| guest    | Duplicated locale normalization           | passed | Direct access to a duplicated locale URL normalized before auth redirect            |
| guest    | Protected route redirects                 | passed | Guest access to customer, pro, and admin areas redirected to login                  |
| mobile   | Public navigation menu                    | passed | Opened the mobile menu and navigated through public pages                           |
| customer | Login                                     | passed | Customer signed in and landed on the dashboard                                      |
| customer | Workspace CTA                             | passed | Header workspace button opened the customer portal without duplicated locale        |
| customer | Portal navigation                         | passed | Clicked every customer portal navigation entry and loaded each page                 |
| customer | Create request                            | passed | Filled the request form, interacted with all key inputs, and reached request detail |
| customer | Logout                                    | passed | Customer session closed cleanly                                                     |
| pro      | Login                                     | passed | Professional signed in and landed on the pro dashboard                              |
| pro      | Workspace CTA                             | passed | Header workspace button opened the pro portal without duplicated locale             |
| pro      | Portal navigation                         | passed | Clicked every pro portal navigation entry and loaded each page                      |
| pro      | Profile save                              | passed | Professional profile page accepted input and saved successfully                     |
| pro      | Lead detail                               | passed | Matched lead card opened correctly and quote form inputs were interactive           |
| pro      | Logout                                    | passed | Professional session closed after quoting                                           |
| customer | Review quote                              | passed | Customer reopened request detail and saw the incoming professional quote            |
| customer | Accept quote and order detail             | passed | Customer accepted the quote, opened orders, and entered booking detail              |
| customer | Messages page                             | passed | Customer notification centre remained reachable after booking creation              |
| customer | Logout after acceptance                   | passed | Customer session closed after booking acceptance                                    |
| admin    | Login                                     | passed | Admin signed in and landed on the operations dashboard                              |
| admin    | Workspace CTA                             | passed | Header workspace button opened the admin portal without duplicated locale           |
| admin    | Portal navigation                         | passed | Clicked every admin portal navigation entry and loaded each page                    |
| admin    | Request, customer, pro, and quote details | passed | Admin opened all linked detail pages from the newly created marketplace records     |
| admin    | Logout                                    | passed | Admin session closed cleanly                                                        |
| pro      | Job status progression                    | passed | Professional reopened the accepted job and advanced it to completed                 |
| pro      | Logout after delivery                     | passed | Professional session closed after delivery updates                                  |
| customer | Final booking verification                | passed | Customer verified completed booking detail and updated notifications                |
| customer | Final logout                              | passed | Customer session closed after final verification                                    |
