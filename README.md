# n1ql-query-nodejs
Couchbase nodejs user profile store builder with indexes and query samples

## REQUIREMENTS
- **Clone this repo**   
- **Get a Couchbase version >= 4.6.  Docker is the preferred way.  The couchbase image will need at least 4.5 gigs of memory**     
docker run -d --name=CB46 -p 8091-8094:8091-8094 -p 11207-11210:11207-11210 -p 18091-18094:18091-18094 couchbase/server:4.6.0

- **Once the container is running, this app will provision the couchbase instance with 250,000 user profiles, and build indexing**   
npm run build
