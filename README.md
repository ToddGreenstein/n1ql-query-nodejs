# n1ql-query-nodejs
Couchbase nodejs user profile store builder with indexes and query samples in a docker-compose
environment
## REQUIREMENTS
- **Clone this repo**   
- **docker-compose version 1.11 (support for version 3 yml) or greater**   
- **To run and build in one command**   
docker-compose up --build -d

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

### Sum of two atomic counter documents, using KEYS
Query to sum two atomic counter documents, using their keys only.  
- **Query**
```sql
SELECT RAW array_sum((SELECT RAW totalCount
    FROM default totalCount USE KEYS [ "counter_US", "counter_EMEA" ]));
--OR
SELECT array_sum((SELECT RAW totalCount FROM default as totalCount where meta().id in ["counter_US", "counter_EMEA"]));
```

### Sum of two atomic counter documents, using a secondary index
Deterministic query using a keymask to sum N number of atomic counter documents.  
- **Index**
```sql
CREATE INDEX counter_index ON default((meta().id),self) WHERE (SUBSTR((meta().id), 0, 7) = "counter")
```
- **Query**
```sql
--(requires an index due to https://issues.couchbase.com/browse/MB-23897)
SELECT RAW SUM(totalCount) FROM default as totalCount WHERE SUBSTR(meta().id,0,7)=="counter";
```
