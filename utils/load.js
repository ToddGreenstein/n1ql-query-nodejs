'use strict';

// JSON Config file.  Grab elements from the
var config = require('./config');

// Require Faker.  This is to generate user profile data.
var faker = require('faker');

// Require Couchbase Module
var couchbase = require('couchbase');

// Setup Cluster Connection Object
var cluster = new couchbase.Cluster(config.application.connectionstring);

// Setup Bucket object to be reused within the code
var bucket = cluster.openBucket(config.couchbase.bucket,(err)=>{
  if (err) console.log("ERR OpenBucket:",err);
});

// Primary Index String
var primaryIndex = 'CREATE PRIMARY INDEX p1 ON ' + config.couchbase.bucket +
    ' WITH {"defer_build":true}';

// Secondary Index for finding unencrypted social security numbers
var ssnIndex = 'CREATE INDEX find_pii_ssn ON ' + config.couchbase.bucket +
    '(DISTINCT(ARRAY v FOR v IN TOKENS(SELF,{"specials": true}) end)) WHERE' +
    ' ANY v IN TOKENS(SELF, {"specials": true}) SATISFIES REGEXP_LIKE' +
    '(TO_STRING(v),"(\\\\d{3}-\\\\d{2}-\\\\d{4})|(\\\\b\\\\d{9}\\\\b)") END' +
    ' WITH {"defer_build":true}';

// Secondary index for finding unencrypted credit card numbers
var ccnIndex = 'CREATE INDEX find_pii_ccn ON ' + config.couchbase.bucket +
    '(DISTINCT (ARRAY v FOR v IN TOKENS(SELF,{"specials": true}) end)) WHERE' +
    ' ANY v IN TOKENS(SELF, {"specials": true}) SATISFIES REGEXP_LIKE(TO_STRING' +
    '(v),"(\\\\d{4}-\\\\d{4}-\\\\d{4}-\\\\d{4}))|(\\\\b\\\\d{16}\\\\b)") END' +
    ' WITH {"defer_build":true}';

var paymentsByUserIndex = 'CREATE INDEX `sum_payments_by_user` ON ' +
    config.couchbase.bucket + '(email, ARRAY_COUNT(ARRAY v.amount ' +
    'FOR v IN accountHistory WHEN v.type="payment" END), ARRAY_SUM' +
    '(ARRAY TONUMBER(v.amount) FOR v IN accountHistory WHEN ' +
    'v.type="payment" END)) WHERE email IS NOT MISSING WITH {"defer_build":true}';

var acctEntriesByUsersIndex = 'CREATE INDEX `find_acct_entries_by_user` ON '+
    config.couchbase.bucket + '(`email`,DISTINCT ARRAY v.type FOR v IN '+
    'accountHistory END, accountHistory) WITH {"defer_build":true}'

var rangeIndex = 'CREATE INDEX find_meta ON ' + config.couchbase.bucket +
    '(TONUMBER(LTRIM(meta().id,"test::"))) WITH {"defer_build":true}';

var counterIndex = 'CREATE INDEX counter_index ON ' + config.couchbase.bucket +
'((meta().id),self) WHERE (substr((meta().id), 0, 7) = "counter")' +
' WITH {"defer_build":true}';

var buildIndexString = 'BUILD INDEX ON ' + config.couchbase.bucket +
    '(p1,find_pii_ccn,find_pii_ssn,find_meta,sum_payments_by_user,' +
    'find_acct_entries_by_user,counter_index) USING GSI';

module.exports.attempt = function(){
  return new Promise(
    (resolve,reject) => {
      addAtomicCounterExampleDocs()
          .then(_ => defineIndex(primaryIndex, "PRIMARY"))
          .then(_ => defineIndex(ccnIndex, "find_pii_ccn"))
          .then(_ => defineIndex(ssnIndex, "find_pii_ssn"))
          .then(_ => defineIndex(rangeIndex, "find_meta"))
          .then(_ => defineIndex(counterIndex, "counter_index"))
          .then(_ => defineIndex(paymentsByUserIndex, 'sum_payments_by_user'))
          .then(_ => defineIndex(acctEntriesByUsersIndex, 'find_acct_entries_by_user'))
          .then(_ => preload())
          .then(_ => defineIndex(buildIndexString,'Deferred Indexes'))
          .then((status) => {
              console.log("Done");
              resolve();
          })
          .catch((err) => {
              console.log("ERR:", err)
              process.exit(0);
          });
    }
  )}

function defineIndex(indexQuery, indexName) {
    return new Promise(
        (resolve, reject) => {
            // Setup query to create index
            var q = couchbase.N1qlQuery.fromString(indexQuery);

            // Send the query
            bucket.query(q, (err, res) => {
                // Fires on error
                if (err){
                  console.log("ERR QUERY:",err);
                  reject(err);
                }

                // Fires when index created
                if (res) {
                    console.log("==== \n  Defined Index:" + indexName);
                    resolve();
                }
            });
        });
}

function addAtomicCounterExampleDocs(){
    return new Promise(
        (resolve, reject) => {
          bucket.counter("counter_US", 1, {initial: 500}, (err, res) => {
            if(res){
              bucket.counter("counter_EMEA", 1, {initial: 500}, (err, res) => {
                if(res){
                  console.log("==== \n  Added atomic counter:counter_US and counter_EMEA" );
                  resolve();
                }
              });
            }
          });
        });
      }

function preload() {
    return new Promise(
        (resolve, reject) => {
            var completed = 0;
            var runFlag = false;
            var startTime = process.hrtime();
            console.log("====  \n  Creating " +
            config.application.thresholdItemCount + " profiles...");

            // Function for upserting one document, during preload.  Notice,
            // this is only in scope for preload

            function upsertOne() {
                // First Check if the preloading is done
                if (completed >= config.application.thresholdItemCount && !runFlag) {
                    runFlag = true;
                    var time = process.hrtime(startTime);
                    console.log("====");
                    console.log("  Preloaded Bucket: " + parseInt((time[0] * 1000) +
                            (time[1] / 1000000)) + " ms for: " + completed +
                        " items");
                        resolve(true);
                } else {
                    if (completed <= config.application.thresholdItemCount) {

                        // Faker helper method to generate random user profile
                        var randomCard = faker.helpers.createCard();

                        // Upsert one document
                        bucket.upsert('test::' + completed,
                            randomCard,
                            function(err, res) {
                                // Fires on Error
                                if (err) reject(err);

                                // This will fire WHEN and only WHEN a callback is received.
                                if (res) {
                                    // Increment completed upserts count
                                    completed++;

                                    // Recursive call to insert
                                    upsertOne();
                                }
                            });
                    }
                }
            }
            // The loop that sets up a "buffer" of queued operations
            // This sets up a number of requests always in the buffer waiting to execute
            for (var i = 0; i < config.application.opsGroup; ++i) {
                upsertOne();
            }
        });
}
