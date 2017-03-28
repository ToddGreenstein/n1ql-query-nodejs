## uncomment to delete all containers ## docker rm -f $(docker ps -a -q)
docker run -d --name=CB46 -p 8091-8094:8091-8094 -p 11207-11210:11207-11210 -p 18091-18094:18091-18094 couchbase/server:4.6.1
sleep 10
npm run build
