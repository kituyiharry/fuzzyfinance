curl http://localhost:8080/solvers | jq

printf "\n"

curl -X POST http://localhost:8080/flatten \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/plain' \
  -d @testmzn.json 

printf "\n"

curl -X POST http://localhost:8080/flatten \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d @testmzn.json | jq

printf "\n"

curl -X POST http://localhost:8080/flatten/batch \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d @testmultimzn.json  | jq

