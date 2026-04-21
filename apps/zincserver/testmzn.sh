curl -X POST http://localhost:8080/flatten \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/plain' \
  -d @testmzn.json | jq

curl -X POST http://localhost:8080/flatten \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d @testmzn.json | jq

curl http://localhost:8080/solvers | jq
