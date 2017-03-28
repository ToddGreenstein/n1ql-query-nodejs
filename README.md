# n1ql-query-nodejs
Couchbase nodejs user profile store builder with indexes and query samples
## REQUIREMENTS
- **Clone this repo**   
- **Get a Couchbase version >= 4.6.  Docker is the preferred way.  The couchbase image will need at least 4.5 gigs of memory**     
docker run -d --name=CB46 -p 8091-8094:8091-8094 -p 11207-11210:11207-11210 -p 18091-18094:18091-18094 couchbase/server:4.6.0

- **Once the container is running, this app will provision the couchbase instance with 250,000 user profiles, and build indexing**   
npm run build

## Schema
250,000 user profiles
```javascript
{   
    "name":  
    "username":    
    "email":    
    "address":{    
    "streetA":  
    "streetC":
    "streetD":
    "city":
    "state":
    "country":
    "zipcode":
    "geo": {
      "lat":
      "lng":
    }
  },
  "phone":
  "website":
  "company": {
    "name":
    "catchPhrase":
    "bs":
  },
  "posts": [
    {
      "words":
      "sentence":
      "sentences":
      "paragraph":
    },...
  ],
  "accountHistory": [
    {
      "amount":
      "date":
      "business":
      "name":
      "type":
      "account":
    },...
  ]
}
```
## Included N1QL Use Cases and Patterns
### Find Meta - Range Query Based on Keymask
 Query to return a range of 99 documents in order.
- **Index**
```sql
CREATE INDEX `find_meta` ON `default`(
    TO_NUMBER(LTRIM((meta().`id`), "test::")))
```
- **Query**
```sql
SELECT * FROM default
  WHERE TONUMBER(LTRIM(meta().id,"test::")) > 87000
      AND
    TONUMBER(LTRIM(meta().id,"test::")) < 87100
  ORDER BY TONUMBER(LTRIM(meta().id,"test::"));
```

### Find PII - Identify unecrypted PII stored in the database
Query to find social security numbers, credit card numbers stored unencrypted in the database
- **Indexes**
```sql
CREATE INDEX `find_pii_ssn` ON `default`(
  (DISTINCT (ARRAY `v` FOR `v` IN
    TOKENS(self, {"specials": true}) END)))
  WHERE ANY `v` IN
    TOKENS(self, {"specials": true}) SATISFIES REGEXP_LIKE(TO_STRING(`v`), "(\\d{3}-\\d{2}-\\d{4})|(\\b\\d{9}\\b)")
  END
--
CREATE INDEX `find_pii_ccn` ON `default`(
  (DISTINCT (ARRAY `v` FOR `v` IN
    TOKENS(self, {"specials": true}) END)))
  WHERE any `v` IN
    TOKENS(self, {"specials": true}) SATISFIES REGEXP_LIKE(TO_STRING(`v`), "(\\d{4}-\\d{4}-\\d{4}-\\d{4}))|(\\b\\d{16}\\b)")
  END
```
- **Query**
```sql
SELECT * FROM default
  WHERE ANY v IN
    TOKENS(default, {"specials":true}) SATISFIES
    REGEXP_LIKE(TOSTRING(v),'(\\d{3}-\\d{2}-\\d{4})|(\\b\\d{9}\\b)')
END
--
SELECT * FROM default
  WHERE ANY v IN
    TOKENS(default, {"specials":true}) SATISFIES
    REGEXP_LIKE(TOSTRING(v),'(\\d{4}-\\d{4}-\\d{4}-\\d{4}))|(\\b\\d{16}\\b)')
END
```    

### Find Invoices - Identify account entries of type invoices.
Query to flatten an array of account history and return account entries that are type invoice
- **Index**
```sql
CREATE INDEX `find_invoice_entries_by_user` ON
  `default`(email, DISTINCT ARRAY v.type FOR v IN accountHistory WHEN v.type = “invoice” END, accountHistory);
 ```
- **Query**
```sql
SELECT default.email, v.account, v.type, v.amount
  FROM default
  UNNEST accountHistory v
WHERE default.email IS NOT MISSING AND v.type='invoice'
```

### Sum Payments - Sum all amounts of type payments , and total count of payments made by each user.
Query to sum all amounts of an accountHistory type (in this case payments) and to provide a count of total entries per user matching this type
- **Index**
```sql
CREATE INDEX sum_payments_by_user on default(email,
  ARRAY_COUNT(ARRAY v.amount FOR v IN accountHistory WHEN v.type='payment' END) ,
  ARRAY_SUM(ARRAY TONUMBER(v.amount) FOR v IN accountHistory WHEN v.type='payment' END))
WHERE email IS NOT MISSING
```
- **Query**
```sql
SELECT email,
  ARRAY_COUNT(ARRAY v.amount FOR v IN accountHistory WHEN v.type='payment' END) count,
  ARRAY_SUM(ARRAY TONUMBER(v.amount) FOR v IN accountHistory WHEN v.type='payment' END) total
FROM default USE INDEX (sum_payments_by_user) WHERE email IS NOT MISSING
```
