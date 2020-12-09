# Postman Test Suite
First, install newman: `npm install -g newman`

Then, to run test suite:
```
newman run qa_collection.json --env-var primoGatewayApiUrl=your.api.here
```
