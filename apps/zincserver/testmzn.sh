curl -X POST http://localhost:8080/flatten \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/plain' \
  -d @testmzn.json

curl -X POST http://localhost:8080/flatten \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d @testmzn.json
