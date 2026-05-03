# Role Flow QA Report

- Run ID: `96234389`
- Base URL: `http://localhost:3002`
- Locale tested: `zh-HK`
- Request title: `QA 冷氣測試 96234389`
- Request ID: `req_h9p5wr29`
- Booking ID: `booking_51c3m9of`
- Passed steps: `24`
- Failed steps: `0`

## Step Results

| Role     | Step                  | Status | Detail                                                                       |
| -------- | --------------------- | ------ | ---------------------------------------------------------------------------- |
| customer | Auth hub              | passed | Opened the auth overview page                                                |
| customer | Login                 | passed | Logged in with seeded customer account                                       |
| customer | Create request        | passed | Created a new aircon request in Kwun Tong district                           |
| customer | Logout                | passed | Logged out after request submission                                          |
| pro      | Login                 | passed | Logged in with seeded professional account                                   |
| pro      | Profile save          | passed | Saved the professional profile successfully                                  |
| pro      | Lead discovery        | passed | Found the newly created request in matched leads                             |
| pro      | Send quote            | passed | Submitted a structured quote for the customer request                        |
| pro      | Logout                | passed | Logged out after quoting                                                     |
| customer | Login to review quote | passed | Returned to the customer workspace to review incoming quote                  |
| customer | Accept quote          | passed | Accepted the quote and created a booking                                     |
| customer | Messages              | passed | Verified customer notifications page loads after booking acceptance          |
| customer | Logout                | passed | Logged out after accepting the quote                                         |
| admin    | Login                 | passed | Logged in with the internal admin account                                    |
| admin    | Request review        | passed | Opened the new request and applied a manual scheduled status with admin note |
| admin    | Customer detail       | passed | Opened the admin customer detail page for the request owner                  |
| admin    | Pro detail            | passed | Opened the admin professional detail page for the quoting professional       |
| admin    | Quote detail          | passed | Opened the admin quote detail page for the generated quote                   |
| admin    | Logout                | passed | Logged out after ops verification                                            |
| pro      | Login for delivery    | passed | Logged back in as the professional to update booking progress                |
| pro      | Job progress          | passed | Moved the booking from scheduled to in progress and then completed           |
| pro      | Logout                | passed | Logged out after marking the job completed                                   |
| customer | Final verification    | passed | Confirmed the completed order timeline and notifications                     |
| customer | Logout                | passed | Logged out after final customer validation                                   |
