#!/bin/bash

# install docker
curl -fsSL https://get.docker.com | sh

# coturn
docker run -d --network=host --name=coturn coturn/coturn \
  -n --log-file=stdout \
  --use-auth-secret --static-auth-secret="${TURN_SHARED_SECRET:?Defina TURN_SHARED_SECRET}" --fingerprint \
  --no-multicast-peers --no-cli \
  --no-tlsv1 --no-tlsv1_1 \
  --realm=webcine

